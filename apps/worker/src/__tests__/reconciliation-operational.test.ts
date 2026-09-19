import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import crypto from "node:crypto";
import {
  createTestDatabasePools,
  encryptPayload,
} from "@sos-sales/database";
import { InboxProcessor } from "../processors/inbox-processor";
import { OutboxDispatcher } from "../processors/outbox-dispatcher";
import { WorkerRuntime } from "../index";

describe("Worker Reconciliation & Provider Resilience (CH-03)", () => {
  const { ownerPool, workerPool } = createTestDatabasePools();
  const testMasterKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  let workspaceId: string;
  let channelInstanceId: string;
  let credentialId: string;

  beforeAll(async () => {
    // 1. Provision Organization and Workspace
    const orgRes = await ownerPool.query(`
      INSERT INTO organizations (name, slug)
      VALUES ('Reconciliation Test Org', $1)
      RETURNING id;
    `, [`org-recon-${Date.now()}`]);
    const orgId = orgRes.rows[0].id;

    const wsRes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'Reconciliation Workspace', $2)
      RETURNING id;
    `, [orgId, `ws-recon-${Date.now()}`]);
    workspaceId = wsRes.rows[0].id;

    // 2. Encrypted Credential
    const rawCredentials = JSON.stringify({
      access_token: "EAAB_test_recon_token",
      phone_number_id: "10987654321",
      app_secret: "waba_secret_recon",
    });
    const encrypted = encryptPayload(rawCredentials, testMasterKey);

    const credRes = await ownerPool.query(`
      INSERT INTO provider_credentials (
        workspace_id, provider, account_id, encrypted_payload, iv, auth_tag
      ) VALUES ($1, 'meta_waba', 'waba_acc_recon', $2, $3, $4)
      RETURNING id;
    `, [workspaceId, encrypted.encryptedBase64, encrypted.ivBase64, encrypted.authTagBase64]);
    credentialId = credRes.rows[0].id;

    // 3. Channel Instance
    const chanRes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164,
        endpoint_token_hash, credential_id, is_active
      ) VALUES (
        $1, 'meta_waba', 'Recon Test Line', '+5511999990000',
        $2, $3, true
      ) RETURNING id;
    `, [workspaceId, crypto.createHash("sha256").update(`token-recon-${Date.now()}`).digest("hex"), credentialId]);
    channelInstanceId = chanRes.rows[0].id;
  });

  afterAll(async () => {
    await workerPool.end();
    await ownerPool.end();
  });

  beforeEach(async () => {
    // Clean queue tables strictly for this workspace to avoid interfering with concurrent test suites
    await ownerPool.query("DELETE FROM outbound_commands WHERE workspace_id = $1;", [workspaceId]);
    await ownerPool.query("DELETE FROM channel_webhook_inbox WHERE workspace_id = $1;", [workspaceId]);
    await ownerPool.query("DELETE FROM provider_delivery_events WHERE workspace_id = $1;", [workspaceId]);
    await ownerPool.query("DELETE FROM messages WHERE workspace_id = $1;", [workspaceId]);
  });

  // Helper to create thread and contact for specific phone
  async function createThreadForPhone(phone: string) {
    const contactRes = await ownerPool.query(`
      INSERT INTO contacts (workspace_id, phone_e164, name)
      VALUES ($1, $2, $3)
      ON CONFLICT (workspace_id, phone_e164) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `, [workspaceId, phone, `Contact ${phone}`]);
    const contactId = contactRes.rows[0].id;

    const threadRes = await ownerPool.query(`
      INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status)
      VALUES ($1, $2, $3, 'active')
      ON CONFLICT (workspace_id, channel_instance_id, contact_id) DO UPDATE SET status = EXCLUDED.status
      RETURNING id;
    `, [workspaceId, channelInstanceId, contactId]);
    return threadRes.rows[0].id as string;
  }

  // Helper to enqueue encrypted delivery webhook
  async function enqueueDeliveryWebhook(payload: Record<string, unknown>, eventKey: string) {
    const rawJson = JSON.stringify(payload);
    const rawHash = crypto.createHash("sha256").update(rawJson).digest("hex");
    const aad = `${workspaceId}:${channelInstanceId}:${rawHash}`;
    const enc = encryptPayload(rawJson, testMasterKey, { aad });

    const res = await ownerPool.query(`
      INSERT INTO channel_webhook_inbox (
        channel_instance_id, workspace_id, provider_event_key, raw_payload_hash,
        encrypted_payload, payload_iv, payload_auth_tag, key_version, status, retry_count, max_retries
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 'pending', 0, 5)
      RETURNING id;
    `, [
      channelInstanceId,
      workspaceId,
      eventKey,
      rawHash,
      enc.encryptedBase64,
      enc.ivBase64,
      enc.authTagBase64,
    ]);
    return res.rows[0].id as string;
  }

  describe("Late Webhook Auto-Reconciliation", () => {
    it("should auto-reconcile outbound command to 'sent' when provider_message_id is known", async () => {
      const processor = new InboxProcessor({ masterKeyHex: testMasterKey });
      const phone = "+5511999991001";
      const threadId = await createThreadForPhone(phone);
      const externalId = `wamid.RECON_KNOWN_${Date.now()}`;

      // 1. Create message with known provider_message_id and queued status
      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, provider_message_id, delivery_status, status_rank
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999990000', $4, 'text', 'Known ID Recon', $5, 'queued', 0
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadId, phone, externalId]);
      const msgId = msgRes.rows[0].id;

      // 2. Outbound command stuck in reconciliation_required
      const cmdRes = await ownerPool.query(`
        INSERT INTO outbound_commands (
          workspace_id, channel_instance_id, thread_id, message_id, recipient_e164,
          body, idempotency_key, status, external_message_id, retry_count, max_retries
        ) VALUES (
          $1, $2, $3, $4, $5,
          'Known ID Recon', $6, 'reconciliation_required', $7, 1, 3
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadId, msgId, phone, `cmd-idemp-${Date.now()}`, externalId]);
      const cmdId = cmdRes.rows[0].id;

      // 3. Inbound delivery webhook arrives reporting "delivered"
      const webhookPayload = {
        object: "whatsapp_business_account",
        entry: [{
          id: "WABA_ID",
          changes: [{
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "+5511999990000",
                phone_number_id: "10987654321",
              },
              statuses: [{
                id: externalId,
                status: "delivered",
                timestamp: String(Math.floor(Date.now() / 1000)),
                recipient_id: phone.replace("+", ""),
              }],
            },
          }],
        }],
      };

      const inboxId = await enqueueDeliveryWebhook(webhookPayload, `late-delivered-${Date.now()}`);

      // 4. Worker claims and processes the webhook item
      const claimed = await processor.claimBatch(workerPool, "worker-recon-1", 10);
      const targetItem = claimed.find((i) => i.id === inboxId);
      expect(targetItem).toBeDefined();

      await processor.processItem(workerPool, targetItem!, "worker-recon-1");

      // 5. Verify message transitioned to 'delivered'
      const checkMsg = await ownerPool.query(
        "SELECT delivery_status, status_rank, provider_message_id FROM messages WHERE id = $1",
        [msgId]
      );
      expect(checkMsg.rows[0].delivery_status).toBe("delivered");
      expect(checkMsg.rows[0].status_rank).toBe(20);

      // 6. Verify outbound command was auto-reconciled to 'sent'
      const checkCmd = await ownerPool.query(
        "SELECT status, sent_at, lease_until FROM outbound_commands WHERE id = $1",
        [cmdId]
      );
      expect(checkCmd.rows[0].status).toBe("sent");
      expect(checkCmd.rows[0].sent_at).not.toBeNull();
      expect(checkCmd.rows[0].lease_until).toBeNull();

      // 7. Verify provider_delivery_events was populated
      const checkEvt = await ownerPool.query(
        "SELECT * FROM provider_delivery_events WHERE external_message_id = $1",
        [externalId]
      );
      expect(checkEvt.rows).toHaveLength(1);
      expect(checkEvt.rows[0].message_id).toBe(msgId);
    });

    it("should auto-reconcile outbound command when external_message_id was initially NULL (phone correlation)", async () => {
      const processor = new InboxProcessor({ masterKeyHex: testMasterKey });
      const phone = "+5511999991002";
      const threadId = await createThreadForPhone(phone);
      const lateExternalId = `wamid.RECON_CORRELATED_${Date.now()}`;

      // 1. Message with NULL provider_message_id
      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, provider_message_id, delivery_status, status_rank
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999990000', $4, 'text', 'Correlated Recon', NULL, 'queued', 0
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadId, phone]);
      const msgId = msgRes.rows[0].id;

      // 2. Outbound command stuck in reconciliation_required with NULL external_message_id
      const cmdRes = await ownerPool.query(`
        INSERT INTO outbound_commands (
          workspace_id, channel_instance_id, thread_id, message_id, recipient_e164,
          body, idempotency_key, status, external_message_id, retry_count, max_retries, created_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          'Correlated Recon', $6, 'reconciliation_required', NULL, 1, 3, clock_timestamp()
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadId, msgId, phone, `cmd-corr-${Date.now()}`]);
      const cmdId = cmdRes.rows[0].id;

      // 3. Inbound webhook arrives with provider ID and recipient phone
      const webhookPayload = {
        object: "whatsapp_business_account",
        entry: [{
          id: "WABA_ID",
          changes: [{
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "+5511999990000",
                phone_number_id: "10987654321",
              },
              statuses: [{
                id: lateExternalId,
                status: "sent",
                timestamp: String(Math.floor(Date.now() / 1000)),
                recipient_id: phone.replace("+", ""),
              }],
            },
          }],
        }],
      };

      const inboxId = await enqueueDeliveryWebhook(webhookPayload, `corr-sent-${Date.now()}`);

      // 4. Process webhook
      const claimed = await processor.claimBatch(workerPool, "worker-recon-2", 10);
      const targetItem = claimed.find((i) => i.id === inboxId);
      expect(targetItem).toBeDefined();

      await processor.processItem(workerPool, targetItem!, "worker-recon-2");

      // 5. Assert message was updated with stitched provider_message_id and status
      const checkMsg = await ownerPool.query(
        "SELECT delivery_status, status_rank, provider_message_id FROM messages WHERE id = $1",
        [msgId]
      );
      expect(checkMsg.rows[0].provider_message_id).toBe(lateExternalId);
      expect(checkMsg.rows[0].delivery_status).toBe("sent");
      expect(checkMsg.rows[0].status_rank).toBe(10);

      // 6. Assert command was reconciled to 'sent' and external_message_id was stitched
      const checkCmd = await ownerPool.query(
        "SELECT status, external_message_id, sent_at FROM outbound_commands WHERE id = $1",
        [cmdId]
      );
      expect(checkCmd.rows[0].status).toBe("sent");
      expect(checkCmd.rows[0].external_message_id).toBe(lateExternalId);
      expect(checkCmd.rows[0].sent_at).not.toBeNull();
    });

    it("should auto-reconcile outbound command to 'dead_letter' when provider reports delivery failure", async () => {
      const processor = new InboxProcessor({ masterKeyHex: testMasterKey });
      const phone = "+5511999991003";
      const threadId = await createThreadForPhone(phone);
      const failExternalId = `wamid.RECON_FAIL_${Date.now()}`;

      // 1. Message and command in reconciliation_required
      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, provider_message_id, delivery_status, status_rank
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999990000', $4, 'text', 'Failing Recon', $5, 'queued', 0
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadId, phone, failExternalId]);
      const msgId = msgRes.rows[0].id;

      const cmdRes = await ownerPool.query(`
        INSERT INTO outbound_commands (
          workspace_id, channel_instance_id, thread_id, message_id, recipient_e164,
          body, idempotency_key, status, external_message_id, retry_count, max_retries
        ) VALUES (
          $1, $2, $3, $4, $5,
          'Failing Recon', $6, 'reconciliation_required', $7, 1, 3
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadId, msgId, phone, `cmd-fail-${Date.now()}`, failExternalId]);
      const cmdId = cmdRes.rows[0].id;

      // 2. Inbound webhook reports failure
      const webhookPayload = {
        object: "whatsapp_business_account",
        entry: [{
          id: "WABA_ID",
          changes: [{
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "+5511999990000",
                phone_number_id: "10987654321",
              },
              statuses: [{
                id: failExternalId,
                status: "failed",
                timestamp: String(Math.floor(Date.now() / 1000)),
                recipient_id: phone.replace("+", ""),
                errors: [{ code: 131026, title: "Message undeliverable" }],
              }],
            },
          }],
        }],
      };

      const inboxId = await enqueueDeliveryWebhook(webhookPayload, `late-failed-${Date.now()}`);

      // 3. Process webhook
      const claimed = await processor.claimBatch(workerPool, "worker-recon-3", 10);
      const targetItem = claimed.find((i) => i.id === inboxId);
      expect(targetItem).toBeDefined();

      await processor.processItem(workerPool, targetItem!, "worker-recon-3");

      // 4. Assert message delivery_status = 'failed'
      const checkMsg = await ownerPool.query(
        "SELECT delivery_status, status_rank FROM messages WHERE id = $1",
        [msgId]
      );
      expect(checkMsg.rows[0].delivery_status).toBe("failed");
      expect(checkMsg.rows[0].status_rank).toBe(-1);

      // 5. Assert command transitioned to 'dead_letter'
      const checkCmd = await ownerPool.query(
        "SELECT status, error_message FROM outbound_commands WHERE id = $1",
        [cmdId]
      );
      expect(checkCmd.rows[0].status).toBe("dead_letter");
      expect(checkCmd.rows[0].error_message).toContain("131026");
    });
  });

  describe("Automated Reconciliation Poller (reconcileBatch)", () => {
    it("should recover ambiguous command using pre-existing delivery event in database", async () => {
      const dispatcher = new OutboxDispatcher();
      const phone = "+5511999991004";
      const threadId = await createThreadForPhone(phone);
      const eventExternalId = `wamid.RECON_EVENT_${Date.now()}`;

      // 1. Message and command
      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, provider_message_id, delivery_status, status_rank
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999990000', $4, 'text', 'Event Recovery', $5, 'queued', 0
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadId, phone, eventExternalId]);
      const msgId = msgRes.rows[0].id;

      const cmdRes = await ownerPool.query(`
        INSERT INTO outbound_commands (
          workspace_id, channel_instance_id, thread_id, message_id, recipient_e164,
          body, idempotency_key, status, external_message_id, retry_count, max_retries, lease_until
        ) VALUES (
          $1, $2, $3, $4, $5,
          'Event Recovery', $6, 'reconciliation_required', $7, 1, 3, NULL
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadId, msgId, phone, `cmd-event-${Date.now()}`, eventExternalId]);
      const cmdId = cmdRes.rows[0].id;

      // 2. Pre-existing delivery event
      const eventJson = JSON.stringify({ status: "delivered" });
      const eventHash = crypto.createHash("sha256").update(eventJson).digest("hex");
      const eventEnc = encryptPayload(eventJson, testMasterKey);

      await ownerPool.query(`
        INSERT INTO provider_delivery_events (
          workspace_id, channel_instance_id, message_id, external_message_id,
          external_event_id, recipient_e164, provider, status,
          raw_payload_hash, encrypted_payload, payload_iv, payload_auth_tag, occurred_at
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, 'meta_waba', 'delivered',
          $7, $8, $9, $10, clock_timestamp()
        );
      `, [
        workspaceId,
        channelInstanceId,
        msgId,
        eventExternalId,
        `evt-${Date.now()}`,
        phone,
        eventHash,
        eventEnc.encryptedBase64,
        eventEnc.ivBase64,
        eventEnc.authTagBase64,
      ]);

      // 3. Run reconcileBatch using workerPool
      const reconciled = await dispatcher.reconcileBatch(workerPool, "poller-test-1", 10, 60);
      expect(reconciled).toBeGreaterThanOrEqual(1);

      // 4. Assert command is now 'sent'
      const checkCmd = await ownerPool.query(
        "SELECT status, sent_at, lease_until FROM outbound_commands WHERE id = $1",
        [cmdId]
      );
      expect(checkCmd.rows[0].status).toBe("sent");
      expect(checkCmd.rows[0].sent_at).not.toBeNull();
      expect(checkCmd.rows[0].lease_until).toBeNull();
    });

    it("should release lease without mutating status when ambiguous command is within TTL grace period", async () => {
      const dispatcher = new OutboxDispatcher();
      const phone = "+5511999991005";
      const threadId = await createThreadForPhone(phone);

      // 1. Message and command created 5 seconds ago (within 60s TTL)
      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999990000', $4, 'text', 'Grace Period', 'queued', 0
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadId, phone]);
      const msgId = msgRes.rows[0].id;

      const cmdRes = await ownerPool.query(`
        INSERT INTO outbound_commands (
          workspace_id, channel_instance_id, thread_id, message_id, recipient_e164,
          body, idempotency_key, status, retry_count, max_retries, lease_until, created_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          'Grace Period', $6, 'reconciliation_required',
          0, 3, NULL, clock_timestamp() - INTERVAL '5 seconds'
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadId, msgId, phone, `cmd-grace-${Date.now()}`]);
      const cmdId = cmdRes.rows[0].id;

      // 2. Reconcile with 60s TTL
      await dispatcher.reconcileBatch(workerPool, "poller-test-2", 10, 60);

      // 3. Status remains reconciliation_required and lease_until is cleared
      const checkCmd = await ownerPool.query(
        "SELECT status, lease_until FROM outbound_commands WHERE id = $1",
        [cmdId]
      );
      expect(checkCmd.rows[0].status).toBe("reconciliation_required");
      expect(checkCmd.rows[0].lease_until).toBeNull();
    });

    it("should reschedule ambiguous command to 'pending' for retry when TTL expired and retries available", async () => {
      const dispatcher = new OutboxDispatcher();
      const phone = "+5511999991006";
      const threadId = await createThreadForPhone(phone);

      // 1. Command created 70 seconds ago (expired against 60s TTL), retry_count = 0 < max_retries = 3
      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999990000', $4, 'text', 'Retry Reschedule', 'queued', 0
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadId, phone]);
      const msgId = msgRes.rows[0].id;

      const cmdRes = await ownerPool.query(`
        INSERT INTO outbound_commands (
          workspace_id, channel_instance_id, thread_id, message_id, recipient_e164,
          body, idempotency_key, status, retry_count, max_retries, lease_until, created_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          'Retry Reschedule', $6, 'reconciliation_required',
          0, 3, NULL, clock_timestamp() - INTERVAL '70 seconds'
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadId, msgId, phone, `cmd-resched-${Date.now()}`]);
      const cmdId = cmdRes.rows[0].id;

      // 2. Reconcile with 60s TTL
      const reconciled = await dispatcher.reconcileBatch(workerPool, "poller-test-3", 10, 60);
      expect(reconciled).toBeGreaterThanOrEqual(1);

      // 3. Command is now pending with incremented retry_count
      const checkCmd = await ownerPool.query(
        "SELECT status, retry_count, next_attempt_at, lease_until FROM outbound_commands WHERE id = $1",
        [cmdId]
      );
      expect(checkCmd.rows[0].status).toBe("pending");
      expect(checkCmd.rows[0].retry_count).toBe(1);
      expect(checkCmd.rows[0].next_attempt_at).not.toBeNull();
      expect(checkCmd.rows[0].lease_until).toBeNull();
    });

    it("should transition ambiguous command to 'dead_letter' when TTL expired and retries exhausted", async () => {
      const dispatcher = new OutboxDispatcher();
      const phone = "+5511999991007";
      const threadId = await createThreadForPhone(phone);

      // 1. Command with retry_count = 3 == max_retries = 3, created 70 seconds ago
      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999990000', $4, 'text', 'Max Retries Dead Letter', 'queued', 0
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadId, phone]);
      const msgId = msgRes.rows[0].id;

      const cmdRes = await ownerPool.query(`
        INSERT INTO outbound_commands (
          workspace_id, channel_instance_id, thread_id, message_id, recipient_e164,
          body, idempotency_key, status, retry_count, max_retries, lease_until, created_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          'Max Retries Dead Letter', $6, 'reconciliation_required',
          3, 3, NULL, clock_timestamp() - INTERVAL '70 seconds'
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadId, msgId, phone, `cmd-exhaust-${Date.now()}`]);
      const cmdId = cmdRes.rows[0].id;

      // 2. Reconcile with 60s TTL
      const reconciled = await dispatcher.reconcileBatch(workerPool, "poller-test-4", 10, 60);
      expect(reconciled).toBeGreaterThanOrEqual(1);

      // 3. Command is dead_letter and message is failed
      const checkCmd = await ownerPool.query(
        "SELECT status, error_message, lease_until FROM outbound_commands WHERE id = $1",
        [cmdId]
      );
      expect(checkCmd.rows[0].status).toBe("dead_letter");
      expect(checkCmd.rows[0].error_message).toContain("exhausted");
      expect(checkCmd.rows[0].lease_until).toBeNull();

      const checkMsg = await ownerPool.query(
        "SELECT delivery_status, status_rank FROM messages WHERE id = $1",
        [msgId]
      );
      expect(checkMsg.rows[0].delivery_status).toBe("failed");
      expect(checkMsg.rows[0].status_rank).toBe(-1);
    });
  });

  describe("WorkerRuntime Integration", () => {
    it("should execute reconciliation tick inside runSingleTick and track metrics", async () => {
      const phone = "+5511999991008";
      const threadId = await createThreadForPhone(phone);

      // Insert an expired ambiguous command with retries exhausted BEFORE starting runtime
      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999990000', $4, 'text', 'Runtime Recon', 'queued', 0
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadId, phone]);
      const msgId = msgRes.rows[0].id;

      await ownerPool.query(`
        INSERT INTO outbound_commands (
          workspace_id, channel_instance_id, thread_id, message_id, recipient_e164,
          body, idempotency_key, status, retry_count, max_retries, lease_until, created_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          'Runtime Recon', $6, 'reconciliation_required',
          3, 3, NULL, clock_timestamp() - INTERVAL '100 seconds'
        );
      `, [workspaceId, channelInstanceId, threadId, msgId, phone, `cmd-runtime-${Date.now()}`]);

      const runtime = new WorkerRuntime({
        workerId: "test-reconciliation-runtime",
        masterKeyHex: testMasterKey,
        workerPool,
        pollIntervalMs: 5000,
      });

      await runtime.start();

      // Trigger a tick or wait for background loop to complete reconciliation
      await runtime.runSingleTick();

      const deadline = Date.now() + 4000;
      let reconciled = runtime.getHealth().metrics.reconciled;
      while (reconciled < 1 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
        reconciled = runtime.getHealth().metrics.reconciled;
      }
      expect(reconciled).toBeGreaterThanOrEqual(1);

      await runtime.stop();
    });
  });
});
