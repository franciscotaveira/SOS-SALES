import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { PoolClient } from 'pg';
import { dbPool, checkDatabaseHealth } from '../../src/infrastructure/database/pool.js';

// DB-backed proof for the F2 forward-only convergence migration
// (20260826000000_channel_secret_expansion_backfill.sql). Every case runs inside
// a single BEGIN/ROLLBACK transaction on a dedicated pooled client, so nothing it
// seeds is ever committed — no persisted row is created, changed or deleted.
//
// It exercises the six required scenarios end-to-end against real Postgres:
//   empty/no-token, legacy-with-token, already-migrated, double-run,
//   two-kinds-same-connection, and no-token-exposed.

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = resolve(
  HERE,
  '../../supabase/migrations/20260826000000_channel_secret_expansion_backfill.sql',
);

// Strip the migration's own transaction wrapper so its body can run inside the
// test's BEGIN/ROLLBACK. `BEGIN;` (with a semicolon) is the transaction opener;
// the plpgsql DO block uses a bare `BEGIN` (no semicolon) and is left untouched.
const MIGRATION_BODY = readFileSync(MIGRATION_PATH, 'utf8')
  .replace(/\bBEGIN;/, '')
  .replace(/\bCOMMIT;\s*$/, '');

// A fixed, obviously-fake Lab stub — never a real credential.
const BEARER_TOKEN = 'lab-stub-bearer-1a2b3c';
const CAPI_TOKEN = 'lab-stub-capi-4d5e6f';
const VERIFY_TOKEN = 'lab-stub-verify-7g8h9i';

const CONN_A = 'b2f00000-0000-0000-0000-0000000000a1';
const CONN_B = 'b2f00000-0000-0000-0000-0000000000b2';

async function withRolledBackTx(fn: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = (await dbPool.connect()) as PoolClient;
  try {
    await client.query('BEGIN');
    await fn(client);
  } finally {
    // The whole fixture is discarded — assertions run only on in-flight state.
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

// Reproduce the historical post-20260817000009 / 20260822091851 shape of the
// secret table (vault columns + their CHECK dropped, single-column pkey replaced
// by the (channel_connection_id, secret_kind) uniqueness) so the convergence
// migration can insert vault-less rows deterministically regardless of how many
// historical migrations the connected Lab database happens to have applied.
//
// It also drops ck_channel_public_config_no_secrets from channel_connections:
// that CHECK is added by 20260822110000 AFTER the v2.0 API bundle is live and
// forbids the five legacy secret keys in public_config. F2 (20260826000000)
// exists precisely for the PRE-contract state QA ISSUE-007 reported — secret_kind
// still absent, legacy tokens still in public_config, that CHECK not yet applied —
// so the fixture must recreate that state to seed the tokens F2 backfills.
// Purely test-local DDL: it runs inside the transaction and is rolled back.
async function reproduceConvergedSecretShape(client: PoolClient): Promise<void> {
  await client.query(
    'ALTER TABLE public.channel_connections DROP CONSTRAINT IF EXISTS ck_channel_public_config_no_secrets;',
  );
  await client.query(
    'ALTER TABLE public.channel_connection_secrets DROP CONSTRAINT IF EXISTS ck_channel_secret_reference;',
  );
  await client.query(
    'ALTER TABLE public.channel_connection_secrets DROP CONSTRAINT IF EXISTS channel_connection_secrets_pkey;',
  );
  await client.query(
    'ALTER TABLE public.channel_connection_secrets DROP COLUMN IF EXISTS api_key_vault_secret_id;',
  );
  await client.query(
    'ALTER TABLE public.channel_connection_secrets DROP COLUMN IF EXISTS webhook_vault_secret_id;',
  );
}

// Ensure the contract columns / uniqueness / index exist before we seed, then
// return with a schema the "act" (a second body run) can converge over.
async function prepareSchema(client: PoolClient): Promise<void> {
  await reproduceConvergedSecretShape(client);
  await client.query(MIGRATION_BODY);
}

// Reproduz exatamente o contrato legado observado na producao: uma linha por
// canal, referencias Vault opcionais e CHECK exigindo ao menos uma delas. Isso
// protege a migration contra regressao no caminho real de upgrade do VPS.
async function reproduceProductionLegacySecretShape(client: PoolClient): Promise<void> {
  await client.query(
    'ALTER TABLE public.channel_connections DROP CONSTRAINT IF EXISTS ck_channel_public_config_no_secrets;',
  );
  await client.query(
    'ALTER TABLE public.channel_connection_secrets DROP CONSTRAINT IF EXISTS ck_channel_secret_reference;',
  );
  await client.query(
    'ALTER TABLE public.channel_connection_secrets DROP CONSTRAINT IF EXISTS uq_channel_secrets_conn_kind;',
  );
  await client.query(
    'ALTER TABLE public.channel_connection_secrets DROP CONSTRAINT IF EXISTS channel_connection_secrets_pkey;',
  );
  // A fixture precisa partir da mesma contagem observada em producao (zero
  // secrets). O DELETE existe apenas nesta transacao de teste e sera revertido.
  await client.query('DELETE FROM public.channel_connection_secrets;');
  await client.query('DROP INDEX IF EXISTS public.idx_channel_secrets_kind;');
  await client.query(
    'ALTER TABLE public.channel_connection_secrets DROP COLUMN IF EXISTS secret_payload;',
  );
  await client.query(
    'ALTER TABLE public.channel_connection_secrets DROP COLUMN IF EXISTS secret_kind;',
  );
  await client.query(
    'ALTER TABLE public.channel_connection_secrets ADD COLUMN IF NOT EXISTS api_key_vault_secret_id UUID;',
  );
  await client.query(
    'ALTER TABLE public.channel_connection_secrets ADD COLUMN IF NOT EXISTS webhook_vault_secret_id UUID;',
  );
  await client.query(
    'ALTER TABLE public.channel_connection_secrets ADD CONSTRAINT channel_connection_secrets_pkey PRIMARY KEY (channel_connection_id);',
  );
  await client.query(
    `ALTER TABLE public.channel_connection_secrets
       ADD CONSTRAINT ck_channel_secret_reference CHECK (
         api_key_vault_secret_id IS NOT NULL OR webhook_vault_secret_id IS NOT NULL
       );`,
  );
}

async function seedConnection(
  client: PoolClient,
  workspaceId: string,
  connectionId: string,
  publicConfig: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO public.channel_connections
       (id, workspace_id, provider, phone_number, name, status, public_config)
     VALUES ($1, $2, 'meta_cloud', '+550000000000', 'F2 fixture', 'DISCONNECTED', $3::jsonb)`,
    [connectionId, workspaceId, JSON.stringify(publicConfig)],
  );
}

async function readSecrets(
  client: PoolClient,
  connectionId: string,
): Promise<Array<{ secret_kind: string; secret_payload: Record<string, unknown> }>> {
  const res = await client.query(
    `SELECT secret_kind, secret_payload
       FROM public.channel_connection_secrets
      WHERE channel_connection_id = $1
      ORDER BY secret_kind`,
    [connectionId],
  );
  return res.rows;
}

describe('F2 — channel secret expansion migration (DB-backed)', () => {
  let workspaceId: string;

  beforeAll(async () => {
    const healthy = await checkDatabaseHealth();
    // When the Lab database is unreachable this fails loudly and the whole suite
    // is reported BLOCKED — never silently green.
    expect(healthy).toBe(true);

    const ws = await dbPool.query('SELECT id FROM public.workspaces LIMIT 1');
    expect(ws.rowCount).toBeGreaterThanOrEqual(1);
    workspaceId = ws.rows[0].id;
  });

  afterAll(async () => {
    await dbPool.end();
  });

  it('upgrades the exact production legacy shape without removing Vault columns', async () => {
    await withRolledBackTx(async (client) => {
      await reproduceProductionLegacySecretShape(client);
      await seedConnection(client, workspaceId, CONN_B, {
        _secret_token: BEARER_TOKEN,
        metaAccessToken: CAPI_TOKEN,
        verifyToken: VERIFY_TOKEN,
      });

      await client.query(MIGRATION_BODY);

      const columns = await client.query(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'channel_connection_secrets'`,
      );
      const names = columns.rows.map((row) => row.column_name);
      expect(names).toContain('api_key_vault_secret_id');
      expect(names).toContain('webhook_vault_secret_id');
      expect(names).toContain('secret_kind');
      expect(names).toContain('secret_payload');

      const constraints = await client.query(
        `SELECT conname, pg_get_constraintdef(oid) AS definition
           FROM pg_constraint
          WHERE conrelid = 'public.channel_connection_secrets'::regclass`,
      );
      const byName = new Map(constraints.rows.map((row) => [row.conname, row.definition]));
      expect(byName.has('channel_connection_secrets_pkey')).toBe(false);
      expect(byName.get('uq_channel_secrets_conn_kind')).toContain(
        'UNIQUE (channel_connection_id, secret_kind)',
      );
      expect(byName.get('ck_channel_secret_reference')).toContain('secret_payload');
      expect(byName.get('ck_channel_secret_reference')).toContain('api_key_vault_secret_id');

      const secrets = await readSecrets(client, CONN_B);
      expect(secrets.map((secret) => secret.secret_kind)).toEqual([
        'meta_bearer_token',
        'meta_capi_token',
        'meta_webhook_verify_token',
      ]);
    });
  });

  it('inserts nothing when the connection carries no legacy tokens', async () => {
    await withRolledBackTx(async (client) => {
      await prepareSchema(client);
      await seedConnection(client, workspaceId, CONN_A, {});

      await client.query(MIGRATION_BODY);

      expect(await readSecrets(client, CONN_A)).toHaveLength(0);
    });
  });

  it('converges a legacy bearer token into meta_bearer_token', async () => {
    await withRolledBackTx(async (client) => {
      await prepareSchema(client);
      await seedConnection(client, workspaceId, CONN_A, { _secret_token: BEARER_TOKEN });

      await client.query(MIGRATION_BODY);

      const secrets = await readSecrets(client, CONN_A);
      expect(secrets).toHaveLength(1);
      expect(secrets[0].secret_kind).toBe('meta_bearer_token');
      expect(secrets[0].secret_payload.accessToken).toBe(BEARER_TOKEN);
    });
  });

  it('never overwrites an already-migrated secret', async () => {
    await withRolledBackTx(async (client) => {
      await prepareSchema(client);
      await seedConnection(client, workspaceId, CONN_A, { _secret_token: 'NEW-MUST-BE-IGNORED' });
      // A secret already migrated by a prior run of the historical mechanism.
      await client.query(
        `INSERT INTO public.channel_connection_secrets
           (channel_connection_id, workspace_id, secret_kind, secret_payload)
         VALUES ($1, $2, 'meta_bearer_token', $3::jsonb)`,
        [CONN_A, workspaceId, JSON.stringify({ accessToken: 'PRE-EXISTING' })],
      );

      await client.query(MIGRATION_BODY);

      const secrets = await readSecrets(client, CONN_A);
      expect(secrets).toHaveLength(1);
      expect(secrets[0].secret_payload.accessToken).toBe('PRE-EXISTING');
    });
  });

  it('is idempotent across repeated runs (double-run yields one row per kind)', async () => {
    await withRolledBackTx(async (client) => {
      await prepareSchema(client);
      await seedConnection(client, workspaceId, CONN_A, { _secret_token: BEARER_TOKEN });

      await client.query(MIGRATION_BODY);
      await client.query(MIGRATION_BODY);

      const secrets = await readSecrets(client, CONN_A);
      expect(secrets).toHaveLength(1);
      expect(secrets[0].secret_payload.accessToken).toBe(BEARER_TOKEN);
    });
  });

  it('backfills the three distinct kinds for a single connection', async () => {
    await withRolledBackTx(async (client) => {
      await prepareSchema(client);
      await seedConnection(client, workspaceId, CONN_B, {
        _secret_token: BEARER_TOKEN,
        metaAccessToken: CAPI_TOKEN,
        verifyToken: VERIFY_TOKEN,
      });

      await client.query(MIGRATION_BODY);

      const secrets = await readSecrets(client, CONN_B);
      expect(secrets.map((s) => s.secret_kind)).toEqual([
        'meta_bearer_token',
        'meta_capi_token',
        'meta_webhook_verify_token',
      ]);
      const byKind = new Map(secrets.map((s) => [s.secret_kind, s.secret_payload]));
      expect(byKind.get('meta_bearer_token')?.accessToken).toBe(BEARER_TOKEN);
      expect(byKind.get('meta_capi_token')?.accessToken).toBe(CAPI_TOKEN);
      expect(byKind.get('meta_webhook_verify_token')?.verifyToken).toBe(VERIFY_TOKEN);
    });
  });

  it('keeps the credential only inside secret_payload — never leaked to another column', async () => {
    await withRolledBackTx(async (client) => {
      await prepareSchema(client);
      await seedConnection(client, workspaceId, CONN_A, { _secret_token: BEARER_TOKEN });

      await client.query(MIGRATION_BODY);

      const full = await client.query(
        'SELECT * FROM public.channel_connection_secrets WHERE channel_connection_id = $1',
        [CONN_A],
      );
      expect(full.rowCount).toBe(1);
      const row = full.rows[0] as Record<string, unknown>;
      for (const [column, value] of Object.entries(row)) {
        if (column === 'secret_payload') continue;
        expect(JSON.stringify(value ?? '')).not.toContain(BEARER_TOKEN);
      }
      // The plaintext lives exactly where the contract puts it.
      expect((row.secret_payload as Record<string, unknown>).accessToken).toBe(BEARER_TOKEN);
    });
  });
});
