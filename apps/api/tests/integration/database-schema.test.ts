import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dbPool, checkDatabaseHealth, query } from '../../src/infrastructure/database/pool.js';

describe('SOS Sales — Database Schema & Invariants', () => {
  beforeAll(async () => {
    const healthy = await checkDatabaseHealth();
    expect(healthy).toBe(true);
  });

  afterAll(async () => {
    await dbPool.end();
  });

  const expectedTables = [
    'workspaces',
    'workspace_memberships',
    'channel_connections',
    'channel_connection_secrets',
    'workspace_operation_controls',
    'channel_operation_controls',
    'operation_control_events',
    'contacts',
    'commercial_journeys',
    'inbound_channel_events',
    'conversation_messages',
    'conversation_message_events',
    'acquisition_contexts',
    'known_facts',
    'decision_events',
    'decision_states',
    'recommended_actions',
    'executed_actions',
    'handoff_cases',
    'handoff_case_events',
    'commercial_outcomes',
    'compliance_redaction_events',
    'projection_checkpoints',
    'outbox_events',
    'pipeline_stage_events',
    'workspace_sla_policies',
    'follow_up_tasks',
    'outbound_dispatches',
    'outbound_dispatch_events',
  ];

  it('should have all 29 domain, control and cockpit tables created in public schema', async () => {
    const res = await query<{ table_name: string }>(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    const tables = res.rows.map((r) => r.table_name);

    for (const table of expectedTables) {
      expect(tables, `Table ${table} must exist`).toContain(table);
    }
  });

  it('should have RLS enabled on all 29 domain, control and cockpit tables', async () => {
    const res = await query<{ tablename: string; rowsecurity: boolean }>(`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public';
    `);

    const rlsMap = new Map(res.rows.map((r) => [r.tablename, r.rowsecurity]));

    for (const table of expectedTables) {
      expect(rlsMap.get(table), `Table ${table} must have RLS enabled`).toBe(true);
    }
  });

  it('should prevent UPDATE and DELETE on immutable historical fact tables', async () => {
    // 1. Fetch an existing inbound event from seed
    const eventRes = await query('SELECT id FROM inbound_channel_events LIMIT 1');
    expect(eventRes.rowCount).toBe(1);
    const eventId = eventRes.rows[0].id;

    // 2. Attempt UPDATE on inbound_channel_events — should fail with exception
    await expect(
      query("UPDATE inbound_channel_events SET event_type = 'tampered' WHERE id = $1", [eventId])
    ).rejects.toThrow(/Immutable record/);

    // 3. Attempt DELETE on inbound_channel_events — should fail with exception
    await expect(
      query('DELETE FROM inbound_channel_events WHERE id = $1', [eventId])
    ).rejects.toThrow(/Immutable record/);

    // 4. Fetch an existing message from seed
    const msgRes = await query('SELECT id FROM conversation_messages LIMIT 1');
    expect(msgRes.rowCount).toBe(1);
    const msgId = msgRes.rows[0].id;

    // 5. Attempt UPDATE on conversation_messages — should fail
    await expect(
      query("UPDATE conversation_messages SET text_content = 'tampered' WHERE id = $1", [msgId])
    ).rejects.toThrow(/Immutable record/);
  });

  it('should load seed v2 data with minor currency units and namespaced facts', async () => {
    // 1. Workspace
    const ws = await query('SELECT * FROM workspaces WHERE slug = $1', ['haven-escovaria']);
    expect(ws.rowCount).toBe(1);
    const workspaceId = ws.rows[0].id;

    // 2. Workspace Membership
    const membership = await query('SELECT * FROM workspace_memberships WHERE workspace_id = $1', [workspaceId]);
    expect(membership.rowCount).toBe(1);
    expect(membership.rows[0].role).toBe('owner');

    // 3. Channel Connection (Public Config)
    // Select the deterministic seed record, not every channel in the workspace.
    // Local WAHA homologation is allowed to add a second real test connection.
    const channel = await query(
      'SELECT * FROM channel_connections WHERE id = $1 AND workspace_id = $2',
      ['a2000000-0000-0000-0000-000000000001', workspaceId],
    );
    expect(channel.rowCount).toBe(1);
    expect(channel.rows[0].provider).toBe('waha');

    // 3.1 Channel Secret
    const secret = await query('SELECT * FROM channel_connection_secrets WHERE workspace_id = $1', [workspaceId]);
    expect(secret.rowCount).toBe(1);
    expect(secret.rows[0].api_key_vault_secret_id).toBe('51000000-0000-0000-0000-000000000001');
    expect(secret.rows[0]).not.toHaveProperty('encrypted_api_key');
    expect(secret.rows[0]).not.toHaveProperty('webhook_secret');

    // 4. Commercial Journey with amount_minor
    const journey = await query('SELECT * FROM commercial_journeys WHERE id = $1', ['c0000000-0000-0000-0000-000000000001']);
    expect(journey.rowCount).toBe(1);
    expect(Number(journey.rows[0].total_revenue_minor)).toBe(5900); // R$ 59,00
    expect(journey.rows[0].currency).toBe('BRL');

    const journeyId = journey.rows[0].id;

    // 5. Known Facts with namespace
    const facts = await query<{ key: string; value: unknown }>(
      'SELECT key, value FROM known_facts WHERE journey_id = $1',
      [journeyId]
    );
    expect(facts.rowCount).toBeGreaterThanOrEqual(3);
    const factKeys = facts.rows.map((f) => f.key);
    expect(factKeys).toContain('profile.name');
    expect(factKeys).toContain('offer.quoted_price');
    expect(factKeys).toContain('schedule.preferred_period');

    // 6. Outbox Event from seed
    const outbox = await query("SELECT * FROM outbox_events WHERE id = 'f1000000-0000-0000-0000-000000000001'");
    expect(outbox.rowCount).toBe(1);
    expect(outbox.rows[0].event_name).toBe('journey.started');
    expect(['PENDING', 'PROCESSING', 'PUBLISHED']).toContain(outbox.rows[0].status);

    // 7. Projection Checkpoint
    const checkpoint = await query('SELECT * FROM projection_checkpoints WHERE journey_id = $1', [journeyId]);
    expect(checkpoint.rowCount).toBe(1);
  });
});
