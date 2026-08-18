import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { dbPool, query } from '../../src/infrastructure/database/pool.js';

describe('P0 cockpit operations', () => {
  const workspaceId = 'f0000000-0000-0000-0000-000000000001';
  const ownerId = 'f0100000-0000-0000-0000-000000000001';
  const operatorId = 'f0100000-0000-0000-0000-000000000002';
  const viewerId = 'f0100000-0000-0000-0000-000000000003';
  const channelId = 'f0200000-0000-0000-0000-000000000001';
  const contactId = 'f0300000-0000-0000-0000-000000000001';
  const journeyId = 'f0400000-0000-0000-0000-000000000001';

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

  beforeAll(async () => {
    const client = await dbPool.connect();
    try {
      await client.query("SELECT pg_catalog.set_config('sales_os.allow_redaction', 'true', false)");
      await client.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
      await client.query("SELECT pg_catalog.set_config('sales_os.allow_redaction', 'false', false)");
    } finally {
      client.release();
    }
    await query(`INSERT INTO workspaces (id, name, slug, active) VALUES ($1, 'Cockpit test', 'cockpit-test', true)`, [workspaceId]);
    await query(`INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'operator'), ($1, $4, 'viewer')`, [workspaceId, ownerId, operatorId, viewerId]);
    await query(`INSERT INTO channel_connections (id, workspace_id, provider, phone_number, name, public_config) VALUES ($1, $2, 'waha', '+5549999000000', 'Cockpit test channel', '{}'::jsonb)`, [channelId, workspaceId]);
    await query(`INSERT INTO contacts (id, workspace_id, phone, name) VALUES ($1, $2, '+5549999000001', 'Cockpit test contact')`, [contactId, workspaceId]);
    await query(`INSERT INTO commercial_journeys (id, workspace_id, contact_id, channel_connection_id, status) VALUES ($1, $2, $3, $4, 'OPEN')`, [journeyId, workspaceId, contactId, channelId]);
  });

  afterAll(async () => {
    const client = await dbPool.connect();
    try {
      await client.query("SELECT pg_catalog.set_config('sales_os.allow_redaction', 'true', false)");
      await client.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
      await client.query("SELECT pg_catalog.set_config('sales_os.allow_redaction', 'false', false)");
    } finally {
      client.release();
      await dbPool.end();
    }
  });

  it('COP-01: changes pipeline stage only through the guarded, idempotent RPC', async () => {
    const first = await asAuthenticated(operatorId, (client) => client.query(
      'SELECT public.set_journey_pipeline_stage($1, $2, $3, $4, $5) AS result',
      [workspaceId, journeyId, 'CONTACTED', 'Operador iniciou o contato', 'stage-change-0001'],
    ));
    expect(first.rows[0].result).toMatchObject({ stage: 'CONTACTED', idempotent: false });

    const retry = await asAuthenticated(operatorId, (client) => client.query(
      'SELECT public.set_journey_pipeline_stage($1, $2, $3, $4, $5) AS result',
      [workspaceId, journeyId, 'QUALIFIED', 'Ignored by idempotency', 'stage-change-0001'],
    ));
    expect(retry.rows[0].result).toMatchObject({ stage: 'CONTACTED', idempotent: true });

    const direct = await asAuthenticated(operatorId, (client) => client.query(
      "UPDATE commercial_journeys SET pipeline_stage = 'QUALIFIED' WHERE id = $1", [journeyId],
    ));
    expect(direct.rowCount).toBe(0);
  });

  it('COP-02: creates an auditable follow-up once and excludes viewers from writes', async () => {
    const first = await asAuthenticated(operatorId, (client) => client.query(
      'SELECT public.create_follow_up_task($1, $2, NOW() + INTERVAL \'2 hours\', $3, $4) AS result',
      [workspaceId, journeyId, 'Confirmar disponibilidade com a cliente', 'follow-up-0001'],
    ));
    expect(first.rows[0].result).toMatchObject({ status: 'PENDING', idempotent: false });

    const retry = await asAuthenticated(operatorId, (client) => client.query(
      'SELECT public.create_follow_up_task($1, $2, NOW() + INTERVAL \'3 hours\', $3, $4) AS result',
      [workspaceId, journeyId, 'Ignored by idempotency', 'follow-up-0001'],
    ));
    expect(retry.rows[0].result).toMatchObject({ status: 'PENDING', idempotent: true });

    await expect(asAuthenticated(viewerId, (client) => client.query(
      'SELECT public.create_follow_up_task($1, $2, NOW() + INTERVAL \'2 hours\', $3, $4)',
      [workspaceId, journeyId, 'Viewer cannot schedule', 'follow-up-viewer-0001'],
    ))).rejects.toThrow(/Unauthorized workspace operation/);
  });

  it('COP-03: exposes a bounded priority projection to workspace members only', async () => {
    const priorities = await asAuthenticated(viewerId, (client) => client.query(
      'SELECT * FROM public.get_workspace_priorities($1, $2)', [workspaceId, 5],
    ));
    expect(priorities.rows).toHaveLength(1);
    expect(priorities.rows[0]).toMatchObject({ journey_id: journeyId, pipeline_stage: 'CONTACTED', priority_reason: 'Follow-up agendado' });

    await expect(asAuthenticated('f0100000-0000-0000-0000-000000000999', (client) => client.query(
      'SELECT * FROM public.get_workspace_priorities($1, $2)', [workspaceId, 5],
    ))).rejects.toThrow(/Unauthorized workspace access/);
  });
});
