import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PostgresTrafficProofGateway } from '../../src/infrastructure/database/postgres-traffic-proof-gateway.js';
import { dbPool, query } from '../../src/infrastructure/database/pool.js';

const owner = { userId: '7b100000-0000-4000-8000-000000000001' };
const outsider = { userId: '7b100000-0000-4000-8000-000000000002' };
const workspace = '7b200000-0000-4000-8000-000000000001';
const otherWorkspace = '7b200000-0000-4000-8000-000000000002';
const contact = '7b300000-0000-4000-8000-000000000001';
const journey = '7b400000-0000-4000-8000-000000000001';
const gateway = new PostgresTrafficProofGateway(dbPool);

describe('PostgresTrafficProofGateway — attribution evidence and spend provenance', () => {
  beforeAll(async () => {
    await query(`INSERT INTO workspaces (id, name, slug, active) VALUES
      ($1, 'Traffic proof', 'traffic-proof', true), ($2, 'Traffic proof outsider', 'traffic-proof-outsider', true)
      ON CONFLICT (id) DO UPDATE SET active = true`, [workspace, otherWorkspace]);
    await query(`INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES
      ($1, $2, 'owner'), ($3, $4, 'viewer') ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`, [workspace, owner.userId, otherWorkspace, outsider.userId]);
    await query(`INSERT INTO contacts (id, workspace_id, phone, name) VALUES ($1, $2, '+5511999000001', 'Traffic proof lead') ON CONFLICT (id) DO NOTHING`, [contact, workspace]);
    await query(`INSERT INTO commercial_journeys (id, workspace_id, contact_id, status, primary_service_or_product, total_revenue_minor)
      VALUES ($1, $2, $3, 'WON', 'Service', 5900) ON CONFLICT (id) DO NOTHING`, [journey, workspace, contact]);
    await query(`INSERT INTO acquisition_contexts (id, workspace_id, journey_id, source, campaign_id, campaign_name, confidence, occurred_at)
      VALUES ('7b500000-0000-4000-8000-000000000001', $1, $2, 'meta_ads', 'campaign-proof', 'Campaign Proof', 'HIGH_CTWA', '2026-08-10T10:00:00.000Z')
      ON CONFLICT (id) DO NOTHING`, [workspace, journey]);
    await query(`INSERT INTO acquisition_contexts (id, workspace_id, journey_id, source, campaign_id, campaign_name, confidence, occurred_at)
      VALUES ('7b500000-0000-4000-8000-000000000002', $1, $2, 'meta_ads', 'campaign-no-spend', 'Campaign Without Spend', 'MANUAL_DECLARED', '2026-08-12T10:00:00.000Z')
      ON CONFLICT (id) DO NOTHING`, [workspace, journey]);
    await query(`INSERT INTO commercial_outcomes (id, workspace_id, journey_id, result, final_revenue_minor, currency, request_fingerprint, occurred_at)
      VALUES ('7b600000-0000-4000-8000-000000000001', $1, $2, 'WON', 5900, 'BRL', 'traffic-proof-test', '2026-08-11T10:00:00.000Z')
      ON CONFLICT (id) DO NOTHING`, [workspace, journey]);
    await query(`INSERT INTO campaign_spend_daily_facts (id, workspace_id, source, campaign_id, campaign_name, fact_date, spend_minor, currency, provider_observed_at, provenance, source_import_key)
      VALUES ('7b700000-0000-4000-8000-000000000001', $1, 'meta_ads', 'campaign-proof', 'Campaign Proof', '2026-08-10', 1450, 'BRL', '2026-08-11T12:00:00.000Z', '{"provider":"manual_import"}', 'traffic-proof-import-20260810')
      ON CONFLICT (id) DO NOTHING`, [workspace]);
  });

  afterAll(async () => {
    const client = await dbPool.connect();
    try {
      await client.query("SELECT pg_catalog.set_config('sales_os.allow_redaction', 'true', false)");
      await client.query('DELETE FROM workspaces WHERE id IN ($1, $2)', [workspace, otherWorkspace]);
      await client.query("SELECT pg_catalog.set_config('sales_os.allow_redaction', 'false', false)");
    } finally {
      client.release();
      await dbPool.end();
    }
  });

  it('TP-DB-01: aggregates real attribution, outcome and imported spend once per journey', async () => {
    const report = await gateway.getTrafficProof(owner, workspace, { from: '2026-08-01', to: '2026-08-31', limit: 50 });
    expect(report).toEqual([{
      source: 'meta_ads', campaignId: 'campaign-proof', campaignName: 'Campaign Proof',
      acquiredLeads: 1, wonOutcomes: 1, lostOutcomes: 0, revenueMinor: 5900,
      spendMinor: 1450, roas: 5900 / 1450, currency: 'BRL',
    }]);
  });

  it('TP-DB-02: returns null spend and ROAS when no spend fact exists instead of pretending zero is evidence', async () => {
    const report = await gateway.getTrafficProof(owner, workspace, { from: '2026-09-01', to: '2026-09-30', limit: 50 });
    expect(report).toEqual([]);
    const noSpend = await gateway.getTrafficProof(owner, workspace, { from: '2026-08-12', to: '2026-08-12', limit: 50 });
    expect(noSpend).toEqual([expect.objectContaining({
      campaignId: 'campaign-no-spend', spendMinor: null, roas: null,
    })]);
  });

  it('TP-DB-03: keeps cross-tenant workspaces invisible under RLS', async () => {
    expect(await gateway.getTrafficProof(outsider, workspace, { from: '2026-08-01', to: '2026-08-31', limit: 50 })).toBeNull();
  });

  it('TP-DB-04: imported spend facts are append-only', async () => {
    await expect(query(`UPDATE campaign_spend_daily_facts SET spend_minor = 1 WHERE id = '7b700000-0000-4000-8000-000000000001'`))
      .rejects.toThrow(/immutable/i);
    await expect(query(`DELETE FROM campaign_spend_daily_facts WHERE id = '7b700000-0000-4000-8000-000000000001'`))
      .rejects.toThrow(/immutable/i);
  });
});
