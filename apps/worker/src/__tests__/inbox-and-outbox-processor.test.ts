import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import {
  createTestDatabasePools,
  encryptPayload,
  DatabaseSigningSecretResolver,
  resetTestQueueState,
} from "@sos-sales/database";
import {
  ChannelAdapterRegistry,
  type IChannelAdapter,
  type OutboundSendParams,
  type ChannelSendResult,
} from "@sos-sales/application";
import { InboxProcessor } from "../processors/inbox-processor";
import { OutboxDispatcher } from "../processors/outbox-dispatcher";
import { WorkerRuntime } from "../index";

describe("Transactional Inbox Processor & Outbox Dispatcher Integration Tests", () => {
  const { ownerPool, workerPool } = createTestDatabasePools();
  const testMasterKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  let workspaceId: string;
  let channelInstanceId: string;
  let credentialId: string;
  let baseContactId: string;
  let baseThreadId: string;

  beforeAll(async () => {
    // 0. Reset operational queues
    await resetTestQueueState(ownerPool);

    // 1. Provision Organization and Workspace using ownerPool
    const orgRes = await ownerPool.query(`
      INSERT INTO organizations (name, slug)
      VALUES ('Worker Test Org', $1)
      RETURNING id;
    `, [`org-worker-${crypto.randomUUID()}`]);
    const orgId = orgRes.rows[0].id;

    const wsRes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'Worker Workspace', $2)
      RETURNING id;
    `, [orgId, `ws-worker-${crypto.randomUUID()}`]);
    workspaceId = wsRes.rows[0].id;

    // 2. Provision Encrypted Credential for Meta WABA
    const rawCredentials = JSON.stringify({
      access_token: "EAAB_test_worker_token",
      phone_number_id: "10987654321",
      app_secret: "waba_secret_12345",
    });
    const encrypted = encryptPayload(rawCredentials, testMasterKey);

    const credRes = await ownerPool.query(`
      INSERT INTO provider_credentials (
        workspace_id, provider, account_id, encrypted_payload, iv, auth_tag
      ) VALUES ($1, 'meta_waba', 'waba_acc_worker', $2, $3, $4)
      RETURNING id;
    `, [workspaceId, encrypted.encryptedBase64, encrypted.ivBase64, encrypted.authTagBase64]);
    credentialId = credRes.rows[0].id;

    // 3. Provision Channel Instance
    const chanRes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164,
        endpoint_token_hash, credential_id, is_active
      ) VALUES (
        $1, 'meta_waba', 'Worker Test Line', '+5511999991111',
        $2, $3, true
      ) RETURNING id;
    `, [workspaceId, crypto.createHash("sha256").update(`token-${crypto.randomUUID()}`).digest("hex"), credentialId]);
    channelInstanceId = chanRes.rows[0].id;

    // 4. Provision Base Contact and Commercial Thread
    const contactRes = await ownerPool.query(`
      INSERT INTO contacts (workspace_id, phone_e164, name)
      VALUES ($1, '+5511999991111', 'Worker Base Contact')
      ON CONFLICT (workspace_id, phone_e164) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `, [workspaceId]);
    baseContactId = contactRes.rows[0].id;

    const threadRes = await ownerPool.query(`
      INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status)
      VALUES ($1, $2, $3, 'active')
      ON CONFLICT (workspace_id, channel_instance_id, contact_id) DO UPDATE SET status = EXCLUDED.status
      RETURNING id;
    `, [workspaceId, channelInstanceId, baseContactId]);
    baseThreadId = threadRes.rows[0].id;
  });

  afterAll(async () => {
    await resetTestQueueState(ownerPool);
    await workerPool.end();
    await ownerPool.end();
  });

  describe("InboxProcessor under real sos_worker_user role", () => {
    it("should claim and process an inbound message using workerPool, creating contact, thread, and message atomically", async () => {
      const processor = new InboxProcessor({ masterKeyHex: testMasterKey });

      // Build WABA inbound webhook payload
      const wabaPayload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "WHATSAPP_BUSINESS_ACCOUNT_ID",
            changes: [
              {
                field: "messages",
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    display_phone_number: "5511999991111",
                    phone_number_id: "10987654321",
                  },
                  contacts: [
                    {
                      profile: { name: "Maria Silva" },
                      wa_id: "5511988887777",
                    },
                  ],
                  messages: [
                    {
                      from: "5511988887777",
                      id: `wamid.TEST_INBOUND_${crypto.randomUUID()}`,
                      timestamp: "1711234567",
                      type: "text",
                      text: { body: "Olá, tenho interesse no produto!" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const rawJson = JSON.stringify(wabaPayload);
      const rawHash = crypto.createHash("sha256").update(Buffer.from(rawJson)).digest("hex");
      const aad = `${workspaceId}:${channelInstanceId}:${rawHash}`;
      const encrypted = encryptPayload(rawJson, testMasterKey, { aad });

      // Insert into channel_webhook_inbox as pending
      const inboxRes = await ownerPool.query(`
        INSERT INTO channel_webhook_inbox (
          channel_instance_id, workspace_id, provider_event_key, raw_payload_hash,
          encrypted_payload, payload_iv, payload_auth_tag, key_version, status, retry_count, max_retries
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 'pending', 0, 5)
        RETURNING id;
      `, [
        channelInstanceId,
        workspaceId,
        `event-key-${crypto.randomUUID()}`,
        rawHash,
        encrypted.encryptedBase64,
        encrypted.ivBase64,
        encrypted.authTagBase64,
      ]);
      const inboxId = inboxRes.rows[0].id;

      // 1. Claim batch with workerPool (sos_worker_user)
      const claimed = await processor.claimBatch(workerPool, "worker-test-1", 100);
      const targetItem = claimed.find((item) => item.id === inboxId);
      expect(targetItem).toBeDefined();
      expect(targetItem!.lease_token).toBeDefined();

      // 2. Process item with workerPool
      const result = await processor.processItem(workerPool, targetItem!, "worker-test-1");
      expect(result.success).toBe(true);
      expect(result.eventCount).toBe(1);

      // 3. Verify Contact was created under tenant scope
      const contactRes = await ownerPool.query(
        "SELECT * FROM contacts WHERE workspace_id = $1 AND phone_e164 = $2",
        [workspaceId, "+5511988887777"]
      );
      expect(contactRes.rows).toHaveLength(1);
      expect(contactRes.rows[0].name).toBe("Maria Silva");

      // 4. Verify Message was inserted
      const messageRes = await ownerPool.query(
        "SELECT * FROM messages WHERE workspace_id = $1 AND channel_instance_id = $2 AND direction = 'inbound'",
        [workspaceId, channelInstanceId]
      );
      expect(messageRes.rows).toHaveLength(1);
      expect(messageRes.rows[0].body).toBe("Olá, tenho interesse no produto!");
      expect(messageRes.rows[0].delivery_status).toBe("delivered");

      // 5. Verify Inbox row status is processed
      const updatedInboxRes = await ownerPool.query(
        "SELECT status, processed_at, lease_until FROM channel_webhook_inbox WHERE id = $1",
        [inboxId]
      );
      expect(updatedInboxRes.rows[0].status).toBe("processed");
      expect(updatedInboxRes.rows[0].processed_at).not.toBeNull();
      expect(updatedInboxRes.rows[0].lease_until).toBeNull();
    });

    it("should recover an expired processing lease and assign a new lease_token", async () => {
      const processor = new InboxProcessor({ masterKeyHex: testMasterKey });

      const rawJson = JSON.stringify({ ping: "expired" });
      const rawHash = crypto.createHash("sha256").update(rawJson).digest("hex");
      const aad = `${workspaceId}:${channelInstanceId}:${rawHash}`;
      const encrypted = encryptPayload(rawJson, testMasterKey, { aad });

      // Insert item stuck in 'processing' with lease_until in the past
      const inboxRes = await ownerPool.query(`
        INSERT INTO channel_webhook_inbox (
          channel_instance_id, workspace_id, provider_event_key, raw_payload_hash,
          encrypted_payload, payload_iv, payload_auth_tag, key_version, status,
          worker_id, lease_token, lease_until, retry_count, max_retries
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, 1, 'processing',
          'dead-worker', gen_random_uuid(), clock_timestamp() - INTERVAL '10 seconds', 1, 5
        ) RETURNING id, lease_token;
      `, [
        channelInstanceId,
        workspaceId,
        `expired-lease-${crypto.randomUUID()}`,
        rawHash,
        encrypted.encryptedBase64,
        encrypted.ivBase64,
        encrypted.authTagBase64,
      ]);
      const inboxId = inboxRes.rows[0].id;
      const oldLeaseToken = inboxRes.rows[0].lease_token;

      // Claim with active worker using workerPool
      const claimed = await processor.claimBatch(workerPool, "recovering-worker", 10);
      const recoveredItem = claimed.find((i) => i.id === inboxId);
      expect(recoveredItem).toBeDefined();
      expect(recoveredItem!.lease_token).not.toBe(oldLeaseToken);

      // Verify DB reflects new worker and lease
      const checkRes = await ownerPool.query(
        "SELECT status, worker_id, lease_token FROM channel_webhook_inbox WHERE id = $1",
        [inboxId]
      );
      expect(checkRes.rows[0].status).toBe("processing");
      expect(checkRes.rows[0].worker_id).toBe("recovering-worker");
      expect(checkRes.rows[0].lease_token).toBe(recoveredItem!.lease_token);
    });

    it("should prevent a stale worker from finalizing an item after fencing token change", async () => {
      const processor = new InboxProcessor({ masterKeyHex: testMasterKey });

      const rawJson = JSON.stringify({ ping: "fencing" });
      const rawHash = crypto.createHash("sha256").update(rawJson).digest("hex");
      const aad = `${workspaceId}:${channelInstanceId}:${rawHash}`;
      const encrypted = encryptPayload(rawJson, testMasterKey, { aad });

      // Insert item
      const inboxRes = await ownerPool.query(`
        INSERT INTO channel_webhook_inbox (
          channel_instance_id, workspace_id, provider_event_key, raw_payload_hash,
          encrypted_payload, payload_iv, payload_auth_tag, key_version, status,
          worker_id, lease_token, lease_until, retry_count, max_retries
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, 1, 'processing',
          'worker-old', gen_random_uuid(), clock_timestamp() + INTERVAL '30 seconds', 1, 5
        ) RETURNING id, lease_token;
      `, [
        channelInstanceId,
        workspaceId,
        `fencing-test-${crypto.randomUUID()}`,
        rawHash,
        encrypted.encryptedBase64,
        encrypted.ivBase64,
        encrypted.authTagBase64,
      ]);
      const inboxId = inboxRes.rows[0].id;
      const oldLeaseToken = inboxRes.rows[0].lease_token;

      // Simulate lease recovery by another worker (fencing token rotated)
      const newLeaseToken = crypto.randomUUID();
      await ownerPool.query(`
        UPDATE channel_webhook_inbox
        SET worker_id = 'worker-new', lease_token = $1
        WHERE id = $2;
      `, [newLeaseToken, inboxId]);

      // Old worker attempts to process item with stale lease_token
      const staleItem = {
        id: inboxId,
        workspace_id: workspaceId,
        channel_instance_id: channelInstanceId,
        encrypted_payload: encrypted.encryptedBase64,
        payload_iv: encrypted.ivBase64,
        payload_auth_tag: encrypted.authTagBase64,
        key_version: 1,
        retry_count: 1,
        max_retries: 5,
        raw_payload_hash: rawHash,
        lease_token: oldLeaseToken,
      };

      const result = await processor.processItem(workerPool, staleItem, "worker-old");
      expect(result.success).toBe(false);

      // Status in DB must NOT be processed by worker-old
      const checkRes = await ownerPool.query(
        "SELECT status, worker_id, lease_token FROM channel_webhook_inbox WHERE id = $1",
        [inboxId]
      );
      expect(checkRes.rows[0].status).not.toBe("processed");
      expect(checkRes.rows[0].worker_id).toBe("worker-new");
    });

    it("should reconcile delivery status arriving before the message itself", async () => {
      const processor = new InboxProcessor({ masterKeyHex: testMasterKey });
      const externalMessageId = `wamid.PRE_DELIVERY_${crypto.randomUUID()}`;

      // 1. Delivery webhook arrives first
      const deliveredWebhook = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "WABA_ID",
            changes: [
              {
                field: "messages",
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    display_phone_number: "5511999991111",
                    phone_number_id: "10987654321",
                  },
                  statuses: [
                    {
                      id: externalMessageId,
                      status: "delivered",
                      timestamp: "1711234999",
                      recipient_id: "5511977770000",
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const delJson = JSON.stringify(deliveredWebhook);
      const delHash = crypto.createHash("sha256").update(delJson).digest("hex");
      const delEncrypted = encryptPayload(delJson, testMasterKey, { aad: `${workspaceId}:${channelInstanceId}:${delHash}` });

      const delInboxRes = await ownerPool.query(`
        INSERT INTO channel_webhook_inbox (
          channel_instance_id, workspace_id, provider_event_key, raw_payload_hash,
          encrypted_payload, payload_iv, payload_auth_tag, key_version, status, retry_count, max_retries
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 'pending', 0, 5)
        RETURNING id;
      `, [
        channelInstanceId,
        workspaceId,
        `pre-delivery-${crypto.randomUUID()}`,
        delHash,
        delEncrypted.encryptedBase64,
        delEncrypted.ivBase64,
        delEncrypted.authTagBase64,
      ]);
      const delInboxId = delInboxRes.rows[0].id;

      // Claim and process delivery webhook (message does not exist yet)
      const claimedDel = await processor.claimBatch(workerPool, "worker-test-1", 100);
      const targetDel = claimedDel.find((i) => i.id === delInboxId);
      expect(targetDel).toBeDefined();
      await processor.processItem(workerPool, targetDel!, "worker-test-1");

      // Verify delivery event was recorded with message_id = NULL
      const evtRes = await ownerPool.query(
        "SELECT * FROM provider_delivery_events WHERE external_message_id = $1",
        [externalMessageId]
      );
      expect(evtRes.rows).toHaveLength(1);
      expect(evtRes.rows[0].message_id).toBeNull();
      expect(evtRes.rows[0].status).toBe("delivered");
    });
  });

  describe("OutboxDispatcher under real sos_worker_user role", () => {
    beforeAll(async () => {
      await resetTestQueueState(ownerPool);
    });

    it("should strictly update ONLY the exact message_id referenced by the command, leaving other queued thread messages untouched", async () => {
      const dispatcher = new OutboxDispatcher();
      const registry = new ChannelAdapterRegistry();

      const mockAdapter: IChannelAdapter = {
        provider: "meta_waba",
        async sendMessage(params: OutboundSendParams): Promise<ChannelSendResult> {
          return {
            success: true,
            externalMessageId: `wamid.SUCCESS_${params.commandId}`,
            sentAt: new Date(),
          };
        },
      };
      registry.register(mockAdapter);

      const secretResolver = new DatabaseSigningSecretResolver({
        pool: workerPool,
        masterKeyHex: testMasterKey,
      });

      // 1. Create a contact and thread
      const contactRes = await ownerPool.query(`
        INSERT INTO contacts (workspace_id, phone_e164, name)
        VALUES ($1, '+5511999998888', 'Multi-Queue Contact')
        RETURNING id;
      `, [workspaceId]);
      const contactId = contactRes.rows[0].id;

      const threadRes = await ownerPool.query(`
        INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status)
        VALUES ($1, $2, $3, 'active')
        RETURNING id;
      `, [workspaceId, channelInstanceId, contactId]);
      const threadId = threadRes.rows[0].id;

      // 2. Insert TWO queued messages in the exact same thread
      const msg1Res = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999991111', '+5511999998888', 'text', 'Message 1 to be sent', 'queued', 0
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadId]);
      const message1Id = msg1Res.rows[0].id;

      const msg2Res = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999991111', '+5511999998888', 'text', 'Message 2 should remain queued', 'queued', 0
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadId]);
      const message2Id = msg2Res.rows[0].id;

      // 3. Insert outbound command referencing ONLY Message 1
      const outboxRes = await ownerPool.query(`
        INSERT INTO outbound_commands (
          workspace_id, channel_instance_id, thread_id, message_id,
          recipient_e164, body, idempotency_key, status
        ) VALUES (
          $1, $2, $3, $4,
          '+5511999998888', 'Message 1 to be sent', $5, 'pending'
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadId, message1Id, `idemp-${crypto.randomUUID()}`]);
      const commandId = outboxRes.rows[0].id;

      // 4. Claim and dispatch with workerPool
      const claimed = await dispatcher.claimBatch(workerPool, "worker-outbox-1", 10);
      const targetItem = claimed.find((c) => c.id === commandId);
      expect(targetItem).toBeDefined();

      const result = await dispatcher.dispatchItem(workerPool, targetItem!, "worker-outbox-1", registry, secretResolver);
      expect(result.success).toBe(true);

      // 5. Verify P0 condition: Message 1 progressed to 'sent', Message 2 strictly remains 'queued'
      const msg1Check = await ownerPool.query("SELECT delivery_status, provider_message_id FROM messages WHERE id = $1", [message1Id]);
      expect(msg1Check.rows[0].delivery_status).toBe("sent");
      expect(msg1Check.rows[0].provider_message_id).toBe(`wamid.SUCCESS_${commandId}`);

      const msg2Check = await ownerPool.query("SELECT delivery_status, provider_message_id FROM messages WHERE id = $1", [message2Id]);
      expect(msg2Check.rows[0].delivery_status).toBe("queued");
      expect(msg2Check.rows[0].provider_message_id).toBeNull();
    });

    it("should transition ambiguous timeout to reconciliation_required and NOT schedule normal retry", async () => {
      const dispatcher = new OutboxDispatcher();
      const registry = new ChannelAdapterRegistry();

      const mockTimeoutAdapter: IChannelAdapter = {
        provider: "meta_waba",
        async sendMessage(): Promise<ChannelSendResult> {
          return {
            success: false,
            category: "ambiguous",
            errorCode: "NETWORK_TIMEOUT",
            errorMessage: "Socket hang up before response was received",
          };
        },
      };
      registry.register(mockTimeoutAdapter);

      const secretResolver = new DatabaseSigningSecretResolver({
        pool: workerPool,
        masterKeyHex: testMasterKey,
      });

      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999991111', '+5511999995555', 'text', 'Ambiguous test', 'queued', 0
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, baseThreadId]);
      const messageId = msgRes.rows[0].id;

      const outboxRes = await ownerPool.query(`
        INSERT INTO outbound_commands (
          workspace_id, channel_instance_id, message_id, recipient_e164, body, idempotency_key, status
        ) VALUES ($1, $2, $3, '+5511999995555', 'Ambiguous test', $4, 'pending')
        RETURNING id;
      `, [workspaceId, channelInstanceId, messageId, `timeout-${crypto.randomUUID()}`]);
      const commandId = outboxRes.rows[0].id;

      const claimed = await dispatcher.claimBatch(workerPool, "worker-outbox-1", 10);
      const targetItem = claimed.find((c) => c.id === commandId);
      expect(targetItem).toBeDefined();

      const result = await dispatcher.dispatchItem(workerPool, targetItem!, "worker-outbox-1", registry, secretResolver);
      expect(result.success).toBe(false);
      expect(result.status).toBe("reconciliation_required");

      // Verify DB status is reconciliation_required
      const updatedRes = await ownerPool.query(
        "SELECT status, lease_until, error_message FROM outbound_commands WHERE id = $1",
        [commandId]
      );
      expect(updatedRes.rows[0].status).toBe("reconciliation_required");
      expect(updatedRes.rows[0].lease_until).toBeNull();
      expect(updatedRes.rows[0].error_message).toContain("NETWORK_TIMEOUT");

      // Verify that subsequent claimBatch does NOT claim reconciliation_required commands!
      const subsequentClaim = await dispatcher.claimBatch(workerPool, "worker-outbox-2", 10);
      const forbiddenClaim = subsequentClaim.find((c) => c.id === commandId);
      expect(forbiddenClaim).toBeUndefined();
    });

    it("should enforce fencing preventing a stale worker from completing an outbound command", async () => {
      const dispatcher = new OutboxDispatcher();
      const registry = new ChannelAdapterRegistry();

      const mockAdapter: IChannelAdapter = {
        provider: "meta_waba",
        async sendMessage(): Promise<ChannelSendResult> {
          return {
            success: true,
            externalMessageId: "wamid.STALE_FINISH",
            sentAt: new Date(),
          };
        },
      };
      registry.register(mockAdapter);

      const secretResolver = new DatabaseSigningSecretResolver({
        pool: workerPool,
        masterKeyHex: testMasterKey,
      });

      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999991111', '+5511999996666', 'text', 'Fencing outbox test', 'queued', 0
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, baseThreadId]);
      const messageId = msgRes.rows[0].id;

      const oldLeaseToken = crypto.randomUUID();
      const fencingKey = `fencing-outbox-${crypto.randomUUID()}`;
      const outboxRes = await ownerPool.query(`
        INSERT INTO outbound_commands (
          workspace_id, channel_instance_id, message_id, recipient_e164, body, idempotency_key,
          status, worker_id, lease_token, lease_until
        ) VALUES (
          $1, $2, $3, '+5511999996666', 'Fencing outbox test', $4,
          'processing', 'worker-old', $5, clock_timestamp() + INTERVAL '30 seconds'
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, messageId, fencingKey, oldLeaseToken]);
      const commandId = outboxRes.rows[0].id;

      // Simulate fencing update (e.g. lease recovered by worker-new)
      await ownerPool.query(`
        UPDATE outbound_commands
        SET worker_id = 'worker-new', lease_token = gen_random_uuid()
        WHERE id = $1;
      `, [commandId]);

      const staleItem = {
        id: commandId,
        workspace_id: workspaceId,
        channel_instance_id: channelInstanceId,
        thread_id: null,
        message_id: messageId,
        recipient_e164: "+5511999996666",
        body: "Fencing outbox test",
        media_url: null,
        idempotency_key: fencingKey,
        retry_count: 1,
        max_retries: 5,
        lease_token: oldLeaseToken,
      };

      // Dispatch should fail with FENCING_VIOLATION
      await expect(
        dispatcher.dispatchItem(workerPool, staleItem, "worker-old", registry, secretResolver)
      ).rejects.toThrow("FENCING_VIOLATION");
    });
  });

  describe("WorkerRuntime Lifecycle", () => {
    it("should start, report health, execute single tick, and stop cleanly without leaving handles open", async () => {
      const runtime = new WorkerRuntime({
        workerId: "test-runtime-lifecycle",
        masterKeyHex: testMasterKey,
        workerPool: workerPool,
        pollIntervalMs: 500,
        batchSize: 5,
      });

      await runtime.start();

      // P1: Health is NOT healthy before the first successful cycle has completed
      const initialHealth = runtime.getHealth();
      expect(initialHealth.alive).toBe(true);
      expect(initialHealth.healthy).toBe(false);
      expect(initialHealth.firstCycleCompleted).toBe(false);
      expect(initialHealth.workerId).toBe("test-runtime-lifecycle");

      const tickResult = await runtime.runSingleTick();
      expect(tickResult).toHaveProperty("inboxProcessed");
      expect(tickResult).toHaveProperty("outboxDispatched");

      // After first successful cycle, healthy is true
      const runningHealth = runtime.getHealth();
      expect(runningHealth.alive).toBe(true);
      expect(runningHealth.healthy).toBe(true);
      expect(runningHealth.firstCycleCompleted).toBe(true);

      await runtime.stop();

      const stoppedHealth = runtime.getHealth();
      expect(stoppedHealth.alive).toBe(false);
      expect(stoppedHealth.healthy).toBe(false);
    });
  });
});
