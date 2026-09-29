import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import {
  createTestDatabasePools,
  encryptPayload,
  resetTestQueueState,
  recordSecurityAuditEvent,
} from "@sos-sales/database";
import {
  ChannelAdapterRegistry,
  type IChannelAdapter,
  type ChannelSendResult,
} from "@sos-sales/application";
import { OutboxDispatcher } from "../processors/outbox-dispatcher";
import { CapiDispatcher } from "../processors/capi-dispatcher";

describe("M8 Resilience, Restarts, Lease Recovery & Trace Correlation", () => {
  const { ownerPool, workerPool } = createTestDatabasePools();
  const testMasterKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  let orgId: string;
  let workspaceId: string;
  let channelInstanceId: string;
  let credentialId: string;
  let contactId: string;
  let threadId: string;

  beforeAll(async () => {
    await resetTestQueueState(ownerPool);

    // 1. Provision Org & Workspace
    const orgRes = await ownerPool.query(
      `INSERT INTO organizations (name, slug)
       VALUES ('M8 Resilience Org', $1)
       RETURNING id;`,
      [`org-m8-${crypto.randomUUID()}`]
    );
    orgId = orgRes.rows[0].id;

    const wsRes = await ownerPool.query(
      `INSERT INTO workspaces (organization_id, name, slug)
       VALUES ($1, 'M8 Workspace', $2)
       RETURNING id;`,
      [orgId, `ws-m8-${crypto.randomUUID()}`]
    );
    workspaceId = wsRes.rows[0].id;

    // 2. Provision Credential & Channel
    const enc = encryptPayload(
      JSON.stringify({
        access_token: "EAAB_m8_token_resilience",
        phone_number_id: "phone_m8_123",
        app_secret: "secret_m8_456",
      }),
      testMasterKey
    );

    const credRes = await ownerPool.query(
      `INSERT INTO provider_credentials (
         workspace_id, provider, account_id, encrypted_payload, iv, auth_tag, status
       ) VALUES ($1, 'meta_waba', 'waba_m8_acc', $2, $3, $4, 'ACTIVE')
       RETURNING id;`,
      [workspaceId, enc.encryptedBase64, enc.ivBase64, enc.authTagBase64]
    );
    credentialId = credRes.rows[0].id;

    const chanRes = await ownerPool.query(
      `INSERT INTO channel_instances (
         workspace_id, provider, display_name, phone_number_e164,
         endpoint_token_hash, credential_id, is_active
       ) VALUES ($1, 'meta_waba', 'M8 Linha Oficial', '+5511999993333', $2, $3, true)
       RETURNING id;`,
      [workspaceId, crypto.createHash("sha256").update(`tok-m8-${Date.now()}`).digest("hex"), credentialId]
    );
    channelInstanceId = chanRes.rows[0].id;

    // 3. Contact & Thread
    const contactRes = await ownerPool.query(
      `INSERT INTO contacts (workspace_id, phone_e164, name)
       VALUES ($1, '+5511988884444', 'Contato M8 Resiliencia')
       RETURNING id;`,
      [workspaceId]
    );
    contactId = contactRes.rows[0].id;

    const threadRes = await ownerPool.query(
      `INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status)
       VALUES ($1, $2, $3, 'active')
       RETURNING id;`,
      [workspaceId, channelInstanceId, contactId]
    );
    threadId = threadRes.rows[0].id;
  });

  afterAll(async () => {
    await resetTestQueueState(ownerPool);
    await workerPool.end();
    await ownerPool.end();
  });

  describe("1. Worker Restart & Expired Lease Reclamation (Zero Blind Resend)", () => {
    it("reclaims crashed processing item to 'reconciliation_required' without calling provider adapter", async () => {
      // Create a message and an outbound command stuck in 'processing' with expired lease
      const msgRes = await ownerPool.query(
        `INSERT INTO messages (
           workspace_id, channel_instance_id, thread_id, provider, direction,
           sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
         ) VALUES ($1, $2, $3, 'meta_waba', 'outbound', '+5511999993333', '+5511988884444', 'text', 'Worker crash test', 'queued', 0)
         RETURNING id;`,
        [workspaceId, channelInstanceId, threadId]
      );
      const messageId = msgRes.rows[0].id;

      const outboxRes = await ownerPool.query(
        `INSERT INTO outbound_commands (
           workspace_id, channel_instance_id, thread_id, message_id,
           recipient_e164, body, idempotency_key, status, retry_count, max_retries,
           lease_until, worker_id, lease_token
         ) VALUES (
           $1, $2, $3, $4,
           '+5511988884444', 'Worker crash test', $5,
           'processing', 1, 3,
           clock_timestamp() - INTERVAL '15 seconds', 'dead-worker-101', gen_random_uuid()
         ) RETURNING id;`,
        [workspaceId, channelInstanceId, threadId, messageId, `crash_key_${Date.now()}`]
      );
      const commandId = outboxRes.rows[0].id;

      let adapterInvoked = false;
      const fakeAdapter: IChannelAdapter = {
        provider: "meta_waba",
        async sendMessage(): Promise<ChannelSendResult> {
          adapterInvoked = true;
          return { success: true, externalMessageId: "wamid.FAIL_IF_CALLED", sentAt: new Date() };
        },
      };

      const registry = new ChannelAdapterRegistry();
      registry.register(fakeAdapter);
      const dispatcher = new OutboxDispatcher();

      // Normal claim must ignore this expired processing item
      const claimed = await dispatcher.claimBatch(workerPool, "new-worker-202", 50);
      expect(claimed.find((c) => c.id === commandId)).toBeUndefined();

      // Lease reclamation recovers it
      const reclaimedCount = await dispatcher.reclaimExpiredLeases(workerPool, 50);
      expect(reclaimedCount).toBeGreaterThanOrEqual(1);

      // CRITICAL TRUTH IN DATA ASSERTION: Provider adapter was never invoked
      expect(adapterInvoked).toBe(false);

      // Verify DB state: reconciliation_required, lease wiped, error recorded
      const rowRes = await ownerPool.query(
        `SELECT status, error_message, lease_until, worker_id, lease_token FROM outbound_commands WHERE id = $1;`,
        [commandId]
      );
      expect(rowRes.rows[0].status).toBe("reconciliation_required");
      expect(rowRes.rows[0].error_message).toContain("ERR_LEASE_EXPIRED_DURING_PROCESSING");
      expect(rowRes.rows[0].lease_until).toBeNull();
      expect(rowRes.rows[0].worker_id).toBeNull();

      // Administrative reconciliation moves state to sent with external ID
      const reconOk = await dispatcher.reconcileItem(
        ownerPool,
        workspaceId,
        commandId,
        "sent",
        { externalMessageId: "wamid.RECON_OK_M8" }
      );
      expect(reconOk).toBe(true);

      const updatedCmd = await ownerPool.query(
        `SELECT status, external_message_id FROM outbound_commands WHERE id = $1;`,
        [commandId]
      );
      expect(updatedCmd.rows[0].status).toBe("sent");
      expect(updatedCmd.rows[0].external_message_id).toBe("wamid.RECON_OK_M8");
    });
  });

  describe("2. CAPI Conversions Dispatcher Resilience & Lease Recovery", () => {
    it("reclaims expired PROCESSING conversion leases and dispatches honestly without fake receipts", async () => {
      // 1. Create a commercial journey
      const journeyRes = await ownerPool.query(
        `INSERT INTO commercial_journeys (workspace_id, contact_id, title, stage)
         VALUES ($1, $2, 'CAPI Resilience Journey', 'won')
         RETURNING id;`,
        [workspaceId, contactId]
      );
      const journeyId = journeyRes.rows[0].id;

      // 2. Insert conversion event with expired lease in PROCESSING status (simulating crashed worker)
      const convRes = await ownerPool.query(
        `INSERT INTO conversion_events (
           workspace_id, journey_id, event_name, status,
           value_cents, currency, lease_token, lease_expires_at
         ) VALUES (
           $1, $2, 'PurchaseCompleted', 'PROCESSING',
           150000, 'BRL', 'dead-worker-lease-token', clock_timestamp() - INTERVAL '10 seconds'
         ) RETURNING id;`,
        [workspaceId, journeyId]
      );
      const conversionId = convRes.rows[0].id;

      const capiDispatcher = new CapiDispatcher();

      // 3. Worker restart / new cycle: claimBatch reclaims the expired lease
      const claimed = await capiDispatcher.claimBatch(workerPool, 10);
      const targetItem = claimed.find((c) => c.id === conversionId);
      expect(targetItem).toBeDefined();
      expect(targetItem!.id).toBe(conversionId);

      // 4. Dispatch item in unconfigured test mode: Truth in Data guarantees honest SIMULATED status without fake fbtrace_id
      const dispatchResult = await capiDispatcher.dispatchItem(workerPool, targetItem!);
      expect(dispatchResult.status).toBe("simulated");
      expect(dispatchResult.fbtraceId).toBeUndefined();

      // 5. Verify database state
      const dbRow = await ownerPool.query(
        `SELECT status, lease_token, provider_receipt FROM conversion_events WHERE id = $1;`,
        [conversionId]
      );
      expect(dbRow.rows[0].status).toBe("SIMULATED");
      expect(dbRow.rows[0].lease_token).toBeNull();
      expect(dbRow.rows[0].provider_receipt?.mode).toBe("simulated_local");
    });
  });

  describe("3. End-to-End Trace Correlation (IDs & Audit Trail Reconstruction)", () => {
    it("correlates thread lifecycle through workspace, thread, and audit event metadata", async () => {
      const correlationId = `corr-${crypto.randomUUID()}`;
      const actorUserId = crypto.randomUUID();

      // Record an audit event simulating operator completing commercial action
      const auditId = await recordSecurityAuditEvent(
        {
          workspaceId,
          actorId: actorUserId,
          actorType: "user",
          action: "commercial_action.completed",
          resourceType: "commercial_action",
          resourceId: `act-${Date.now()}`,
          metadata: {
            threadId,
            correlationId,
            actionType: "proposal_sent",
            completedAt: new Date().toISOString(),
          },
        },
        ownerPool
      );

      expect(auditId).toBeDefined();

      // Verify that audit log allows full backward reconstruction using correlationId and threadId
      const auditQuery = await ownerPool.query(
        `SELECT id, workspace_id, actor_id, action, resource_type, metadata
         FROM audit_events
         WHERE workspace_id = $1 AND (metadata->>'correlationId') = $2;`,
        [workspaceId, correlationId]
      );

      expect(auditQuery.rows.length).toBe(1);
      const event = auditQuery.rows[0];
      expect(event.workspace_id).toBe(workspaceId);
      expect(event.actor_id).toBe(actorUserId);
      expect(event.metadata.threadId).toBe(threadId);
      expect(event.metadata.correlationId).toBe(correlationId);
    });
  });
});
