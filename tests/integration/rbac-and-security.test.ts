import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { dbPool, query } from '../../src/infrastructure/database/pool.js';

describe('TX Commercial Core — RBAC, Composite FKs, Secret Isolation & Outbox Fencing', () => {
  const ownerUserId = '11111111-1111-1111-1111-111111111101';
  const operatorUserId = '11111111-1111-1111-1111-111111111102';
  const viewerUserId = '11111111-1111-1111-1111-111111111103';
  const otherWsUserId = '22222222-2222-2222-2222-222222222201';

  const workspaceAId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
  const workspaceBId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';

  const contactAId = 'c0000000-0000-0000-0000-0000000000a1';
  const contactBId = 'c0000000-0000-0000-0000-0000000000b1';

  const channelAId = 'a2000000-0000-0000-0000-0000000000a1';

  beforeAll(async () => {
    // 1. Create Workspaces
    await query(`
      INSERT INTO workspaces (id, name, slug, active) VALUES
      ('${workspaceAId}', 'Workspace Alpha Test', 'ws-alpha-security-test', true),
      ('${workspaceBId}', 'Workspace Beta Test', 'ws-beta-security-test', true)
      ON CONFLICT (id) DO NOTHING;
    `);

    // 2. Create Memberships with different roles
    await query(`
      INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES
      ('${workspaceAId}', '${ownerUserId}', 'owner'),
      ('${workspaceAId}', '${operatorUserId}', 'operator'),
      ('${workspaceAId}', '${viewerUserId}', 'viewer'),
      ('${workspaceBId}', '${otherWsUserId}', 'owner')
      ON CONFLICT DO NOTHING;
    `);

    // 3. Create Channel Connection with Secret
    await query(`
      INSERT INTO channel_connections (id, workspace_id, provider, phone_number, name, public_config) VALUES
      ('${channelAId}', '${workspaceAId}', 'waha', '+5549999000001', 'Canal Alpha Test', '{"session": "test_alpha"}'::jsonb)
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO channel_connection_secrets (
        channel_connection_id, workspace_id, api_key_vault_secret_id, webhook_vault_secret_id
      ) VALUES
      ('${channelAId}', '${workspaceAId}', '51000000-0000-0000-0000-000000000099', '52000000-0000-0000-0000-000000000099')
      ON CONFLICT (channel_connection_id) DO NOTHING;
    `);

    // 4. Create Contacts
    await query(`
      INSERT INTO contacts (id, workspace_id, phone, name) VALUES
      ('${contactAId}', '${workspaceAId}', '+5549999000001', 'Contato Alpha'),
      ('${contactBId}', '${workspaceBId}', '+5549999000002', 'Contato Beta')
      ON CONFLICT (id) DO NOTHING;
    `);
  });

  afterAll(async () => {
    // Clean up test data using redaction bypass
    const client = await dbPool.connect();
    try {
      await client.query("SELECT pg_catalog.set_config('sales_os.allow_redaction', 'true', false)");
      await client.query(`DELETE FROM workspaces WHERE id IN ('${workspaceAId}', '${workspaceBId}')`);
      await client.query("SELECT pg_catalog.set_config('sales_os.allow_redaction', 'false', false)");
    } finally {
      client.release();
      await dbPool.end();
    }
  });

  it('SEC-01: should reject cross-tenant foreign keys (Workspace A journey pointing to Workspace B contact)', async () => {
    const invalidJourneyId = 'd0000000-0000-0000-0000-0000000000f1';
    
    await expect(
      query(`
        INSERT INTO commercial_journeys (id, workspace_id, contact_id, status, primary_service_or_product)
        VALUES ('${invalidJourneyId}', '${workspaceAId}', '${contactBId}', 'OPEN', 'Invalid Cross-Tenant Service')
      `)
    ).rejects.toThrow(/fk_journeys_contact_same_workspace/);
  });

  it('SEC-02: should block anonymous access on public tables (Default Deny & Revoked Privileges)', async () => {
    const client = await dbPool.connect();
    try {
      await client.query('SET ROLE anon');

      // 1. SELECT on workspaces should throw permission denied
      await expect(client.query('SELECT * FROM workspaces')).rejects.toThrow(/permission denied/);

      // 2. SELECT on contacts should throw permission denied
      await expect(client.query('SELECT * FROM contacts')).rejects.toThrow(/permission denied/);

      // 3. INSERT on contacts should fail with permission denied
      await expect(
        client.query(`
          INSERT INTO contacts (workspace_id, phone, name) 
          VALUES ('${workspaceAId}', '+5549999999999', 'Anon Hacked')
        `)
      ).rejects.toThrow(/permission denied/);
    } finally {
      await client.query('RESET ROLE');
      client.release();
    }
  });

  it('SEC-03: Secret Isolation — both operator and viewer cannot read channel_connection_secrets directly', async () => {
    // 1. Test Operator cannot read secrets
    const client1 = await dbPool.connect();
    try {
      await client1.query('SET ROLE authenticated');
      await client1.query(`SET "request.jwt.claim.role" = 'authenticated'`);
      await client1.query(`SET "request.jwt.claim.sub" = '${operatorUserId}'`);

      const opSecretRes = await client1.query('SELECT * FROM channel_connection_secrets WHERE channel_connection_id = $1', [channelAId]);
      expect(opSecretRes.rowCount).toBe(0);
    } finally {
      await client1.query('RESET ROLE');
      client1.release();
    }

    // 2. Test Viewer cannot read secrets
    const client2 = await dbPool.connect();
    try {
      await client2.query('SET ROLE authenticated');
      await client2.query(`SET "request.jwt.claim.role" = 'authenticated'`);
      await client2.query(`SET "request.jwt.claim.sub" = '${viewerUserId}'`);

      const viewerSecretRes = await client2.query('SELECT * FROM channel_connection_secrets WHERE channel_connection_id = $1', [channelAId]);
      expect(viewerSecretRes.rowCount).toBe(0);
    } finally {
      await client2.query('RESET ROLE');
      client2.release();
    }
  });

  it('SEC-04: Last Owner Guard — should strictly prevent deleting or demoting the last owner without bypass', async () => {
    // Sub-test 1: Demote owner
    const client1 = await dbPool.connect();
    try {
      await client1.query('SET ROLE authenticated');
      await client1.query(`SET "request.jwt.claim.role" = 'authenticated'`);
      await client1.query(`SET "request.jwt.claim.sub" = '${ownerUserId}'`);

      await expect(
        client1.query(`
          UPDATE workspace_memberships
          SET role = 'operator'
          WHERE workspace_id = '${workspaceAId}' AND user_id = '${ownerUserId}'
        `)
      ).rejects.toThrow(/Cannot remove or demote the last owner/);
    } finally {
      await client1.query('RESET ROLE');
      client1.release();
    }

    // Sub-test 2: Delete owner
    const client2 = await dbPool.connect();
    try {
      await client2.query('SET ROLE authenticated');
      await client2.query(`SET "request.jwt.claim.role" = 'authenticated'`);
      await client2.query(`SET "request.jwt.claim.sub" = '${ownerUserId}'`);

      await expect(
        client2.query(`
          DELETE FROM workspace_memberships
          WHERE workspace_id = '${workspaceAId}' AND user_id = '${ownerUserId}'
        `)
      ).rejects.toThrow(/Cannot remove or demote the last owner/);
    } finally {
      await client2.query('RESET ROLE');
      client2.release();
    }
  });

  it('SEC-05: RPC Authorization Guard — viewer and anon must be rejected from executing actions and outcomes', async () => {
    // 1. Viewer trying to execute commercial action
    const client1 = await dbPool.connect();
    try {
      await client1.query('SET ROLE authenticated');
      await client1.query(`SET "request.jwt.claim.role" = 'authenticated'`);
      await client1.query(`SET "request.jwt.claim.sub" = '${viewerUserId}'`);

      await expect(
        client1.query(`
          SELECT public.execute_commercial_action(
            '${workspaceAId}',
            gen_random_uuid(),
            'ANSWER_PRICE'
          );
        `)
      ).rejects.toThrow(/Unauthorized/);
    } finally {
      await client1.query('RESET ROLE');
      client1.release();
    }

    // 2. Viewer trying to record commercial outcome
    const client2 = await dbPool.connect();
    try {
      await client2.query('SET ROLE authenticated');
      await client2.query(`SET "request.jwt.claim.role" = 'authenticated'`);
      await client2.query(`SET "request.jwt.claim.sub" = '${viewerUserId}'`);

      await expect(
        client2.query(`
          SELECT public.record_commercial_outcome(
            '${workspaceAId}',
            gen_random_uuid(),
            'WON'
          );
        `)
      ).rejects.toThrow(/Unauthorized/);
    } finally {
      await client2.query('RESET ROLE');
      client2.release();
    }

    // 3. Viewer trying to anonymize contact
    const client3 = await dbPool.connect();
    try {
      await client3.query('SET ROLE authenticated');
      await client3.query(`SET "request.jwt.claim.role" = 'authenticated'`);
      await client3.query(`SET "request.jwt.claim.sub" = '${viewerUserId}'`);

      await expect(
        client3.query(`
          SELECT public.anonymize_contact_pii(
            '${contactAId}',
            '${workspaceAId}'
          );
        `)
      ).rejects.toThrow(/Unauthorized/);
    } finally {
      await client3.query('RESET ROLE');
      client3.release();
    }
  });

  it('SEC-06: routine allowlist keeps worker RPCs unavailable to authenticated clients', async () => {
    const privilege = await query(`
      SELECT
        has_function_privilege('authenticated', 'public.claim_outbox_batch(text,integer,integer)', 'EXECUTE') AS authenticated_claim,
        has_function_privilege('authenticated', 'public.complete_outbox_event(uuid,uuid,text)', 'EXECUTE') AS authenticated_complete,
        has_function_privilege('service_role', 'public.claim_outbox_batch(text,integer,integer)', 'EXECUTE') AS service_claim
    `);

    expect(privilege.rows[0].authenticated_claim).toBe(false);
    expect(privilege.rows[0].authenticated_complete).toBe(false);
    expect(privilege.rows[0].service_claim).toBe(true);

    const client = await dbPool.connect();
    try {
      await client.query('SET ROLE authenticated');
      await client.query(`SET "request.jwt.claim.role" = 'authenticated'`);
      await expect(
        client.query(`SELECT * FROM public.claim_outbox_batch('unauthorized-worker', 1, 60)`)
      ).rejects.toThrow(/permission denied/);
    } finally {
      await client.query('RESET ROLE');
      client.release();
    }
  });

  it('SEC-07: concurrent owner removals cannot orphan a workspace', async () => {
    const workspaceId = randomUUID();
    const ownerA = randomUUID();
    const ownerB = randomUUID();

    await query(`
      INSERT INTO workspaces (id, name, slug)
      VALUES ('${workspaceId}', 'Concurrent Owner Guard', 'owner-guard-${workspaceId}');
      INSERT INTO workspace_memberships (workspace_id, user_id, role)
      VALUES
        ('${workspaceId}', '${ownerA}', 'owner'),
        ('${workspaceId}', '${ownerB}', 'owner');
    `);

    const clientA = await dbPool.connect();
    const clientB = await dbPool.connect();
    try {
      await clientA.query('BEGIN');
      await clientA.query('SET LOCAL ROLE authenticated');
      await clientA.query(`SET LOCAL "request.jwt.claim.role" = 'authenticated'`);
      await clientA.query(`SET LOCAL "request.jwt.claim.sub" = '${ownerA}'`);

      await clientB.query('BEGIN');
      await clientB.query('SET LOCAL ROLE authenticated');
      await clientB.query(`SET LOCAL "request.jwt.claim.role" = 'authenticated'`);
      await clientB.query(`SET LOCAL "request.jwt.claim.sub" = '${ownerB}'`);

      const removeOwner = async (client: typeof clientA, userId: string): Promise<boolean> => {
        try {
          await client.query(
            `DELETE FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2`,
            [workspaceId, userId]
          );
          await client.query('COMMIT');
          return true;
        } catch {
          await client.query('ROLLBACK');
          return false;
        }
      };

      const results = await Promise.all([
        removeOwner(clientA, ownerA),
        removeOwner(clientB, ownerB),
      ]);

      expect(results.filter(Boolean)).toHaveLength(1);
      const remaining = await query(
        `SELECT count(*)::int AS count FROM workspace_memberships WHERE workspace_id = $1 AND role = 'owner'`,
        [workspaceId]
      );
      expect(remaining.rows[0].count).toBe(1);
    } finally {
      clientA.release();
      clientB.release();
      await query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
    }
  });

  it('ACT-01: Guarded Commercial Action RPC — should validate policy, enforce idempotency and reject cross-journey recommendations', async () => {
    const contactOtherId = randomUUID();
    const journeyId = randomUUID();
    const otherJourneyId = randomUUID();
    const recommendedActionId = randomUUID();
    const idempotencyKey = 'idemp_act_test_' + randomUUID();
    const dynamicPhone1 = '+5549' + Math.floor(Math.random() * 89999999 + 10000000);

    // Setup journeys & recommendation across distinct contacts in workspaceA
    await query(`
      INSERT INTO contacts (id, workspace_id, phone, name)
      VALUES ('${contactOtherId}', '${workspaceAId}', '${dynamicPhone1}', 'ACT-01 Other Contact');

      INSERT INTO commercial_journeys (id, workspace_id, contact_id, status, primary_service_or_product)
      VALUES 
      ('${journeyId}', '${workspaceAId}', '${contactAId}', 'OPEN', 'Escova Alpha'),
      ('${otherJourneyId}', '${workspaceAId}', '${contactOtherId}', 'OPEN', 'Outra Jornada');

      INSERT INTO recommended_actions (id, workspace_id, journey_id, suggested_action, micro_commitment_goal, confidence, policy_status)
      VALUES ('${recommendedActionId}', '${workspaceAId}', '${otherJourneyId}', 'OFFER_TIME_SLOTS', 'Agendar', 0.90, 'ALLOWED');
    `);

    // 1. Direct INSERT is blocked for authenticated users
    const client1 = await dbPool.connect();
    try {
      await client1.query('SET ROLE authenticated');
      await client1.query(`SET "request.jwt.claim.role" = 'authenticated'`);
      await client1.query(`SET "request.jwt.claim.sub" = '${operatorUserId}'`);

      await expect(
        client1.query(`
          INSERT INTO executed_actions (workspace_id, journey_id, executed_action, executed_by)
          VALUES ('${workspaceAId}', '${journeyId}', 'ANSWER_PRICE', 'operator')
        `)
      ).rejects.toThrow();
    } finally {
      await client1.query('RESET ROLE');
      client1.release();
    }

    // 2. Cross-journey recommendation reference fails
    const client2 = await dbPool.connect();
    try {
      await client2.query('SET ROLE authenticated');
      await client2.query(`SET "request.jwt.claim.role" = 'authenticated'`);
      await client2.query(`SET "request.jwt.claim.sub" = '${operatorUserId}'`);

      await expect(
        client2.query(`
          SELECT public.execute_commercial_action(
            '${workspaceAId}',
            '${journeyId}',
            'OFFER_TIME_SLOTS',
            '${recommendedActionId}',
            'msg_01',
            '${idempotencyKey}'
          );
        `)
      ).rejects.toThrow(/does not belong to journey/);
    } finally {
      await client2.query('RESET ROLE');
      client2.release();
    }

    // 3. Execution succeeds and writes outbox
    const client3 = await dbPool.connect();
    let actionId: string;
    try {
      await client3.query('SET ROLE authenticated');
      await client3.query(`SET "request.jwt.claim.role" = 'authenticated'`);
      await client3.query(`SET "request.jwt.claim.sub" = '${operatorUserId}'`);

      const rpcRes = await client3.query(`
        SELECT public.execute_commercial_action(
          '${workspaceAId}',
          '${journeyId}',
          'ANSWER_PRICE',
          NULL,
          'msg_01',
          '${idempotencyKey}'
        ) as action_id;
      `);
      expect(rpcRes.rowCount).toBe(1);
      actionId = rpcRes.rows[0].action_id;

      // 4. Idempotent re-call returns the exact same action_id
      const idempRes = await client3.query(`
        SELECT public.execute_commercial_action(
          '${workspaceAId}',
          '${journeyId}',
          'ANSWER_PRICE',
          NULL,
          'msg_01',
          '${idempotencyKey}'
        ) as action_id;
      `);
      expect(idempRes.rows[0].action_id).toBe(actionId);
    } finally {
      await client3.query('RESET ROLE');
      client3.release();
    }
  });

  it('ACT-02: policy enforcement requires a human and binds execution to the recommended action', async () => {
    const contactId = randomUUID();
    const journeyId = randomUUID();
    const requiresApprovalId = randomUUID();
    const blockedId = randomUUID();
    const allowedId = randomUUID();
    const dynamicPhone2 = '+5549' + Math.floor(Math.random() * 89999999 + 10000000);

    await query(`
      INSERT INTO contacts (id, workspace_id, phone, name)
      VALUES ('${contactId}', '${workspaceAId}', '${dynamicPhone2}', 'ACT-02 Contact');

      INSERT INTO commercial_journeys (id, workspace_id, contact_id, status, primary_service_or_product)
      VALUES ('${journeyId}', '${workspaceAId}', '${contactId}', 'OPEN', 'Governed Action Test');

      INSERT INTO recommended_actions (
        id, workspace_id, journey_id, suggested_action, micro_commitment_goal, confidence, policy_status
      ) VALUES
        ('${requiresApprovalId}', '${workspaceAId}', '${journeyId}', 'SEND_PAYMENT', 'Confirmar pagamento', 0.90, 'REQUIRES_HUMAN_APPROVAL'),
        ('${blockedId}', '${workspaceAId}', '${journeyId}', 'SHOW_PROOF', 'Enviar prova', 0.80, 'BLOCKED_BY_POLICY'),
        ('${allowedId}', '${workspaceAId}', '${journeyId}', 'OFFER_TIME_SLOTS', 'Escolher horário', 0.95, 'ALLOWED');
    `);

    const serviceClient = await dbPool.connect();
    try {
      await serviceClient.query('SET ROLE service_role');
      await serviceClient.query(`SET "request.jwt.claim.role" = 'service_role'`);
      await expect(
        serviceClient.query(
          `SELECT public.execute_commercial_action($1, $2, 'SEND_PAYMENT', $3, NULL, $4)`,
          [workspaceAId, journeyId, requiresApprovalId, `service-approval-${randomUUID()}`]
        )
      ).rejects.toThrow(/requires approval by an authenticated operator/);
    } finally {
      await serviceClient.query('RESET ROLE');
      serviceClient.release();
    }

    const operatorClient = await dbPool.connect();
    try {
      await operatorClient.query('SET ROLE authenticated');
      await operatorClient.query(`SET "request.jwt.claim.role" = 'authenticated'`);
      await operatorClient.query(`SET "request.jwt.claim.sub" = '${operatorUserId}'`);

      const approved = await operatorClient.query(
        `SELECT public.execute_commercial_action($1, $2, 'SEND_PAYMENT', $3, NULL, $4) AS id`,
        [workspaceAId, journeyId, requiresApprovalId, `operator-approval-${randomUUID()}`]
      );
      const executed = await query(
        'SELECT approved_by_user_id FROM executed_actions WHERE id = $1',
        [approved.rows[0].id]
      );
      expect(executed.rows[0].approved_by_user_id).toBe(operatorUserId);

      await expect(
        operatorClient.query(
          `SELECT public.execute_commercial_action($1, $2, 'SHOW_PROOF', $3, NULL, $4)`,
          [workspaceAId, journeyId, blockedId, `blocked-${randomUUID()}`]
        )
      ).rejects.toThrow(/blocked by safety policy/);

      await expect(
        operatorClient.query(
          `SELECT public.execute_commercial_action($1, $2, 'ANSWER_PRICE', $3, NULL, $4)`,
          [workspaceAId, journeyId, allowedId, `mismatch-${randomUUID()}`]
        )
      ).rejects.toThrow(/does not match recommended action/);
    } finally {
      await operatorClient.query('RESET ROLE');
      operatorClient.release();
    }
  });

  it('ACT-03: concurrent retries return one action and reject idempotency-key payload drift', async () => {
    const contactId = randomUUID();
    const journeyId = randomUUID();
    const idempotencyKey = `concurrent-action-${randomUUID()}`;
    const dynamicPhone3 = '+5549' + Math.floor(Math.random() * 89999999 + 10000000);

    await query(`
      INSERT INTO contacts (id, workspace_id, phone, name)
      VALUES ('${contactId}', '${workspaceAId}', '${dynamicPhone3}', 'ACT-03 Contact');

      INSERT INTO commercial_journeys (id, workspace_id, contact_id, status, primary_service_or_product)
      VALUES ('${journeyId}', '${workspaceAId}', '${contactId}', 'OPEN', 'Concurrent Action Test');
    `);

    const clients = [await dbPool.connect(), await dbPool.connect()];
    try {
      for (const client of clients) {
        await client.query('SET ROLE authenticated');
        await client.query(`SET "request.jwt.claim.role" = 'authenticated'`);
        await client.query(`SET "request.jwt.claim.sub" = '${operatorUserId}'`);
      }

      const results = await Promise.all(
        clients.map((client) =>
          client.query(
            `SELECT public.execute_commercial_action($1, $2, 'ANSWER_PRICE', NULL, 'msg-concurrent', $3) AS id`,
            [workspaceAId, journeyId, idempotencyKey]
          )
        )
      );

      expect(results[0].rows[0].id).toBe(results[1].rows[0].id);
      const count = await query(
        'SELECT count(*)::int AS count FROM executed_actions WHERE workspace_id = $1 AND idempotency_key = $2',
        [workspaceAId, idempotencyKey]
      );
      expect(count.rows[0].count).toBe(1);

      await expect(
        clients[0].query(
          `SELECT public.execute_commercial_action($1, $2, 'WAIT_CUSTOMER', NULL, 'msg-concurrent', $3)`,
          [workspaceAId, journeyId, idempotencyKey]
        )
      ).rejects.toThrow(/Idempotency conflict/);
    } finally {
      for (const client of clients) {
        await client.query('RESET ROLE');
        client.release();
      }
    }
  });

  it('OUT-01: Guarded Commercial Outcome RPC — should close journey, map UNRESPONSIVE to ABANDONED and prevent duplicate outcomes', async () => {
    const contactId = randomUUID();
    const journeyId = randomUUID();
    const dynamicPhone4 = '+5549' + Math.floor(Math.random() * 89999999 + 10000000);
    
    await query(`
      INSERT INTO contacts (id, workspace_id, phone, name)
      VALUES ('${contactId}', '${workspaceAId}', '${dynamicPhone4}', 'OUT-01 Contact');

      INSERT INTO commercial_journeys (id, workspace_id, contact_id, status, primary_service_or_product)
      VALUES ('${journeyId}', '${workspaceAId}', '${contactId}', 'OPEN', 'Serviço Unresponsive Test');
    `);

    const client = await dbPool.connect();
    try {
      await client.query('SET ROLE authenticated');
      await client.query(`SET "request.jwt.claim.role" = 'authenticated'`);
      await client.query(`SET "request.jwt.claim.sub" = '${operatorUserId}'`);

      // 1. Record outcome as UNRESPONSIVE
      const outcomeRes = await client.query(`
        SELECT public.record_commercial_outcome(
          '${workspaceAId}',
          '${journeyId}',
          'UNRESPONSIVE',
          0,
          'BRL',
          'Lead parou de responder após 48h'
        ) as outcome_id;
      `);
      expect(outcomeRes.rowCount).toBe(1);

      // 2. Journey status is mapped to ABANDONED
      const journeyRes = await query('SELECT status FROM commercial_journeys WHERE id = $1', [journeyId]);
      expect(journeyRes.rows[0].status).toBe('ABANDONED');

      // 3. Attempting to record a second outcome on the closed journey fails
      await expect(
        client.query(`
          SELECT public.record_commercial_outcome(
            '${workspaceAId}',
            '${journeyId}',
            'WON',
            5000
          );
        `)
      ).rejects.toThrow(/already closed/);
    } finally {
      await client.query('RESET ROLE');
      client.release();
    }
  });

  it('OUT-02: concurrent outcome retries are idempotent and payload drift is rejected', async () => {
    const contactId = randomUUID();
    const journeyId = randomUUID();
    const idempotencyKey = `concurrent-outcome-${randomUUID()}`;
    const dynamicPhone5 = '+5549' + Math.floor(Math.random() * 89999999 + 10000000);

    await query(`
      INSERT INTO contacts (id, workspace_id, phone, name)
      VALUES ('${contactId}', '${workspaceAId}', '${dynamicPhone5}', 'OUT-02 Contact');

      INSERT INTO commercial_journeys (id, workspace_id, contact_id, status, primary_service_or_product)
      VALUES ('${journeyId}', '${workspaceAId}', '${contactId}', 'OPEN', 'Concurrent Outcome Test');
    `);

    const clients = [await dbPool.connect(), await dbPool.connect()];
    try {
      for (const client of clients) {
        await client.query('SET ROLE authenticated');
        await client.query(`SET "request.jwt.claim.role" = 'authenticated'`);
        await client.query(`SET "request.jwt.claim.sub" = '${operatorUserId}'`);
      }

      const results = await Promise.all(
        clients.map((client) =>
          client.query(
            `SELECT public.record_commercial_outcome($1, $2, 'WON', 5900, 'BRL', 'Pagamento confirmado', '{}'::jsonb, $3) AS id`,
            [workspaceAId, journeyId, idempotencyKey]
          )
        )
      );

      expect(results[0].rows[0].id).toBe(results[1].rows[0].id);
      const count = await query(
        'SELECT count(*)::int AS count FROM commercial_outcomes WHERE journey_id = $1',
        [journeyId]
      );
      expect(count.rows[0].count).toBe(1);

      await expect(
        clients[0].query(
          `SELECT public.record_commercial_outcome($1, $2, 'WON', 6900, 'BRL', 'Pagamento confirmado', '{}'::jsonb, $3)`,
          [workspaceAId, journeyId, idempotencyKey]
        )
      ).rejects.toThrow(/Idempotency conflict/);
    } finally {
      for (const client of clients) {
        await client.query('RESET ROLE');
        client.release();
      }
    }
  });

  it('ARC-01: Outbox Worker Protocol — should claim batch via claim_outbox_batch with SKIP LOCKED and fencing token', async () => {
    // 1. Insert 4 test outbox events
    await query(`
      INSERT INTO outbox_events (workspace_id, event_name, aggregate_type, aggregate_id, payload, idempotency_key, status)
      VALUES
      ('${workspaceAId}', 'test.batch.1', 'Test', gen_random_uuid(), '{}'::jsonb, 'idemp_batch_' || gen_random_uuid()::text, 'PENDING'),
      ('${workspaceAId}', 'test.batch.2', 'Test', gen_random_uuid(), '{}'::jsonb, 'idemp_batch_' || gen_random_uuid()::text, 'PENDING'),
      ('${workspaceAId}', 'test.batch.3', 'Test', gen_random_uuid(), '{}'::jsonb, 'idemp_batch_' || gen_random_uuid()::text, 'PENDING'),
      ('${workspaceAId}', 'test.batch.4', 'Test', gen_random_uuid(), '{}'::jsonb, 'idemp_batch_' || gen_random_uuid()::text, 'PENDING');
    `);

    const clientWorker1 = await dbPool.connect();
    const clientWorker2 = await dbPool.connect();

    try {
      await clientWorker1.query('SET ROLE service_role');
      await clientWorker1.query(`SET "request.jwt.claim.role" = 'service_role'`);

      await clientWorker2.query('SET ROLE service_role');
      await clientWorker2.query(`SET "request.jwt.claim.role" = 'service_role'`);

      // Both claims are issued at the same time on distinct connections.
      const [worker1Claim, worker2Claim] = await Promise.all([
        clientWorker1.query('SELECT * FROM public.claim_outbox_batch($1, $2, $3)', ['worker-1', 2, 60]),
        clientWorker2.query('SELECT * FROM public.claim_outbox_batch($1, $2, $3)', ['worker-2', 2, 60]),
      ]);
      expect(worker1Claim.rowCount).toBe(2);
      expect(worker2Claim.rowCount).toBe(2);
      const worker1Events = worker1Claim.rows;
      const worker2Events = worker2Claim.rows;

      // 3. Verify zero collision between workers
      const worker1Ids = worker1Events.map((r) => r.id);
      const worker2Ids = worker2Events.map((r) => r.id);

      for (const id of worker1Ids) {
        expect(worker2Ids).not.toContain(id);
      }

      // Direct mutation is denied even to the worker role.
      const targetEvent = worker1Events[0];
      const staleToken = randomUUID();
      await expect(
        clientWorker1.query(`UPDATE outbox_events SET status = 'PUBLISHED' WHERE id = $1`, [targetEvent.id])
      ).rejects.toThrow(/permission denied/);

      // Stale tokens and wrong workers are rejected by the guarded RPC.
      await expect(
        clientWorker1.query(`SELECT public.complete_outbox_event($1, $2, $3)`, [targetEvent.id, staleToken, 'worker-1'])
      ).rejects.toThrow(/Stale or invalid outbox claim/);
      await expect(
        clientWorker1.query(`SELECT public.complete_outbox_event($1, $2, $3)`, [targetEvent.id, targetEvent.claim_token, 'worker-2'])
      ).rejects.toThrow(/Stale or invalid outbox claim/);

      await clientWorker1.query(`SELECT public.renew_outbox_lease($1, $2, $3)`, [
        targetEvent.id,
        targetEvent.claim_token,
        'worker-1',
      ]);
      await clientWorker1.query(`SELECT public.complete_outbox_event($1, $2, $3)`, [
        targetEvent.id,
        targetEvent.claim_token,
        'worker-1',
      ]);

      const published = await query('SELECT status, claim_token, locked_by FROM outbox_events WHERE id = $1', [targetEvent.id]);
      expect(published.rows[0]).toMatchObject({ status: 'PUBLISHED', claim_token: null, locked_by: null });

      // Exhausted attempts transition to dead-letter through the failure RPC.
      const deadLetterId = randomUUID();
      await query(`
        INSERT INTO outbox_events (
          id, workspace_id, event_name, aggregate_type, aggregate_id, payload,
          idempotency_key, status, max_attempts, scheduled_for
        ) VALUES (
          '${deadLetterId}', '${workspaceAId}', 'test.dead-letter', 'Test', gen_random_uuid(),
          '{}'::jsonb, 'dead-letter-${deadLetterId}', 'PENDING', 1, NOW() - INTERVAL '1 day'
        )
      `);
      const deadLetterClaim = await clientWorker1.query(
        `SELECT * FROM public.claim_outbox_batch('worker-1', 1, 60)`
      );
      expect(deadLetterClaim.rows[0].id).toBe(deadLetterId);
      const failed = await clientWorker1.query(
        `SELECT public.fail_outbox_event($1, $2, 'worker-1', 'provider unavailable', 0) AS status`,
        [deadLetterId, deadLetterClaim.rows[0].claim_token]
      );
      expect(failed.rows[0].status).toBe('DEAD_LETTER');
    } finally {
      await clientWorker1.query('RESET ROLE');
      await clientWorker2.query('RESET ROLE');
      clientWorker1.release();
      clientWorker2.release();
    }
  });

  it('DAT-01: should safely pseudonimize contact PII as authenticated owner and log audit event', async () => {
    const contactToAnonymizeId = randomUUID();
    const journeyId = randomUUID();
    const messageId = randomUUID();
    const providerMsgId = 'wamid_lgpd_' + randomUUID();
    const dynamicPhone = '+5549' + Math.floor(Math.random() * 89999999 + 10000000);

    await query(`
      INSERT INTO contacts (id, workspace_id, phone, name, email)
      VALUES ('${contactToAnonymizeId}', '${workspaceAId}', '${dynamicPhone}', 'Maria LGPD Test', 'maria@teste.com')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO commercial_journeys (id, workspace_id, contact_id, status, primary_service_or_product)
      VALUES ('${journeyId}', '${workspaceAId}', '${contactToAnonymizeId}', 'WON', 'Serviço Concluído')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO conversation_messages (id, workspace_id, channel_connection_id, journey_id, contact_id, direction, sender_type, provider_message_id, text_content)
      VALUES ('${messageId}', '${workspaceAId}', '${channelAId}', '${journeyId}', '${contactToAnonymizeId}', 'inbound', 'customer', '${providerMsgId}', 'Mensagem confidencial com CPF 123.456.789-00')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Call anonymization procedure AS AUTHENTICATED OWNER
    const client = await dbPool.connect();
    try {
      await client.query('SET ROLE authenticated');
      await client.query(`SET "request.jwt.claim.role" = 'authenticated'`);
      await client.query(`SET "request.jwt.claim.sub" = '${ownerUserId}'`);

      await client.query('SELECT public.anonymize_contact_pii($1, $2, $3)', [
        contactToAnonymizeId, 
        workspaceAId,
        'Solicitação formal do titular via WhatsApp'
      ]);
    } finally {
      await client.query('RESET ROLE');
      client.release();
    }

    // Verify contact PII is pseudonimized
    const contactRes = await query('SELECT phone, name, email FROM contacts WHERE id = $1', [contactToAnonymizeId]);
    expect(contactRes.rowCount).toBe(1);
    expect(contactRes.rows[0].name).toBeNull();
    expect(contactRes.rows[0].email).toBeNull();
    expect(contactRes.rows[0].phone).toMatch(/^REDACTED_/);

    // Verify message text is redacted
    const msgRes = await query('SELECT text_content FROM conversation_messages WHERE id = $1', [messageId]);
    expect(msgRes.rowCount).toBe(1);
    expect(msgRes.rows[0].text_content).toBe('[CONTEUDO_ANONIMIZADO_LGPD]');

    // Verify audit event was logged in compliance_redaction_events
    const auditRes = await query('SELECT * FROM compliance_redaction_events WHERE contact_id = $1', [contactToAnonymizeId]);
    expect(auditRes.rowCount).toBe(1);
    expect(auditRes.rows[0].reason).toBe('Solicitação formal do titular via WhatsApp');
    expect(auditRes.rows[0].requested_by_user_id).toBe(ownerUserId);
    expect(auditRes.rows[0].requested_by_actor).toBe('user');

    // Verify journey remains intact (statutory retention preserved)
    const journeyRes = await query('SELECT status, primary_service_or_product FROM commercial_journeys WHERE id = $1', [journeyId]);
    expect(journeyRes.rowCount).toBe(1);
    expect(journeyRes.rows[0].status).toBe('WON');
  });

  it('DAT-02: redaction rejects nonexistent contacts without creating false audit records', async () => {
    const missingContactId = randomUUID();
    const client = await dbPool.connect();
    try {
      await client.query('SET ROLE authenticated');
      await client.query(`SET "request.jwt.claim.role" = 'authenticated'`);
      await client.query(`SET "request.jwt.claim.sub" = '${ownerUserId}'`);
      await expect(
        client.query('SELECT public.anonymize_contact_pii($1, $2, $3)', [
          missingContactId,
          workspaceAId,
          'Solicitação inválida de teste',
        ])
      ).rejects.toThrow(/not found in workspace/);
    } finally {
      await client.query('RESET ROLE');
      client.release();
    }

    const audit = await query(
      'SELECT count(*)::int AS count FROM compliance_redaction_events WHERE contact_id = $1',
      [missingContactId]
    );
    expect(audit.rows[0].count).toBe(0);
  });
});
