import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import {
  createTestDatabasePools,
  encryptPayload,
  DatabaseSigningSecretResolver,
  acquireOutboxTestLock,
  type OutboxTestLock,
} from "@sos-sales/database";
import {
  ChannelAdapterRegistry,
  type IChannelAdapter,
  type OutboundSendParams,
  type ChannelSendResult,
} from "@sos-sales/application";
import { InboxProcessor } from "../processors/inbox-processor";
import { OutboxDispatcher } from "../processors/outbox-dispatcher";

describe("CH-02 — Multi-Worker Concurrency, Distributed Lease, Heartbeat & Fencing", () => {
  const { ownerPool, workerPool } = createTestDatabasePools();
  const testMasterKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  let outboxLock: OutboxTestLock;
  let orgId: string;
  let workspaceId: string;
  let channelInstanceId: string;
  let credentialId: string;
  let contactId: string;
  let threadId: string;

  beforeAll(async () => {
    // 0. Acquire exclusive global queue test lock
    outboxLock = await acquireOutboxTestLock(ownerPool);

    // 1. Provision Organization and Workspace
    const orgRes = await ownerPool.query(`
      INSERT INTO organizations (name, slug)
      VALUES ('Concurrency Test Org', $1)
      RETURNING id;
    `, [`org-conc-${Date.now()}`]);
    orgId = orgRes.rows[0].id;

    const wsRes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'Concurrency Workspace', $2)
      RETURNING id;
    `, [orgId, `ws-conc-${Date.now()}`]);
    workspaceId = wsRes.rows[0].id;

    // 2. Provision Encrypted Credential
    const rawCredentials = JSON.stringify({
      access_token: "EAAB_test_concurrency_token",
      phone_number_id: "10987654321",
      app_secret: "waba_secret_concurrency",
    });
    const encrypted = encryptPayload(rawCredentials, testMasterKey);

    const credRes = await ownerPool.query(`
      INSERT INTO provider_credentials (
        workspace_id, provider, account_id, encrypted_payload, iv, auth_tag
      ) VALUES ($1, 'meta_waba', 'waba_acc_conc', $2, $3, $4)
      RETURNING id;
    `, [workspaceId, encrypted.encryptedBase64, encrypted.ivBase64, encrypted.authTagBase64]);
    credentialId = credRes.rows[0].id;

    // 3. Provision Channel Instance
    const chanRes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164,
        endpoint_token_hash, credential_id, is_active
      ) VALUES (
        $1, 'meta_waba', 'Concurrency Test Line', '+5511999993333',
        $2, $3, true
      ) RETURNING id;
    `, [workspaceId, crypto.createHash("sha256").update(`token-conc-${Date.now()}`).digest("hex"), credentialId]);
    channelInstanceId = chanRes.rows[0].id;

    // 4. Provision Contact & Thread
    const contactRes = await ownerPool.query(`
      INSERT INTO contacts (workspace_id, phone_e164, name)
      VALUES ($1, '+5511999994444', 'Concurrency Contact')
      ON CONFLICT (workspace_id, phone_e164) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `, [workspaceId]);
    contactId = contactRes.rows[0].id;

    const threadRes = await ownerPool.query(`
      INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status)
      VALUES ($1, $2, $3, 'active')
      ON CONFLICT (workspace_id, channel_instance_id, contact_id) DO UPDATE SET status = EXCLUDED.status
      RETURNING id;
    `, [workspaceId, channelInstanceId, contactId]);
    threadId = threadRes.rows[0].id;
  });

  afterAll(async () => {
    await outboxLock.release();
    await workerPool.end();
    await ownerPool.end();
  });

  describe("1. Multi-Worker Concurrent Claiming with FOR UPDATE SKIP LOCKED", () => {
    it("should partition outbox commands between two concurrent workers with zero overlap", async () => {
      const dispatcher = new OutboxDispatcher();
      const totalItems = 10;
      const createdCommandIds: string[] = [];

      // Create 10 pending outbound commands
      for (let i = 0; i < totalItems; i++) {
        const msgRes = await ownerPool.query(`
          INSERT INTO messages (
            workspace_id, channel_instance_id, thread_id, provider, direction,
            sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
          ) VALUES (
            $1, $2, $3, 'meta_waba', 'outbound',
            '+5511999993333', '+5511999994444', 'text', $4, 'queued', 0
          ) RETURNING id;
        `, [workspaceId, channelInstanceId, threadId, `Concurrent command message ${i}`]);
        const msgId = msgRes.rows[0].id;

        const cmdRes = await ownerPool.query(`
          INSERT INTO outbound_commands (
            workspace_id, channel_instance_id, thread_id, message_id,
            recipient_e164, body, idempotency_key, status
          ) VALUES (
            $1, $2, $3, $4,
            '+5511999994444', $5, $6, 'pending'
          ) RETURNING id;
        `, [workspaceId, channelInstanceId, threadId, msgId, `Body ${i}`, `idemp-conc-${Date.now()}-${i}`]);
        createdCommandIds.push(cmdRes.rows[0].id);
      }

      // Concurrently claim 5 items with worker-alpha and 5 with worker-beta
      const [batchAlpha, batchBeta] = await Promise.all([
        dispatcher.claimBatch(workerPool, "worker-alpha", 5),
        dispatcher.claimBatch(workerPool, "worker-beta", 5),
      ]);

      expect(batchAlpha.length).toBe(5);
      expect(batchBeta.length).toBe(5);

      const alphaIds = new Set(batchAlpha.map((c) => c.id));
      const betaIds = new Set(batchBeta.map((c) => c.id));

      // Assert zero intersection: no command was claimed by both workers!
      const overlap = [...alphaIds].filter((id) => betaIds.has(id));
      expect(overlap.length).toBe(0);

      // Verify that workers got distinct lease tokens and worker IDs in the DB
      for (const item of batchAlpha) {
        expect(item.lease_token).toBeDefined();
        const checkRes = await ownerPool.query(
          "SELECT worker_id, status FROM outbound_commands WHERE id = $1;",
          [item.id]
        );
        expect(checkRes.rows[0].worker_id).toBe("worker-alpha");
        expect(checkRes.rows[0].status).toBe("processing");
      }

      for (const item of batchBeta) {
        expect(item.lease_token).toBeDefined();
        const checkRes = await ownerPool.query(
          "SELECT worker_id, status FROM outbound_commands WHERE id = $1;",
          [item.id]
        );
        expect(checkRes.rows[0].worker_id).toBe("worker-beta");
        expect(checkRes.rows[0].status).toBe("processing");
      }
    });

    it("should partition inbox webhook items between two concurrent workers with zero overlap", async () => {
      const processor = new InboxProcessor({ masterKeyHex: testMasterKey });
      const totalItems = 10;
      const createdInboxIds: string[] = [];

      // Create 10 pending inbox items
      for (let i = 0; i < totalItems; i++) {
        const rawJson = JSON.stringify({ entry: [{ id: `event_${i}` }] });
        const rawHash = crypto.createHash("sha256").update(rawJson).digest("hex");
        const aad = `${workspaceId}:${channelInstanceId}:${rawHash}`;
        const enc = encryptPayload(rawJson, testMasterKey, { aad });

        const inboxRes = await ownerPool.query(`
          INSERT INTO channel_webhook_inbox (
            channel_instance_id, workspace_id, provider_event_key, raw_payload_hash,
            encrypted_payload, payload_iv, payload_auth_tag, key_version, status
          ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, 1, 'pending'
          ) RETURNING id;
        `, [
          channelInstanceId,
          workspaceId,
          `evt-conc-${Date.now()}-${i}`,
          rawHash,
          enc.encryptedBase64,
          enc.ivBase64,
          enc.authTagBase64,
        ]);
        createdInboxIds.push(inboxRes.rows[0].id);
      }

      // Concurrently claim 5 items with worker-alpha and 5 with worker-beta
      const [batchAlpha, batchBeta] = await Promise.all([
        processor.claimBatch(workerPool, "inbox-worker-alpha", 5),
        processor.claimBatch(workerPool, "inbox-worker-beta", 5),
      ]);

      expect(batchAlpha.length).toBe(5);
      expect(batchBeta.length).toBe(5);

      const alphaIds = new Set(batchAlpha.map((c) => c.id));
      const betaIds = new Set(batchBeta.map((c) => c.id));

      const overlap = [...alphaIds].filter((id) => betaIds.has(id));
      expect(overlap.length).toBe(0);
    });
  });

  describe("2. Pre-Send Fencing Validation (Zero Duplicate Send on Lease Loss)", () => {
    it("should abort immediately before external send if lease was stolen by another worker", async () => {
      const dispatcher = new OutboxDispatcher();
      const registry = new ChannelAdapterRegistry();
      let adapterCallCount = 0;

      const testAdapter: IChannelAdapter = {
        provider: "meta_waba",
        async sendMessage(): Promise<ChannelSendResult> {
          adapterCallCount++;
          return { success: true, externalMessageId: "wamid.DUPLICATE_VIOLATION", sentAt: new Date() };
        },
      };
      registry.register(testAdapter);

      const secretResolver = new DatabaseSigningSecretResolver({
        pool: workerPool,
        masterKeyHex: testMasterKey,
      });

      // 1. Insert message and pending command
      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999993333', '+5511999994444', 'text', 'Fencing pre-send test', 'queued', 0
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadId]);
      const messageId = msgRes.rows[0].id;

      const outboxRes = await ownerPool.query(`
        INSERT INTO outbound_commands (
          workspace_id, channel_instance_id, thread_id, message_id,
          recipient_e164, body, idempotency_key, status
        ) VALUES (
          $1, $2, $3, $4,
          '+5511999994444', 'Fencing pre-send test', $5, 'pending'
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadId, messageId, `fencing-presend-${Date.now()}`]);
      const commandId = outboxRes.rows[0].id;

      // 2. Worker Alpha claims the command
      const claimedBatch = await dispatcher.claimBatch(workerPool, "worker-alpha", 100);
      const claimedItem = claimedBatch.find((c) => c.id === commandId);
      expect(claimedItem).toBeDefined();

      // 3. Simulate Worker Beta stealing the lease in the database (e.g. Worker Alpha had GC pause)
      const newLeaseToken = crypto.randomUUID();
      await ownerPool.query(`
        UPDATE outbound_commands
        SET worker_id = 'worker-beta', lease_token = $1, lease_until = clock_timestamp() + INTERVAL '30 seconds'
        WHERE id = $2;
      `, [newLeaseToken, commandId]);

      // 4. Worker Alpha attempts dispatchItem
      await expect(
        dispatcher.dispatchItem(workerPool, claimedItem!, "worker-alpha", registry, secretResolver)
      ).rejects.toThrow(/FENCING/);

      // P0 INVARIANT: The adapter MUST NOT be invoked! Zero external HTTP requests made!
      expect(adapterCallCount).toBe(0);

      // Verify that Worker Alpha did NOT corrupt the state of Worker Beta
      const checkRes = await ownerPool.query(
        "SELECT worker_id, lease_token::text, status FROM outbound_commands WHERE id = $1;",
        [commandId]
      );
      expect(checkRes.rows[0].worker_id).toBe("worker-beta");
      expect(checkRes.rows[0].lease_token).toBe(newLeaseToken);
      expect(checkRes.rows[0].status).toBe("processing");
    });
  });

  describe("3. In-Flight Lease Loss Heartbeat & AbortController", () => {
    it("should abort in-flight adapter dispatch when heartbeat detects lease loss", async () => {
      const dispatcher = new OutboxDispatcher();
      const registry = new ChannelAdapterRegistry();

      let adapterStarted = false;
      let adapterAbortedCleanly = false;

      const slowAdapter: IChannelAdapter = {
        provider: "meta_waba",
        async sendMessage(params: OutboundSendParams): Promise<ChannelSendResult> {
          adapterStarted = true;
          // Simulate in-flight HTTP request waiting for abort signal
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              resolve();
            }, 3000);

            if (params.signal) {
              params.signal.addEventListener("abort", () => {
                clearTimeout(timeout);
                adapterAbortedCleanly = true;
                reject(new Error("FENCING_IN_FLIGHT_ABORT: Aborted by lease signal"));
              }, { once: true });
            }
          });

          return { success: true, externalMessageId: "wamid.SHOULD_NOT_HAPPEN", sentAt: new Date() };
        },
      };
      registry.register(slowAdapter);

      const secretResolver = new DatabaseSigningSecretResolver({
        pool: workerPool,
        masterKeyHex: testMasterKey,
      });

      // 1. Insert message and pending command
      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999993333', '+5511999994444', 'text', 'Heartbeat abort test', 'queued', 0
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadId]);
      const messageId = msgRes.rows[0].id;

      const outboxRes = await ownerPool.query(`
        INSERT INTO outbound_commands (
          workspace_id, channel_instance_id, thread_id, message_id,
          recipient_e164, body, idempotency_key, status
        ) VALUES (
          $1, $2, $3, $4,
          '+5511999994444', 'Heartbeat abort test', $5, 'pending'
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadId, messageId, `heartbeat-abort-${Date.now()}`]);
      const commandId = outboxRes.rows[0].id;

      // 2. Worker Alpha claims the command
      const claimedBatch = await dispatcher.claimBatch(workerPool, "worker-slow", 100);
      const claimedItem = claimedBatch.find((c) => c.id === commandId);
      expect(claimedItem).toBeDefined();

      // Create an explicit abort controller to test in-flight lease loss
      const externalAbortController = new AbortController();

      // Start dispatch in background
      const dispatchPromise = dispatcher.dispatchItem(
        workerPool,
        claimedItem!,
        "worker-slow",
        registry,
        secretResolver,
        externalAbortController.signal
      );

      // Wait until adapter is confirmed running in-flight
      while (!adapterStarted) {
        await new Promise((r) => setTimeout(r, 10));
      }

      // Simulate lease loss by aborting signal
      externalAbortController.abort(new Error("LEASE_EXPIRED_OR_STOLEN"));

      await expect(dispatchPromise).rejects.toThrow(/FENCING/);
      expect(adapterAbortedCleanly).toBe(true);

      // Verify that messages table did NOT update to sent
      const msgCheck = await ownerPool.query("SELECT delivery_status FROM messages WHERE id = $1;", [messageId]);
      expect(msgCheck.rows[0].delivery_status).toBe("queued");
    });
  });

  describe("4. Distributed Idempotency Guarantees", () => {
    it("should enforce unique constraint on workspace and idempotency_key in outbound_commands", async () => {
      const idempotencyKey = `idemp-dup-${Date.now()}`;

      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999993333', '+5511999994444', 'text', 'Dup test', 'queued', 0
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadId]);
      const msgId = msgRes.rows[0].id;

      // First insert succeeds
      await ownerPool.query(`
        INSERT INTO outbound_commands (
          workspace_id, channel_instance_id, thread_id, message_id,
          recipient_e164, body, idempotency_key, status
        ) VALUES (
          $1, $2, $3, $4,
          '+5511999994444', 'First command', $5, 'pending'
        );
      `, [workspaceId, channelInstanceId, threadId, msgId, idempotencyKey]);

      // Duplicate insert with same (workspace_id, idempotency_key) MUST FAIL
      await expect(
        ownerPool.query(`
          INSERT INTO outbound_commands (
            workspace_id, channel_instance_id, thread_id, message_id,
            recipient_e164, body, idempotency_key, status
          ) VALUES (
            $1, $2, $3, $4,
            '+5511999994444', 'Second command (duplicate)', $5, 'pending'
          );
        `, [workspaceId, channelInstanceId, threadId, msgId, idempotencyKey])
      ).rejects.toThrow(/uq_outbound_workspace_idempotency/);
    });

    it("should enforce unique constraint on channel_instance_id and provider_event_key in channel_webhook_inbox", async () => {
      const eventKey = `evt-dup-${Date.now()}`;
      const rawJson = JSON.stringify({ event: "dup" });
      const rawHash = crypto.createHash("sha256").update(rawJson).digest("hex");
      const aad = `${workspaceId}:${channelInstanceId}:${rawHash}`;
      const enc = encryptPayload(rawJson, testMasterKey, { aad });

      // First insert succeeds
      await ownerPool.query(`
        INSERT INTO channel_webhook_inbox (
          channel_instance_id, workspace_id, provider_event_key, raw_payload_hash,
          encrypted_payload, payload_iv, payload_auth_tag, key_version, status
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, 1, 'pending'
        );
      `, [channelInstanceId, workspaceId, eventKey, rawHash, enc.encryptedBase64, enc.ivBase64, enc.authTagBase64]);

      // Duplicate insert with same (channel_instance_id, provider_event_key) MUST FAIL
      await expect(
        ownerPool.query(`
          INSERT INTO channel_webhook_inbox (
            channel_instance_id, workspace_id, provider_event_key, raw_payload_hash,
            encrypted_payload, payload_iv, payload_auth_tag, key_version, status
          ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, 1, 'pending'
          );
        `, [channelInstanceId, workspaceId, eventKey, rawHash, enc.encryptedBase64, enc.ivBase64, enc.authTagBase64])
      ).rejects.toThrow(/uq_inbox_channel_event/);
    });
  });
});
