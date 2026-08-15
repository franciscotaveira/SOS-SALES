import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresCockpitReadGateway } from '../../src/infrastructure/database/postgres-cockpit-read-gateway.js';
import { dbPool, query } from '../../src/infrastructure/database/pool.js';

describe('PostgresCockpitReadGateway — RLS-scoped cockpit reads', () => {
  const owner = { userId: '00000000-0000-0000-0000-000000000001' };
  const outsider = { userId: 'd7100000-0000-4000-8000-000000000001' };
  const seededWorkspace = 'a0000000-0000-0000-0000-000000000001';
  const seededJourney = 'c0000000-0000-0000-0000-000000000001';
  const emptyWorkspace = 'd7200000-0000-4000-8000-000000000001';
  const gateway = new PostgresCockpitReadGateway(dbPool);

  beforeAll(async () => {
    await query(
      `INSERT INTO workspaces (id, name, slug, active)
       VALUES ($1, 'Empty cockpit workspace', 'empty-cockpit-workspace', true)
       ON CONFLICT (id) DO UPDATE SET active = true`,
      [emptyWorkspace],
    );
    await query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'viewer')
       ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [emptyWorkspace, outsider.userId],
    );
  });

  afterAll(async () => {
    const client = await dbPool.connect();
    try {
      await client.query("SELECT pg_catalog.set_config('sales_os.allow_redaction', 'true', false)");
      await client.query('DELETE FROM workspaces WHERE id = $1', [emptyWorkspace]);
      await client.query("SELECT pg_catalog.set_config('sales_os.allow_redaction', 'false', false)");
    } finally {
      client.release();
      await dbPool.end();
    }
  });

  it('COCKPIT-DB-01: returns RLS-permitted seeded priorities and safe message fields', async () => {
    const priorities = await gateway.listPriorities(owner, seededWorkspace, 5);
    const messages = await gateway.listMessages(owner, seededJourney, { limit: 10, cursor: null });

    expect(priorities).not.toBeNull();
    expect(priorities?.[0]).toMatchObject({ journeyId: seededJourney, pipelineStage: expect.any(String) });
    expect(messages).not.toBeNull();
    expect(messages?.items[0]).toEqual(expect.objectContaining({
      direction: 'inbound', senderType: 'customer', textContent: expect.any(String),
    }));
    expect(messages?.items[0]).not.toHaveProperty('providerMessageId');
    expect(messages?.items[0]).not.toHaveProperty('mediaPayload');
  });

  it('COCKPIT-DB-02: returns empty lists for an accessible workspace with no commercial data', async () => {
    const priorities = await gateway.listPriorities(outsider, emptyWorkspace, 5);
    const journeys = await gateway.listJourneys(outsider, emptyWorkspace, { limit: 20, cursor: null });
    expect(priorities).toEqual([]);
    expect(journeys).toEqual({ items: [], nextCursor: null });
  });

  it('COCKPIT-DB-03: denies cross-tenant workspace and journey access without revealing existence', async () => {
    const priorities = await gateway.listPriorities(outsider, seededWorkspace, 5);
    const journeys = await gateway.listJourneys(outsider, seededWorkspace, { limit: 20, cursor: null });
    const messages = await gateway.listMessages(outsider, seededJourney, { limit: 50, cursor: null });
    expect(priorities).toBeNull();
    expect(journeys).toBeNull();
    expect(messages).toBeNull();
  });
});
