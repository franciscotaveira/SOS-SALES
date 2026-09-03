import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dbPool, query } from '../../src/infrastructure/database/pool.js';

describe('P0 supervised WAHA outbound contract', () => {
  const workspaceId = randomUUID();
  const otherWorkspaceId = randomUUID();
  const ownerId = randomUUID();
  const operatorId = randomUUID();
  const outsiderId = randomUUID();
  const channelId = randomUUID();
  const metaChannelId = randomUUID();
  const contactId = randomUUID();
  const metaContactId = randomUUID();
  const journeyId = randomUUID();
  const metaJourneyId = randomUUID();

  async function asAuthenticated<T>(userId: string, action: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await dbPool.connect();
    try {
      await client.query('SET ROLE authenticated');
      await client.query(`SET "request.jwt.claim.role" = 'authenticated'`);
      await client.query(`SET "request.jwt.claim.sub" = '${userId}'`);
      return await action(client);
    } finally {
      await client.query('RESET ROLE');
      client.release();
    }
  }

  async function asService<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await dbPool.connect();
    try {
      await client.query('SET ROLE service_role');
      await client.query(`SET "request.jwt.claim.role" = 'service_role'`);
      return await action(client);
    } finally {
      await client.query('RESET ROLE');
      client.release();
    }
  }

  beforeAll(async () => {
    // The local Lab may have been initialized before this forward-only
    // migration existed. Apply the function replacement here so this DB-backed
    // contract exercises the same claim behavior required by the release.
    const migrationPath = fileURLToPath(new URL(
      '../../supabase/migrations/20260831000000_outbound_dispatch_expired_lease_reclaim.sql',
      import.meta.url,
    ));
    await query(await readFile(migrationPath, 'utf8'));
    await query(`INSERT INTO workspaces (id, name, slug, active) VALUES ($1, 'Outbound test', 'outbound-${workspaceId.slice(0, 8)}', true), ($2, 'Other tenant', 'other-${otherWorkspaceId.slice(0, 8)}', true)`, [workspaceId, otherWorkspaceId]);
    await query(`INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'operator')`, [workspaceId, ownerId, operatorId]);
    await query(`INSERT INTO channel_connections (id, workspace_id, provider, phone_number, name, public_config, status) VALUES ($1, $2, 'waha', '+55499991111', 'Outbound WAHA', '{}'::jsonb, 'CONNECTED')`, [channelId, workspaceId]);
    await query(`INSERT INTO channel_connections (id, workspace_id, provider, phone_number, name, public_config, status) VALUES ($1, $2, 'meta_cloud', '+55499993333', 'Outbound Meta', '{"phoneNumberId":"meta-phone-id"}'::jsonb, 'CONNECTED')`, [metaChannelId, workspaceId]);
    await query(`INSERT INTO contacts (id, workspace_id, phone, name) VALUES ($1, $2, '+55499992222', 'Outbound contact')`, [contactId, workspaceId]);
    await query(`INSERT INTO contacts (id, workspace_id, phone, name) VALUES ($1, $2, '+55499994444', 'Outbound Meta contact')`, [metaContactId, workspaceId]);
    await query(`INSERT INTO commercial_journeys (id, workspace_id, contact_id, channel_connection_id, status) VALUES ($1, $2, $3, $4, 'OPEN')`, [journeyId, workspaceId, contactId, channelId]);
    await query(`INSERT INTO commercial_journeys (id, workspace_id, contact_id, channel_connection_id, status) VALUES ($1, $2, $3, $4, 'OPEN')`, [metaJourneyId, workspaceId, metaContactId, metaChannelId]);
  });

  afterAll(async () => {
    const client = await dbPool.connect();
    try {
      await client.query("SELECT pg_catalog.set_config('sales_os.allow_redaction', 'true', false)");
      await client.query('DELETE FROM workspaces WHERE id IN ($1, $2)', [workspaceId, otherWorkspaceId]);
      await client.query("SELECT pg_catalog.set_config('sales_os.allow_redaction', 'false', false)");
    } finally {
      client.release();
      await dbPool.end();
    }
  });

  it('OUT-01: creates a text-only draft and requires explicit, idempotent human approval', async () => {
    const created = await asAuthenticated(operatorId, (client) => client.query(
      'SELECT public.create_outbound_draft($1, $2, $3, $4) AS result',
      [workspaceId, journeyId, 'Posso confirmar seu horário?', 'outbound-draft-0001'],
    ));
    const dispatchId = created.rows[0].result.dispatchId;
    expect(created.rows[0].result).toMatchObject({ status: 'DRAFT', idempotent: false });

    const approved = await asAuthenticated(operatorId, (client) => client.query(
      'SELECT public.approve_outbound_dispatch($1, $2, $3) AS result',
      [workspaceId, dispatchId, 'outbound-approve-0001'],
    ));
    expect(approved.rows[0].result).toMatchObject({ status: 'APPROVED', idempotent: false });
    const retry = await asAuthenticated(operatorId, (client) => client.query(
      'SELECT public.approve_outbound_dispatch($1, $2, $3) AS result',
      [workspaceId, dispatchId, 'outbound-approve-0001'],
    ));
    expect(retry.rows[0].result).toMatchObject({ status: 'APPROVED', idempotent: true });

    await expect(asService((client) => client.query(
      'SELECT public.claim_outbound_dispatch($1, $2, $3)', [dispatchId, 'outbound-worker', 60],
    ))).rejects.toThrow(/Outbound is disabled/);
  });

  it('OUT-02: rechecks both controls at claim time and never permits cross-tenant creation', async () => {
    const draft = await asAuthenticated(operatorId, (client) => client.query(
      'SELECT public.create_outbound_draft($1, $2, $3, $4) AS result',
      [workspaceId, journeyId, 'Sua vaga continua disponível.', 'outbound-draft-0002'],
    ));
    const dispatchId = draft.rows[0].result.dispatchId;
    await asAuthenticated(ownerId, (client) => client.query(
      'SELECT public.set_workspace_outbound_control($1, true, $2, $3)', [workspaceId, 'Homologação supervisionada', 'workspace-outbound-0001'],
    ));
    await asAuthenticated(ownerId, (client) => client.query(
      'SELECT public.set_channel_outbound_control($1, $2, true, $3, $4)', [workspaceId, channelId, 'Homologação supervisionada', 'channel-outbound-0001'],
    ));
    await asAuthenticated(operatorId, (client) => client.query(
      'SELECT public.approve_outbound_dispatch($1, $2, $3)', [workspaceId, dispatchId, 'outbound-approve-0002'],
    ));
    const claimed = await asService((client) => client.query(
      'SELECT public.claim_outbound_dispatch($1, $2, $3) AS result', [dispatchId, 'outbound-worker', 60],
    ));
    expect(claimed.rows[0].result).toMatchObject({ dispatchId, channelConnectionId: channelId, contactId });
    const accepted = await asService((client) => client.query(
      'SELECT public.record_outbound_provider_acceptance($1, $2, $3, $4) AS result',
      [dispatchId, claimed.rows[0].result.claimToken, 'outbound-worker', 'waha-provider-message-0002'],
    ));
    expect(accepted.rows[0].result).toMatchObject({ dispatchId, status: 'ACCEPTED', idempotent: false });
    const message = await query(
      `SELECT m.direction, m.sender_type, m.text_content, e.status
       FROM conversation_messages m
       JOIN conversation_message_events e ON e.message_id = m.id AND e.workspace_id = m.workspace_id
       WHERE m.channel_connection_id = $1 AND m.provider_message_id = $2`,
      [channelId, 'waha-provider-message-0002'],
    );
    expect(message.rows).toHaveLength(1);
    expect(message.rows[0]).toMatchObject({ direction: 'outbound', sender_type: 'operator', text_content: 'Sua vaga continua disponível.', status: 'SENT' });

    await expect(asAuthenticated(outsiderId, (client) => client.query(
      'SELECT public.create_outbound_draft($1, $2, $3, $4)', [workspaceId, journeyId, 'Tentativa indevida', 'outbound-cross-tenant-0001'],
    ))).rejects.toThrow(/Unauthorized workspace operation/);
  });

  it('OUT-03: claims a connected Meta Cloud dispatch without changing the selected provider', async () => {
    const draft = await asAuthenticated(operatorId, (client) => client.query(
      'SELECT public.create_outbound_draft($1, $2, $3, $4) AS result',
      [workspaceId, metaJourneyId, 'Mensagem pelo número oficial.', 'outbound-meta-draft-0001'],
    ));
    const dispatchId = draft.rows[0].result.dispatchId;
    await asAuthenticated(operatorId, (client) => client.query(
      'SELECT public.approve_outbound_dispatch($1, $2, $3)',
      [workspaceId, dispatchId, 'outbound-meta-approve-0001'],
    ));
    await asAuthenticated(ownerId, (client) => client.query(
      'SELECT public.set_channel_outbound_control($1, $2, true, $3, $4)',
      [workspaceId, metaChannelId, 'Homologação Meta Cloud', 'channel-meta-outbound-0001'],
    ));

    const claimed = await asService((client) => client.query(
      'SELECT public.claim_outbound_dispatch($1, $2, $3) AS result',
      [dispatchId, 'meta-outbound-worker', 60],
    ));
    expect(claimed.rows[0].result).toMatchObject({
      dispatchId,
      channelConnectionId: metaChannelId,
      contactId: metaContactId,
    });
  });

  it('OUT-04: fences an active claim but lets a new worker reclaim an expired lease with a new token', async () => {
    const draft = await asAuthenticated(operatorId, (client) => client.query(
      'SELECT public.create_outbound_draft($1, $2, $3, $4) AS result',
      [workspaceId, journeyId, 'Recuperação de lease supervisionada.', 'outbound-lease-draft-0001'],
    ));
    const dispatchId = draft.rows[0].result.dispatchId;
    await asAuthenticated(operatorId, (client) => client.query(
      'SELECT public.approve_outbound_dispatch($1, $2, $3)',
      [workspaceId, dispatchId, 'outbound-lease-approve-0001'],
    ));

    const firstClaim = await asService((client) => client.query(
      'SELECT public.claim_outbound_dispatch($1, $2, $3) AS result',
      [dispatchId, 'lease-worker-one', 60],
    ));
    const firstToken = firstClaim.rows[0].result.claimToken;

    await expect(asService((client) => client.query(
      'SELECT public.claim_outbound_dispatch($1, $2, $3)',
      [dispatchId, 'lease-worker-two', 60],
    ))).rejects.toThrow(/active claim is still valid/);

    await query(
      `UPDATE public.outbound_dispatches
       SET claim_expires_at = NOW() - INTERVAL '1 second'
       WHERE id = $1`,
      [dispatchId],
    );

    const reclaimed = await asService((client) => client.query(
      'SELECT public.claim_outbound_dispatch($1, $2, $3) AS result',
      [dispatchId, 'lease-worker-two', 60],
    ));
    expect(reclaimed.rows[0].result).toMatchObject({ dispatchId });
    expect(reclaimed.rows[0].result.claimToken).not.toBe(firstToken);

    const audit = await query(
      `SELECT detail->>'reclaimedExpiredLease' AS reclaimed
       FROM public.outbound_dispatch_events
       WHERE outbound_dispatch_id = $1 AND worker_id = 'lease-worker-two'
       ORDER BY created_at DESC LIMIT 1`,
      [dispatchId],
    );
    expect(audit.rows[0]).toEqual({ reclaimed: 'true' });
  });
});
