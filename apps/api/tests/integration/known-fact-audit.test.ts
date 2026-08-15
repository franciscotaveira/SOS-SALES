import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import { dbPool, query } from '../../src/infrastructure/database/pool.js';

describe('P0 known fact audit protocol', () => {
  const workspaceA = 'f7000000-0000-0000-0000-000000000001';
  const workspaceB = 'f7000000-0000-0000-0000-000000000002';
  const operatorA = 'f7100000-0000-0000-0000-000000000001';
  const viewerA = 'f7100000-0000-0000-0000-000000000002';
  const operatorB = 'f7100000-0000-0000-0000-000000000003';
  const channelA = 'f7200000-0000-0000-0000-000000000001';
  const channelB = 'f7200000-0000-0000-0000-000000000002';
  const contactA = 'f7300000-0000-0000-0000-000000000001';
  const contactAOther = 'f7300000-0000-0000-0000-000000000003';
  const contactB = 'f7300000-0000-0000-0000-000000000002';
  const journeyA = 'f7400000-0000-0000-0000-000000000001';
  const journeyAOther = 'f7400000-0000-0000-0000-000000000002';
  const journeyB = 'f7400000-0000-0000-0000-000000000003';
  const messageA = 'f7500000-0000-0000-0000-000000000001';
  const messageAOther = 'f7500000-0000-0000-0000-000000000002';
  const messageB = 'f7500000-0000-0000-0000-000000000003';

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

  async function record(
    userId: string,
    workspaceId: string,
    journeyId: string,
    key: string,
    value: unknown,
    evidenceMessageId: string | null,
    idempotencyKey: string,
    supersedesFactId: string | null = null,
  ) {
    return asAuthenticated(userId, (client) => client.query(
      'SELECT public.record_known_fact($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9) AS result',
      [workspaceId, journeyId, key, JSON.stringify(value), evidenceMessageId, 0.9, true, supersedesFactId, idempotencyKey],
    ));
  }

  beforeAll(async () => {
    await query("INSERT INTO workspaces(id,name,slug,active) VALUES ($1,'Facts A','facts-a',true),($2,'Facts B','facts-b',true)", [workspaceA, workspaceB]);
    await query("INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES ($1,$2,'operator'),($1,$3,'viewer'),($4,$5,'operator')", [workspaceA, operatorA, viewerA, workspaceB, operatorB]);
    await query("INSERT INTO channel_connections(id,workspace_id,provider,phone_number,name,public_config) VALUES ($1,$2,'waha','+5549000007001','Facts A','{}'),($3,$4,'waha','+5549000007002','Facts B','{}')", [channelA, workspaceA, channelB, workspaceB]);
    await query("INSERT INTO contacts(id,workspace_id,phone,name) VALUES ($1,$2,'+5549000007011','Fact contact A'),($3,$2,'+5549000007013','Fact contact A other'),($4,$5,'+5549000007012','Fact contact B')", [contactA, workspaceA, contactAOther, contactB, workspaceB]);
    await query("INSERT INTO commercial_journeys(id,workspace_id,contact_id,channel_connection_id,status) VALUES ($1,$2,$3,$4,'OPEN'),($5,$2,$6,$4,'OPEN'),($7,$8,$9,$10,'OPEN')", [journeyA, workspaceA, contactA, channelA, journeyAOther, contactAOther, journeyB, workspaceB, contactB, channelB]);
    await query("INSERT INTO conversation_messages(id,workspace_id,channel_connection_id,journey_id,contact_id,direction,sender_type,provider_message_id,text_content) VALUES ($1,$2,$3,$4,$5,'inbound','customer','facts-msg-a','Cliente confirmou horário'),($6,$2,$3,$7,$8,'inbound','customer','facts-msg-a-other','Outra jornada'),($9,$10,$11,$12,$13,'inbound','customer','facts-msg-b','Outro workspace')", [messageA, workspaceA, channelA, journeyA, contactA, messageAOther, journeyAOther, contactAOther, messageB, workspaceB, channelB, journeyB, contactB]);
  });

  afterAll(async () => {
    const client = await dbPool.connect();
    try {
      await client.query("SELECT pg_catalog.set_config('sales_os.allow_redaction', 'true', false)");
      await client.query('DELETE FROM workspaces WHERE id IN ($1,$2)', [workspaceA, workspaceB]);
      await client.query("SELECT pg_catalog.set_config('sales_os.allow_redaction', 'false', false)");
    } finally {
      client.release();
      await dbPool.end();
    }
  });

  it('FCT-01: records an immutable operator fact with same-journey message evidence', async () => {
    const created = await record(operatorA, workspaceA, journeyA, 'schedule.preferred_period', { period: 'afternoon' }, messageA, 'fact-create-0001');
    expect(created.rows[0].result).toMatchObject({ journeyId: journeyA, source: 'human_operator', idempotent: false });
    const factId = created.rows[0].result.factId as string;

    await expect(query("UPDATE known_facts SET key = 'tampered.value' WHERE id = $1", [factId])).rejects.toThrow(/Immutable record/);
    await expect(query('DELETE FROM known_facts WHERE id = $1', [factId])).rejects.toThrow(/Immutable record/);
  });

  it('FCT-02: retries deterministically and rejects idempotency payload drift', async () => {
    const retry = await record(operatorA, workspaceA, journeyA, 'schedule.preferred_period', { period: 'afternoon' }, messageA, 'fact-create-0001');
    expect(retry.rows[0].result).toMatchObject({ idempotent: true });

    await expect(record(operatorA, workspaceA, journeyA, 'schedule.preferred_period', { period: 'morning' }, messageA, 'fact-create-0001'))
      .rejects.toThrow(/Idempotency conflict/);
  });

  it('FCT-03: corrects through an append-only supersession relation', async () => {
    const original = await record(operatorA, workspaceA, journeyA, 'service.preference', 'Escova modelada', messageA, 'fact-create-0002');
    const originalFactId = original.rows[0].result.factId as string;
    const correction = await record(operatorA, workspaceA, journeyA, 'service.preference', 'Escova + hidratação', messageA, 'fact-correct-0001', originalFactId);
    const replacementFactId = correction.rows[0].result.factId as string;
    expect(correction.rows[0].result).toMatchObject({ supersedesFactId: originalFactId, idempotent: false });

    const relation = await query('SELECT superseded_fact_id, replacement_fact_id FROM known_fact_supersessions WHERE superseded_fact_id = $1', [originalFactId]);
    expect(relation.rows[0]).toMatchObject({ superseded_fact_id: originalFactId, replacement_fact_id: replacementFactId });
    const originalValue = await query('SELECT value FROM known_facts WHERE id = $1', [originalFactId]);
    expect(originalValue.rows[0].value).toBe('Escova modelada');

    await expect(record(operatorA, workspaceA, journeyA, 'service.preference', 'Outra correção', messageA, 'fact-correct-0002', originalFactId))
      .rejects.toThrow(/Known fact already superseded/);
  });

  it('FCT-04: enforces tenant/RBAC boundaries and rejects cross-journey evidence', async () => {
    await expect(record(viewerA, workspaceA, journeyA, 'profile.name', 'Sem permissão', messageA, 'fact-viewer-0001'))
      .rejects.toThrow(/Unauthorized workspace operation/);
    await expect(record(operatorA, workspaceB, journeyB, 'profile.name', 'Cross tenant', messageB, 'fact-cross-tenant-0001'))
      .rejects.toThrow(/Unauthorized workspace operation/);
    await expect(record(operatorA, workspaceA, journeyA, 'profile.name', 'Evidência errada', messageAOther, 'fact-evidence-other-journey'))
      .rejects.toThrow(/Evidence message not found/);
    await expect(record(operatorA, workspaceA, journeyA, 'profile.name', 'Evidência externa', messageB, 'fact-evidence-other-workspace'))
      .rejects.toThrow(/Evidence message not found/);
  });
});
