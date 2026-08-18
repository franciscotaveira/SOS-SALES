import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { dbPool, query } from '../../src/infrastructure/database/pool.js';

describe('P0.4A — handoff supervision and outbound controls', () => {
  const workspaceId = 'e4000000-0000-0000-0000-000000000001';
  const ownerId = 'e4100000-0000-0000-0000-000000000001';
  const operatorAId = 'e4100000-0000-0000-0000-000000000002';
  const operatorBId = 'e4100000-0000-0000-0000-000000000003';
  const viewerId = 'e4100000-0000-0000-0000-000000000004';
  const channelId = 'e4200000-0000-0000-0000-000000000001';
  const contactId = 'e4300000-0000-0000-0000-000000000001';
  const journeyId = 'e4400000-0000-0000-0000-000000000001';

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

  async function createHandoff(): Promise<string> {
    const handoffId = randomUUID();
    await query(
      `INSERT INTO handoff_cases (id, workspace_id, journey_id, briefing, trigger_reason)
       VALUES ($1, $2, $3, '{"objective":"reply safely"}'::jsonb, 'operator_required')`,
      [handoffId, workspaceId, journeyId],
    );
    return handoffId;
  }

  beforeAll(async () => {
    await query(
      `INSERT INTO workspaces (id, name, slug, active)
       VALUES ($1, 'Handoff Supervision Test', 'handoff-supervision-test', true)
       ON CONFLICT (id) DO UPDATE SET active = true`,
      [workspaceId],
    );
    await query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES
       ($1, $2, 'owner'), ($1, $3, 'operator'), ($1, $4, 'operator'), ($1, $5, 'viewer')
       ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [workspaceId, ownerId, operatorAId, operatorBId, viewerId],
    );
    await query(
      `INSERT INTO channel_connections (id, workspace_id, provider, phone_number, name, public_config)
       VALUES ($1, $2, 'waha', '+5549999111111', 'Canal de teste P0.4', '{"session":"p04-test"}'::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [channelId, workspaceId],
    );
    await query(
      `INSERT INTO contacts (id, workspace_id, phone, name)
       VALUES ($1, $2, '+5549999222222', 'Contato P0.4')
       ON CONFLICT (id) DO NOTHING`,
      [contactId, workspaceId],
    );
    await query(
      `INSERT INTO commercial_journeys (id, workspace_id, contact_id, channel_connection_id, status)
       VALUES ($1, $2, $3, $4, 'OPEN')
       ON CONFLICT (id) DO NOTHING`,
      [journeyId, workspaceId, contactId, channelId],
    );
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

  it('HND-01: accepts a pending handoff atomically and makes the same key idempotent', async () => {
    const handoffId = await createHandoff();
    const key = 'handoff-accept-0001';

    const first = await asAuthenticated(operatorAId, (client) => client.query(
      'SELECT public.accept_handoff($1, $2, $3) AS result', [workspaceId, handoffId, key],
    ));
    expect(first.rows[0].result).toMatchObject({ status: 'ACCEPTED', assignedToUserId: operatorAId, idempotent: false });

    const retry = await asAuthenticated(operatorAId, (client) => client.query(
      'SELECT public.accept_handoff($1, $2, $3) AS result', [workspaceId, handoffId, key],
    ));
    expect(retry.rows[0].result).toMatchObject({ status: 'ACCEPTED', assignedToUserId: operatorAId, idempotent: true });

    const events = await query(
      'SELECT * FROM handoff_case_events WHERE workspace_id = $1 AND handoff_case_id = $2',
      [workspaceId, handoffId],
    );
    expect(events.rowCount).toBe(1);
  });

  it('HND-02: allows only one concurrent operator to accept the same handoff', async () => {
    const handoffId = await createHandoff();
    const results = await Promise.allSettled([
      asAuthenticated(operatorAId, (client) => client.query(
        'SELECT public.accept_handoff($1, $2, $3)', [workspaceId, handoffId, 'handoff-race-operator-a'],
      )),
      asAuthenticated(operatorBId, (client) => client.query(
        'SELECT public.accept_handoff($1, $2, $3)', [workspaceId, handoffId, 'handoff-race-operator-b'],
      )),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const stored = await query<{ status: string; assigned_to_user_id: string }>(
      'SELECT status, assigned_to_user_id FROM handoff_cases WHERE id = $1', [handoffId],
    );
    expect(stored.rows[0]).toMatchObject({ status: 'ACCEPTED' });
    expect([operatorAId, operatorBId]).toContain(stored.rows[0].assigned_to_user_id);
  });

  it('HND-03: rejects viewer acceptance and cross-operator resolution', async () => {
    const pendingHandoffId = await createHandoff();
    await expect(asAuthenticated(viewerId, (client) => client.query(
      'SELECT public.accept_handoff($1, $2, $3)', [workspaceId, pendingHandoffId, 'viewer-cannot-accept'],
    ))).rejects.toThrow(/Unauthorized handoff operation/);

    const acceptedHandoffId = await createHandoff();
    await asAuthenticated(operatorAId, (client) => client.query(
      'SELECT public.accept_handoff($1, $2, $3)', [workspaceId, acceptedHandoffId, 'accept-for-resolution'],
    ));
    await expect(asAuthenticated(operatorBId, (client) => client.query(
      'SELECT public.resolve_handoff($1, $2, $3)', [workspaceId, acceptedHandoffId, 'other-operator-resolve'],
    ))).rejects.toThrow(/Only the assigned operator or owner/);
  });

  it('HND-04: prevents direct authenticated updates and keeps transition events immutable', async () => {
    const handoffId = await createHandoff();
    const directUpdate = await asAuthenticated(operatorAId, (client) => client.query(
      "UPDATE handoff_cases SET status = 'ACCEPTED' WHERE id = $1", [handoffId],
    ));
    expect(directUpdate.rowCount).toBe(0);

    await asAuthenticated(operatorAId, (client) => client.query(
      'SELECT public.accept_handoff($1, $2, $3)', [workspaceId, handoffId, 'immutable-event-test'],
    ));
    await expect(query(
      "UPDATE handoff_case_events SET to_status = 'RESOLVED' WHERE handoff_case_id = $1", [handoffId],
    )).rejects.toThrow(/Immutable record/);
  });

  it('KILL-01: outbound stays disabled until both workspace and channel controls are enabled', async () => {
    const initial = await query<{ enabled: boolean }>(
      'SELECT public.is_outbound_enabled($1, $2) AS enabled', [workspaceId, channelId],
    );
    expect(initial.rows[0].enabled).toBe(false);

    const workspaceOn = await asAuthenticated(ownerId, (client) => client.query(
      'SELECT public.set_workspace_outbound_control($1, true, $2, $3) AS result',
      [workspaceId, 'owner enabled workspace after review', `workspace-control-on-${randomUUID()}`],
    ));
    expect(workspaceOn.rows[0].result).toMatchObject({ outboundEnabled: true, idempotent: false });

    const onlyWorkspace = await query<{ enabled: boolean }>(
      'SELECT public.is_outbound_enabled($1, $2) AS enabled', [workspaceId, channelId],
    );
    expect(onlyWorkspace.rows[0].enabled).toBe(false);

    await asAuthenticated(ownerId, (client) => client.query(
      'SELECT public.set_channel_outbound_control($1, $2, true, $3, $4)',
      [workspaceId, channelId, 'owner enabled test channel', `channel-control-on-${randomUUID()}`],
    ));
    const fullyEnabled = await query<{ enabled: boolean }>(
      'SELECT public.is_outbound_enabled($1, $2) AS enabled', [workspaceId, channelId],
    );
    expect(fullyEnabled.rows[0].enabled).toBe(true);

    await asAuthenticated(ownerId, (client) => client.query(
      'SELECT public.set_workspace_outbound_control($1, false, $2, $3)',
      [workspaceId, 'pause before outbound worker exists', `workspace-control-off-${randomUUID()}`],
    ));
    const paused = await query<{ enabled: boolean }>(
      'SELECT public.is_outbound_enabled($1, $2) AS enabled', [workspaceId, channelId],
    );
    expect(paused.rows[0].enabled).toBe(false);
  });

  it('KILL-02: viewers cannot change controls and control audit is immutable', async () => {
    await expect(asAuthenticated(viewerId, (client) => client.query(
      'SELECT public.set_workspace_outbound_control($1, true, $2, $3)',
      [workspaceId, 'viewer cannot enable outbound', 'viewer-control-change'],
    ))).rejects.toThrow(/Unauthorized outbound control operation/);

    const event = await query<{ id: string }>(
      'SELECT id FROM operation_control_events WHERE workspace_id = $1 ORDER BY created_at LIMIT 1', [workspaceId],
    );
    expect(event.rowCount).toBeGreaterThan(0);
    await expect(query(
      'DELETE FROM operation_control_events WHERE id = $1', [event.rows[0].id],
    )).rejects.toThrow(/Immutable record/);
  });
});
