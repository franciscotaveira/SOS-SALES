import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  createTestDatabasePools,
  encryptPayload,
  DatabaseSigningSecretResolver,
  FencingViolationError,
  resetTestQueueState,
} from "@sos-sales/database";
import {
  ChannelAdapterRegistry,
  type IChannelAdapter,
  type OutboundSendParams,
  type ChannelSendResult,
} from "@sos-sales/application";
import {
  OutboxDispatcher,
  FatalCryptographicConfigError,
} from "../processors/outbox-dispatcher";

function runEvidenceVerifier(manifestRelativePath?: string): { success: boolean; stdout: string; stderr: string } {
  const repoRoot = path.resolve(__dirname, "../../../..");
  const scriptPath = path.resolve(repoRoot, "scripts/verify-evidence-digests.ts");
  const args = [scriptPath];
  if (manifestRelativePath) {
    args.push(manifestRelativePath);
  }
  try {
    const stdout = execFileSync("pnpm", ["tsx", ...args], {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });
    return { success: true, stdout, stderr: "" };
  } catch (err: any) {
    return {
      success: false,
      stdout: err.stdout ? String(err.stdout) : "",
      stderr: err.stderr ? String(err.stderr) : String(err),
    };
  }
}

describe("P0: Outbox Zero Blind Resend, Cryptographic Rigor & Fail-Closed Guardrails", () => {
  const { ownerPool, workerPool } = createTestDatabasePools();
  const testMasterKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  let orgId: string;
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
      VALUES ('Zero Blind Resend Org', $1)
      RETURNING id;
    `, [`org-zbr-${crypto.randomUUID()}`]);
    orgId = orgRes.rows[0].id;

    const wsRes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'Zero Blind Resend Workspace', $2)
      RETURNING id;
    `, [orgId, `ws-zbr-${crypto.randomUUID()}`]);
    workspaceId = wsRes.rows[0].id;

    // 2. Provision Encrypted Credential
    const rawCredentials = JSON.stringify({
      access_token: "EAAB_test_zbr_token",
      phone_number_id: "10987654321",
      app_secret: "waba_secret_zbr",
    });
    const encrypted = encryptPayload(rawCredentials, testMasterKey);

    const credRes = await ownerPool.query(`
      INSERT INTO provider_credentials (
        workspace_id, provider, account_id, encrypted_payload, iv, auth_tag
      ) VALUES ($1, 'meta_waba', 'waba_acc_zbr', $2, $3, $4)
      RETURNING id;
    `, [workspaceId, encrypted.encryptedBase64, encrypted.ivBase64, encrypted.authTagBase64]);
    credentialId = credRes.rows[0].id;

    // 3. Provision Channel Instance
    const chanRes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164,
        endpoint_token_hash, credential_id, is_active
      ) VALUES (
        $1, 'meta_waba', 'ZBR Test Line', '+5511999993333',
        $2, $3, true
      ) RETURNING id;
    `, [workspaceId, crypto.createHash("sha256").update(`token-zbr-${crypto.randomUUID()}`).digest("hex"), credentialId]);
    channelInstanceId = chanRes.rows[0].id;

    // 4. Provision Base Contact and Commercial Thread
    const contactRes = await ownerPool.query(`
      INSERT INTO contacts (workspace_id, phone_e164, name)
      VALUES ($1, '+5511999993333', 'ZBR Base Contact')
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

  describe("P0-1: Cryptographic Configuration Fail-Closed", () => {
    it("should throw FatalCryptographicConfigError when master key is absent or invalid", () => {
      const origEnv = { ...process.env };
      try {
        delete process.env.MCT_CREDENTIALS_MASTER_KEY;
        delete process.env.APP_MASTER_KEY;
        delete process.env.MASTER_ENCRYPTION_KEY;

        const dispatcherNoKey = new OutboxDispatcher({ masterKeyHex: "" });
        expect(() => dispatcherNoKey.resolveMasterKey()).toThrow(FatalCryptographicConfigError);

        const dispatcherInvalidHex = new OutboxDispatcher({ masterKeyHex: "not-a-valid-hex" });
        expect(() => dispatcherInvalidHex.resolveMasterKey()).toThrow(FatalCryptographicConfigError);

        const dispatcherFallbackBanned = new OutboxDispatcher();
        expect(() => dispatcherFallbackBanned.resolveMasterKey()).toThrow(FatalCryptographicConfigError);
      } finally {
        process.env = origEnv;
      }
    });
  });

  describe("P0-2: Atomic Post-Send Persistence and Delivery Event Failure", () => {
    it("should route to reconciliation_required and preserve externalMessageId if delivery event persistence fails after provider send", async () => {
      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999993333', '+5511988881111', 'text', 'Atomic post-send test', 'queued', 0
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, baseThreadId]);
      const messageId = msgRes.rows[0].id;

      const outboxRes = await ownerPool.query(`
        INSERT INTO outbound_commands (
          workspace_id, channel_instance_id, thread_id, message_id, recipient_e164,
          body, idempotency_key, status, retry_count, max_retries, lease_until
        ) VALUES (
          $1, $2, $3, $4, '+5511988881111',
          'Atomic post-send test', $5, 'pending', 0, 3, NULL
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, baseThreadId, messageId, `atomic-post-send-${Date.now()}`]);
      const commandId = outboxRes.rows[0].id;

      let adapterCallCount = 0;
      const expectedExternalId = `wamid.atomic-success-${Date.now()}`;
      const fakeAdapter: IChannelAdapter = {
        provider: "meta_waba",
        sendMessage: async (): Promise<ChannelSendResult> => {
          adapterCallCount++;
          // Deactivate channel instance during provider send so post-send Step 1 fails
          await ownerPool.query(
            "UPDATE channel_instances SET is_active = false WHERE id = $1;",
            [channelInstanceId]
          );
          return {
            success: true,
            externalMessageId: expectedExternalId,
            sentAt: new Date(),
          };
        },
      };

      const registry = new ChannelAdapterRegistry();
      registry.register(fakeAdapter);

      const secretResolver = new DatabaseSigningSecretResolver({
        pool: workerPool,
        masterKeyHex: testMasterKey,
      });

      const dispatcher = new OutboxDispatcher({ masterKeyHex: testMasterKey });
      const claimed = await dispatcher.claimBatch(workerPool, "test-atomic-worker", 10);
      const targetItem = claimed.find((c) => c.id === commandId);
      expect(targetItem).toBeDefined();

      try {
        const result = await dispatcher.dispatchItem(
          workerPool,
          targetItem!,
          "test-atomic-worker",
          registry,
          secretResolver
        );

        // Result status must be reconciliation_required preserving externalMessageId
        expect(result.status).toBe("reconciliation_required");
        expect(result.externalMessageId).toBe(expectedExternalId);
        expect(adapterCallCount).toBe(1);

        // Verify database state: rolled back from 'sent', moved to 'reconciliation_required', zero retry increment
        const checkCmd = await ownerPool.query(
          "SELECT status, external_message_id, error_message, retry_count, lease_until FROM outbound_commands WHERE id = $1;",
          [commandId]
        );
        expect(checkCmd.rows[0].status).toBe("reconciliation_required");
        expect(checkCmd.rows[0].external_message_id).toBe(expectedExternalId);
        expect(checkCmd.rows[0].error_message).toContain("ERR_POST_SEND_PERSISTENCE_FAILED");
        expect(checkCmd.rows[0].retry_count).toBe(1); // incremented once on claim, not incremented by post-send failure
        expect(checkCmd.rows[0].lease_until).toBeNull();
      } finally {
        // Re-activate channel instance for subsequent tests
        await ownerPool.query(
          "UPDATE channel_instances SET is_active = true WHERE id = $1;",
          [channelInstanceId]
        );
      }
    });
  });

  describe("P0-3: Heartbeat Fail-Closed and Lease Lost Routing", () => {
    it("should abort dispatch when lease renewal heartbeat fails or is lost", async () => {
      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999993333', '+5511988882222', 'text', 'Heartbeat fail test', 'queued', 0
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, baseThreadId]);
      const messageId = msgRes.rows[0].id;

      const outboxRes = await ownerPool.query(`
        INSERT INTO outbound_commands (
          workspace_id, channel_instance_id, thread_id, message_id, recipient_e164,
          body, idempotency_key, status, retry_count, max_retries, lease_until
        ) VALUES (
          $1, $2, $3, $4, '+5511988882222',
          'Heartbeat fail test', $5, 'pending', 0, 3, NULL
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, baseThreadId, messageId, `heartbeat-fail-${Date.now()}`]);
      const commandId = outboxRes.rows[0].id;

      const fakeAdapter: IChannelAdapter = {
        provider: "meta_waba",
        sendMessage: async (_params: OutboundSendParams): Promise<ChannelSendResult> => {
          // Simulate lease stolen in DB while adapter is in-flight
          await ownerPool.query(
            "UPDATE outbound_commands SET worker_id = 'rogue-thief', lease_token = gen_random_uuid() WHERE id = $1;",
            [commandId]
          );
          return {
            success: true,
            externalMessageId: `wamid.stolen-${Date.now()}`,
            sentAt: new Date(),
          };
        },
      };

      const registry = new ChannelAdapterRegistry();
      registry.register(fakeAdapter);

      const secretResolver = new DatabaseSigningSecretResolver({
        pool: workerPool,
        masterKeyHex: testMasterKey,
      });

      const dispatcher = new OutboxDispatcher({ masterKeyHex: testMasterKey });
      const claimed = await dispatcher.claimBatch(workerPool, "test-heartbeat-worker", 10);
      const targetItem = claimed.find((c) => c.id === commandId);
      expect(targetItem).toBeDefined();

      // Post-send fencing detected stolen lease: ownership_lost causes FencingViolationError (fails closed, zero blind resend)
      await expect(
        dispatcher.dispatchItem(
          workerPool,
          targetItem!,
          "test-heartbeat-worker",
          registry,
          secretResolver
        )
      ).rejects.toThrow(FencingViolationError);

      const checkCmd = await ownerPool.query(
        "SELECT status, worker_id, external_message_id FROM outbound_commands WHERE id = $1;",
        [commandId]
      );
      expect(checkCmd.rows[0].status).toBe("processing");
      expect(checkCmd.rows[0].worker_id).toBe("rogue-thief");
    });

    it("should route to reconciliation_required and preserve externalMessageId when lease expires during send without theft", async () => {
      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999993333', '+5511999994444', 'text', 'Test expire no theft body', 'queued', 0
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, baseThreadId]);
      const messageId = msgRes.rows[0].id;

      const outboxRes = await ownerPool.query(`
        INSERT INTO outbound_commands (
          workspace_id, channel_instance_id, thread_id, message_id, recipient_e164,
          body, idempotency_key, status, retry_count, max_retries
        ) VALUES (
          $1, $2, $3, $4, '+5511999994444',
          'Test expire no theft body', $5, 'pending', 0, 3
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, baseThreadId, messageId, `expire-notheft-${Date.now()}`]);
      const commandId = outboxRes.rows[0].id;

      const expectedExtId = `wamid.notheft-${Date.now()}`;
      const controller = new AbortController();
      const fakeAdapter: IChannelAdapter = {
        provider: "meta_waba",
        sendMessage: async (_params: OutboundSendParams): Promise<ChannelSendResult> => {
          controller.abort(new Error("Heartbeat timeout during send"));
          return {
            success: true,
            externalMessageId: expectedExtId,
            sentAt: new Date(),
          };
        },
      };

      const registry = new ChannelAdapterRegistry();
      registry.register(fakeAdapter);

      const secretResolver = new DatabaseSigningSecretResolver({
        pool: workerPool,
        masterKeyHex: testMasterKey,
      });

      const dispatcher = new OutboxDispatcher({ masterKeyHex: testMasterKey });
      const claimed = await dispatcher.claimBatch(workerPool, "test-expire-worker", 10);
      const targetItem = claimed.find((c) => c.id === commandId);
      expect(targetItem).toBeDefined();

      const result = await dispatcher.dispatchItem(
        workerPool,
        targetItem!,
        "test-expire-worker",
        registry,
        secretResolver,
        controller.signal
      );

      // Post-send fencing detected expired lease: routed to reconciliation_required, NEVER retry!
      expect(result.status).toBe("reconciliation_required");
      expect(result.externalMessageId).toBe(expectedExtId);

      const checkCmd = await ownerPool.query(
        "SELECT status, error_message, external_message_id FROM outbound_commands WHERE id = $1;",
        [commandId]
      );
      expect(checkCmd.rows[0].status).toBe("reconciliation_required");
      expect(checkCmd.rows[0].error_message).toContain("ERR_LEASE_LOST_AFTER_SEND");
      expect(checkCmd.rows[0].external_message_id).toBe(expectedExtId);
    });
  });

  describe("P0-4 & P0-5: Zero Blind Resend in Reconciliation and Lease Reclamation", () => {
    it("should never auto-resend ambiguous command when TTL expired without delivery evidence", async () => {
      const phone = "+5511988883333";
      const contactRes = await ownerPool.query(`
        INSERT INTO contacts (workspace_id, phone_e164, name)
        VALUES ($1, $2, 'No Evidence Contact')
        ON CONFLICT (workspace_id, phone_e164) DO UPDATE SET name = EXCLUDED.name
        RETURNING id;
      `, [workspaceId, phone]);
      const threadRes = await ownerPool.query(`
        INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status)
        VALUES ($1, $2, $3, 'active')
        ON CONFLICT (workspace_id, channel_instance_id, contact_id) DO UPDATE SET status = EXCLUDED.status
        RETURNING id;
      `, [workspaceId, channelInstanceId, contactRes.rows[0].id]);

      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999993333', $4, 'text', 'No evidence test', 'queued', 0
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadRes.rows[0].id, phone]);
      const messageId = msgRes.rows[0].id;

      const extMsgId = `wamid.ambiguous-${Date.now()}`;
      const outboxRes = await ownerPool.query(`
        INSERT INTO outbound_commands (
          workspace_id, channel_instance_id, thread_id, message_id, recipient_e164,
          body, idempotency_key, status, retry_count, max_retries, lease_until, external_message_id, created_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          'No evidence test', $6, 'reconciliation_required', 0, 3, NULL, $7, clock_timestamp() - INTERVAL '120 seconds'
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadRes.rows[0].id, messageId, phone, `no-evid-${Date.now()}`, extMsgId]);
      const commandId = outboxRes.rows[0].id;

      const dispatcher = new OutboxDispatcher({ masterKeyHex: testMasterKey });

      // Run reconcileBatch with TTL 60 seconds
      const reconciled = await dispatcher.reconcileBatch(workerPool, "recon-poller", 10, 60);
      expect(reconciled).toBe(0);

      // Inconclusive item MUST NOT be reconciled or reset to pending!
      const checkCmd = await ownerPool.query(
        "SELECT status, retry_count, external_message_id, lease_until FROM outbound_commands WHERE id = $1;",
        [commandId]
      );
      expect(checkCmd.rows[0].status).toBe("reconciliation_required");
      expect(checkCmd.rows[0].retry_count).toBe(0);
      expect(checkCmd.rows[0].external_message_id).toBe(extMsgId);
      expect(checkCmd.rows[0].lease_until).toBeNull();
    });

    it("should confirm delivery as sent when positive delivery event exists in provider_delivery_events", async () => {
      const phone = "+5511988884444";
      const contactRes = await ownerPool.query(`
        INSERT INTO contacts (workspace_id, phone_e164, name)
        VALUES ($1, $2, 'Positive Event Contact')
        ON CONFLICT (workspace_id, phone_e164) DO UPDATE SET name = EXCLUDED.name
        RETURNING id;
      `, [workspaceId, phone]);
      const threadRes = await ownerPool.query(`
        INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status)
        VALUES ($1, $2, $3, 'active')
        ON CONFLICT (workspace_id, channel_instance_id, contact_id) DO UPDATE SET status = EXCLUDED.status
        RETURNING id;
      `, [workspaceId, channelInstanceId, contactRes.rows[0].id]);

      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999993333', $4, 'text', 'Positive event test', 'queued', 0
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadRes.rows[0].id, phone]);
      const messageId = msgRes.rows[0].id;

      const confirmedExtId = `wamid.confirmed-${Date.now()}`;
      const outboxRes = await ownerPool.query(`
        INSERT INTO outbound_commands (
          workspace_id, channel_instance_id, thread_id, message_id, recipient_e164,
          body, idempotency_key, status, retry_count, max_retries, lease_until, external_message_id, created_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          'Positive event test', $6, 'reconciliation_required', 1, 3, NULL, $7, clock_timestamp() - INTERVAL '120 seconds'
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadRes.rows[0].id, messageId, phone, `pos-evid-${Date.now()}`, confirmedExtId]);
      const commandId = outboxRes.rows[0].id;

      // Insert positive delivered event in provider_delivery_events
      await ownerPool.query(`
        INSERT INTO provider_delivery_events (
          workspace_id, channel_instance_id, message_id, external_message_id,
          external_event_id, recipient_e164, provider, status,
          raw_payload_hash, encrypted_payload, payload_iv, payload_auth_tag, occurred_at
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, 'meta_waba', 'delivered',
          '${"b".repeat(64)}', 'dummy-enc', 'dummy-iv', 'dummy-tag', clock_timestamp()
        );
      `, [workspaceId, channelInstanceId, messageId, confirmedExtId, `evt-pos-${Date.now()}`, phone]);

      const dispatcher = new OutboxDispatcher({ masterKeyHex: testMasterKey });
      const reconciled = await dispatcher.reconcileBatch(workerPool, "recon-poller", 100, 60);
      expect(reconciled).toBeGreaterThanOrEqual(1);

      const checkCmd = await ownerPool.query(
        "SELECT status, external_message_id, lease_until FROM outbound_commands WHERE id = $1;",
        [commandId]
      );
      expect(checkCmd.rows[0].status).toBe("sent");
      expect(checkCmd.rows[0].external_message_id).toBe(confirmedExtId);
      expect(checkCmd.rows[0].lease_until).toBeNull();

      const checkMsg = await ownerPool.query(
        "SELECT delivery_status, provider_message_id FROM messages WHERE id = $1;",
        [messageId]
      );
      expect(checkMsg.rows[0].delivery_status).toBe("delivered");
      expect(checkMsg.rows[0].provider_message_id).toBe(confirmedExtId);
    });

    it("should never allow claimBatch to claim expired processing item and reclaim it via reclaimExpiredLeases", async () => {
      const phone = "+5511988885555";
      const contactRes = await ownerPool.query(`
        INSERT INTO contacts (workspace_id, phone_e164, name)
        VALUES ($1, $2, 'Expired Processing Contact')
        ON CONFLICT (workspace_id, phone_e164) DO UPDATE SET name = EXCLUDED.name
        RETURNING id;
      `, [workspaceId, phone]);
      const threadRes = await ownerPool.query(`
        INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status)
        VALUES ($1, $2, $3, 'active')
        ON CONFLICT (workspace_id, channel_instance_id, contact_id) DO UPDATE SET status = EXCLUDED.status
        RETURNING id;
      `, [workspaceId, channelInstanceId, contactRes.rows[0].id]);

      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999993333', $4, 'text', 'Expired processing test', 'queued', 0
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadRes.rows[0].id, phone]);
      const messageId = msgRes.rows[0].id;

      const outboxRes = await ownerPool.query(`
        INSERT INTO outbound_commands (
          workspace_id, channel_instance_id, thread_id, message_id, recipient_e164,
          body, idempotency_key, status, retry_count, max_retries, lease_until, worker_id, lease_token
        ) VALUES (
          $1, $2, $3, $4, $5,
          'Expired processing test', $6, 'processing', 2, 3, clock_timestamp() - INTERVAL '10 seconds', 'dead-worker', gen_random_uuid()
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadRes.rows[0].id, messageId, phone, `exp-proc-${Date.now()}`]);
      const commandId = outboxRes.rows[0].id;

      let adapterCalled = false;
      const fakeAdapter: IChannelAdapter = {
        provider: "meta_waba",
        sendMessage: async (): Promise<ChannelSendResult> => {
          adapterCalled = true;
          return { success: true, externalMessageId: "unwanted", sentAt: new Date() };
        },
      };

      const registry = new ChannelAdapterRegistry();
      registry.register(fakeAdapter);

      const dispatcher = new OutboxDispatcher({ masterKeyHex: testMasterKey });

      // 1. claimBatch MUST NOT claim this command
      const claimed = await dispatcher.claimBatch(workerPool, "normal-worker", 100);
      const found = claimed.find((c) => c.id === commandId);
      expect(found).toBeUndefined();

      // 2. reclaimExpiredLeases recovers it directly to reconciliation_required without incrementing retry_count
      const reclaimed = await dispatcher.reclaimExpiredLeases(workerPool, 100);
      expect(reclaimed).toBeGreaterThanOrEqual(1);

      // Adapter MUST NOT have been called
      expect(adapterCalled).toBe(false);

      const checkCmd = await ownerPool.query(
        "SELECT status, error_message, retry_count, lease_until, worker_id, lease_token FROM outbound_commands WHERE id = $1;",
        [commandId]
      );
      expect(checkCmd.rows[0].status).toBe("reconciliation_required");
      expect(checkCmd.rows[0].error_message).toContain("ERR_LEASE_EXPIRED_DURING_PROCESSING");
      expect(checkCmd.rows[0].retry_count).toBe(2); // Unchanged from initial 2
      expect(checkCmd.rows[0].lease_until).toBeNull();
      expect(checkCmd.rows[0].worker_id).toBeNull();
      expect(checkCmd.rows[0].lease_token).toBeNull();
    });
  });

  describe("P0-4 (Admin): Human Governance & Immutable Audit Ledger", () => {
    it("should strictly reject empty or artificial externalMessageId for 'sent' resolution", async () => {
      const phone = "+5511988886666";
      const contactRes = await ownerPool.query(`
        INSERT INTO contacts (workspace_id, phone_e164, name)
        VALUES ($1, $2, 'Admin Recon Contact')
        ON CONFLICT (workspace_id, phone_e164) DO UPDATE SET name = EXCLUDED.name
        RETURNING id;
      `, [workspaceId, phone]);
      const threadRes = await ownerPool.query(`
        INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status)
        VALUES ($1, $2, $3, 'active')
        ON CONFLICT (workspace_id, channel_instance_id, contact_id) DO UPDATE SET status = EXCLUDED.status
        RETURNING id;
      `, [workspaceId, channelInstanceId, contactRes.rows[0].id]);

      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999993333', $4, 'text', 'Admin recon test', 'queued', 0
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadRes.rows[0].id, phone]);
      const messageId = msgRes.rows[0].id;

      const outboxRes = await ownerPool.query(`
        INSERT INTO outbound_commands (
          workspace_id, channel_instance_id, thread_id, message_id, recipient_e164,
          body, idempotency_key, status, retry_count, max_retries, lease_until
        ) VALUES (
          $1, $2, $3, $4, $5,
          'Admin recon test', $6, 'reconciliation_required', 0, 3, NULL
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadRes.rows[0].id, messageId, phone, `admin-recon-${Date.now()}`]);
      const commandId = outboxRes.rows[0].id;

      const dispatcher = new OutboxDispatcher({ masterKeyHex: testMasterKey });

      // 1. Rejects missing / empty externalMessageId
      await expect(
        dispatcher.reconcileItem(ownerPool, workspaceId, commandId, "sent", { externalMessageId: "" })
      ).rejects.toThrow("externalMessageId is mandatory");

      // 2. Rejects artificial externalMessageId
      await expect(
        dispatcher.reconcileItem(ownerPool, workspaceId, commandId, "sent", {
          externalMessageId: "manual-recon-abc-12345",
        })
      ).rejects.toThrow("Artificial externalMessageId is strictly prohibited");

      // 3. Accepts verified real externalMessageId and writes to immutable audit_events
      const verifiedExternalId = `wamid.HBgLMTIzNDU2Nzg5MA==_${Date.now()}`;
      const reconciled = await dispatcher.reconcileItem(
        ownerPool,
        workspaceId,
        commandId,
        "sent",
        {
          externalMessageId: verifiedExternalId,
          adminNote: "Verified manually in Meta Business Manager dashboard",
          actorId: "00000000-0000-0000-0000-000000000001",
        }
      );
      expect(reconciled).toBe(true);

      // Verify command and message updated
      const cmdCheck = await ownerPool.query(
        "SELECT status, external_message_id, lease_until FROM outbound_commands WHERE id = $1;",
        [commandId]
      );
      expect(cmdCheck.rows[0].status).toBe("sent");
      expect(cmdCheck.rows[0].external_message_id).toBe(verifiedExternalId);
      expect(cmdCheck.rows[0].lease_until).toBeNull();

      const msgCheck = await ownerPool.query(
        "SELECT delivery_status, provider_message_id FROM messages WHERE id = $1;",
        [messageId]
      );
      expect(msgCheck.rows[0].delivery_status).toBe("sent");
      expect(msgCheck.rows[0].provider_message_id).toBe(verifiedExternalId);

      // Verify immutable audit event was created
      const auditRes = await ownerPool.query(
        "SELECT action, resource_type, resource_id, metadata FROM audit_events WHERE resource_id = $1;",
        [commandId]
      );
      expect(auditRes.rows.length).toBe(1);
      expect(auditRes.rows[0].action).toBe("outbox.reconcile.sent");
      expect(auditRes.rows[0].resource_type).toBe("outbound_commands");
      const meta = typeof auditRes.rows[0].metadata === "string"
        ? JSON.parse(auditRes.rows[0].metadata)
        : auditRes.rows[0].metadata;
      expect(meta.externalMessageId).toBe(verifiedExternalId);
      expect(meta.adminNote).toContain("Meta Business Manager");

      // Immutability: verifying UPDATE or DELETE on audit_events throws trigger error
      await expect(
        ownerPool.query("DELETE FROM audit_events WHERE resource_id = $1;", [commandId])
      ).rejects.toThrow("audit_events is an immutable append-only ledger");
    });
  });

  describe("P0-6: Historical Evidence Manifest Verification & Tamper Detection", () => {
    it("should successfully verify historical CH-09 manifest against recorded commit despite working tree changes", () => {
      const result = runEvidenceVerifier("docs/work-packages/CH-09-EVIDENCE.json");
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("docker-compose.yml");
      expect(result.stdout).toContain("SUCCESS: All 6 files (historical mode) and composite digest verified");
    });

    it("should fail closed when an evidence manifest is tampered", () => {
      const repoRoot = path.resolve(__dirname, "../../../..");
      const originalPath = path.resolve(repoRoot, "docs/work-packages/CH-09-EVIDENCE.json");
      const originalContent = JSON.parse(fs.readFileSync(originalPath, "utf-8"));

      const tamperedContent = {
        ...originalContent,
        provenance: {
          ...originalContent.provenance,
          scoped_code_sha256: {
            ...originalContent.provenance.scoped_code_sha256,
            "docker-compose.yml": "0000000000000000000000000000000000000000000000000000000000000000",
          },
        },
      };

      const tamperedRelativePath = "docs/work-packages/CH-09-TAMPERED-EVIDENCE.json";
      const tamperedFullPath = path.resolve(repoRoot, tamperedRelativePath);
      fs.writeFileSync(tamperedFullPath, JSON.stringify(tamperedContent, null, 2), "utf-8");

      try {
        const result = runEvidenceVerifier(tamperedRelativePath);
        expect(result.success).toBe(false);
        expect(result.stderr || result.stdout).toContain("mismatch for docker-compose.yml");
      } finally {
        if (fs.existsSync(tamperedFullPath)) {
          fs.unlinkSync(tamperedFullPath);
        }
      }
    });
  });
});
