import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Structural (no-DB) guard over the F2 forward-only convergence migration.
// It proves the migration honours the Adendo rules purely from its text, so the
// suite fails loudly the moment someone edits the file into a destructive or
// non-idempotent shape — even when the Lab database is unreachable.

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = resolve(
  HERE,
  '../../supabase/migrations/20260826000000_channel_secret_expansion_backfill.sql',
);

const sql = readFileSync(MIGRATION_PATH, 'utf8');
const normalized = sql.replace(/\s+/g, ' ');
// Executable DDL only: strip `--` line comments so assertions about what the
// migration DOES are not fooled by the CONTEXTO block that documents, in prose,
// the destructive drops this migration deliberately AVOIDS.
const executableSql = sql.replace(/--[^\n]*/g, '');

describe('F2 — channel secret expansion migration (structural)', () => {
  it('is wrapped in a single BEGIN/COMMIT transaction', () => {
    expect(sql).toMatch(/^\s*(--[^\n]*\n|\n)*BEGIN;/);
    expect(sql.trimEnd().endsWith('COMMIT;')).toBe(true);
    expect(sql.match(/\bBEGIN;/g)?.length).toBe(1);
    expect(sql.match(/\bCOMMIT;/g)?.length).toBe(1);
  });

  it('adds both contract columns idempotently with NOT NULL defaults', () => {
    expect(normalized).toContain(
      "ADD COLUMN IF NOT EXISTS secret_kind TEXT NOT NULL DEFAULT 'meta_bearer_token'",
    );
    expect(normalized).toContain(
      "ADD COLUMN IF NOT EXISTS secret_payload JSONB NOT NULL DEFAULT '{}'::jsonb",
    );
  });

  it('creates the unique (channel_connection_id, secret_kind) only when absent', () => {
    expect(normalized).toContain("conname = 'uq_channel_secrets_conn_kind'");
    expect(normalized).toMatch(
      /ADD CONSTRAINT uq_channel_secrets_conn_kind\s+UNIQUE \(channel_connection_id, secret_kind\)/,
    );
    // Guarded by an IF NOT EXISTS check against pg_constraint.
    expect(normalized).toMatch(/IF NOT EXISTS \(\s*SELECT 1 FROM pg_constraint/);
  });

  it('creates the kind lookup index idempotently', () => {
    expect(normalized).toContain(
      'CREATE INDEX IF NOT EXISTS idx_channel_secrets_kind ON public.channel_connection_secrets(secret_kind)',
    );
  });

  it('backfills all three secret kinds from public_config', () => {
    expect(normalized).toContain("'meta_bearer_token'");
    expect(normalized).toContain("'meta_capi_token'");
    expect(normalized).toContain("'meta_webhook_verify_token'");
    expect(normalized).toContain("cc.public_config->>'_secret_token'");
    expect(normalized).toContain("cc.public_config->>'pageAccessToken'");
    expect(normalized).toContain("cc.public_config->>'metaAccessToken'");
    expect(normalized).toContain("cc.public_config->>'meta_capi_access_token'");
    expect(normalized).toContain("cc.public_config->>'verifyToken'");
  });

  it('never overwrites an already-migrated secret (ON CONFLICT DO NOTHING on every insert)', () => {
    const inserts = sql.match(/INSERT INTO public\.channel_connection_secrets/g) ?? [];
    const guards = sql.match(/ON CONFLICT \(channel_connection_id, secret_kind\) DO NOTHING/g) ?? [];
    expect(inserts.length).toBe(3);
    expect(guards.length).toBe(3);
  });

  it('skips empty legacy values so no secret is clobbered by blanks', () => {
    const emptyGuards = sql.match(/<> ''/g) ?? [];
    expect(emptyGuards.length).toBe(3);
  });

  it('converges only the two named legacy constraints and preserves all data/columns', () => {
    expect(executableSql).not.toMatch(/DROP\s+COLUMN/i);
    expect(executableSql).not.toMatch(/DROP\s+TABLE/i);
    expect(executableSql).not.toMatch(/DELETE\s+FROM/i);
    expect(executableSql).not.toMatch(/TRUNCATE/i);

    const droppedConstraints = [
      ...executableSql.matchAll(/DROP\s+CONSTRAINT(?:\s+IF\s+EXISTS)?\s+([a-zA-Z0-9_]+)/gi),
    ].map((match) => match[1]);
    expect(droppedConstraints).toEqual([
      'channel_connection_secrets_pkey',
      'ck_channel_secret_reference',
    ]);

    expect(normalized).toContain("legacy_pkey_definition = 'PRIMARY KEY (channel_connection_id)'");
    expect(executableSql).toMatch(/api_key_vault_secret_id IS NOT NULL/);
    expect(executableSql).toMatch(/webhook_vault_secret_id IS NOT NULL/);
    expect(executableSql).toMatch(/secret_payload <> '\{\}'::jsonb/);
  });

  it('does not touch grants or RLS', () => {
    expect(sql).not.toMatch(/\bGRANT\b/i);
    expect(sql).not.toMatch(/\bREVOKE\b/i);
    expect(sql).not.toMatch(/ROW LEVEL SECURITY/i);
    expect(sql).not.toMatch(/\bPOLICY\b/i);
  });
});
