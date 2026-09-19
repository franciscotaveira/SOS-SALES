import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import {
  createTestDatabasePools,
  withWorkerTransaction,
} from "../index";
import {
  OutboundCommandRepository,
  IdempotencyConflictError,
  FencingViolationError,
  OutboundCommandValidationError,
} from "../repositories/outbound-command.repository";

describe("OutboundCommandRepository (CH-10)", () => {
  const { ownerPool, workerPool } = createTestDatabasePools();
  const repo = new OutboundCommandRepository(workerPool);

  let workspaceId: string;
  let channelInstanceId: string;
  let contactId: string;
  let threadId: string;
  let messageId: string;

  beforeAll(async () => {
    // 1. Provision Workspace
    const orgRes = await ownerPool.query(`
      INSERT INTO organizations (name, slug)
      VALUES ('Repo Test Org', $1)
      RETURNING id;
    `, [`org-repo-${Date.now()}`]);
    const orgId = orgRes.rows[0].id;

    const wsRes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'Repo Test Workspace', $2)
      RETURNING id;
    `, [orgId, `ws-repo-${Date.now()}`]);
    workspaceId = wsRes.rows[0].id;

    // 2. Provision Channel Instance
    const tokenHash = crypto.createHash("sha256").update(`token-${Date.now()}`).digest("hex");
    const chanRes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164,
        endpoint_token_hash, is_active
      ) VALUES ($1, 'meta_waba', 'Repo Test Line', '+5511999990001', $2, true)
      RETURNING id;
    `, [workspaceId, tokenHash]);
    channelInstanceId = chanRes.rows[0].id;

    // 3. Provision Contact & Thread
    const contactRes = await ownerPool.query(`
      INSERT INTO contacts (workspace_id, phone_e164, name)
      VALUES ($1, '+5511999990002', 'Repo Contact')
      ON CONFLICT (workspace_id, phone_e164) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `, [workspaceId]);
    contactId = contactRes.rows[0].id;

    const threadRes = await ownerPool.query(`
      INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status)
      VALUES ($1, $2, $3, 'active')
      ON CONFLICT (workspace_id, channel_instance_id, contact_id) DO UPDATE SET status = 'active'
      RETURNING id;
    `, [workspaceId, channelInstanceId, contactId]);
    threadId = threadRes.rows[0].id;

    // 4. Provision Base Message
    const msgRes = await ownerPool.query(`
      INSERT INTO messages (
        workspace_id, channel_instance_id, thread_id, provider, direction,
        sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
      ) VALUES (
        $1, $2, $3, 'meta_waba', 'outbound',
        '+5511999990001', '+5511999990002', 'text', 'Hello outbound test', 'queued', 0
      ) RETURNING id;
    `, [workspaceId, channelInstanceId, threadId]);
    messageId = msgRes.rows[0].id;
  });

  afterAll(async () => {
    await ownerPool.query("DELETE FROM workspaces WHERE id = $1;", [workspaceId]);
    await ownerPool.end();
    await workerPool.end();
  });

  describe("1. enqueueOutboundCommand & Idempotency", () => {
    it("should successfully enqueue a pending outbound command", async () => {
      const idempotencyKey = `idemp-${Date.now()}-1`;
      const cmd = await repo.enqueueOutboundCommand(
        {
          workspaceId,
          channelInstanceId,
          messageId,
          threadId,
          recipientE164: "+5511999990002",
          body: "Hello outbound test",
          idempotencyKey,
        },
        ownerPool
      );

      expect(cmd.id).toBeDefined();
      expect(cmd.status).toBe("pending");
      expect(cmd.retry_count).toBe(0);
      expect(cmd.max_retries).toBe(3);
      expect(cmd.idempotency_key).toBe(idempotencyKey);
    });

    it("should return the existing record on duplicate enqueue with matching parameters (idempotent no-op)", async () => {
      const idempotencyKey = `idemp-${Date.now()}-2`;
      const cmd1 = await repo.enqueueOutboundCommand(
        {
          workspaceId,
          channelInstanceId,
          messageId,
          threadId,
          recipientE164: "+5511999990002",
          body: "Message 1",
          idempotencyKey,
        },
        ownerPool
      );

      const cmd2 = await repo.enqueueOutboundCommand(
        {
          workspaceId,
          channelInstanceId,
          messageId,
          threadId,
          recipientE164: "+5511999990002",
          body: "Message 1",
          idempotencyKey,
        },
        ownerPool
      );

      expect(cmd2.id).toBe(cmd1.id);
    });

    it("should throw IdempotencyConflictError if same idempotency_key is reused with different message_id", async () => {
      const idempotencyKey = `idemp-${Date.now()}-3`;
      await repo.enqueueOutboundCommand(
        {
          workspaceId,
          channelInstanceId,
          messageId,
          threadId,
          recipientE164: "+5511999990002",
          body: "Message 1",
          idempotencyKey,
        },
        ownerPool
      );

      const msg2Res = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999990001', '+5511999990002', 'text', 'Message 2', 'queued', 0
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, threadId]);
      const message2Id = msg2Res.rows[0].id;

      await expect(
        repo.enqueueOutboundCommand(
          {
            workspaceId,
            channelInstanceId,
            messageId: message2Id,
            threadId,
            recipientE164: "+5511999990002",
            body: "Message 2",
            idempotencyKey,
          },
          ownerPool
        )
      ).rejects.toThrow(IdempotencyConflictError);
    });

    it("should validate recipientE164 format strictly", async () => {
      await expect(
        repo.enqueueOutboundCommand(
          {
            workspaceId,
            channelInstanceId,
            messageId,
            recipientE164: "11999990002", // missing +
            body: "Test",
            idempotencyKey: `idemp-bad-phone-${Date.now()}`,
          },
          ownerPool
        )
      ).rejects.toThrow(OutboundCommandValidationError);
    });
  });

  describe("2. claimPendingBatch with SKIP LOCKED and Lease Fencing", () => {
    it("should claim eligible pending commands and assign worker_id and lease_token", async () => {
      const idempotencyKey = `claim-test-${Date.now()}`;
      const cmd = await repo.enqueueOutboundCommand(
        {
          workspaceId,
          channelInstanceId,
          messageId,
          threadId,
          recipientE164: "+5511999990002",
          body: "Claim test",
          idempotencyKey,
        },
        ownerPool
      );

      const claimedBatch = await repo.claimPendingBatch("worker-1", 10, 30, workerPool);
      const claimedItem = claimedBatch.find((c) => c.id === cmd.id);

      expect(claimedItem).toBeDefined();
      expect(claimedItem?.status).toBe("processing");
      expect(claimedItem?.worker_id).toBe("worker-1");
      expect(claimedItem?.lease_token).toBeDefined();
      expect(claimedItem?.previous_status).toBe("pending");
      expect(claimedItem?.retry_count).toBe(1);
    });

    it("should not allow a second concurrent worker to claim the already-claimed command (SKIP LOCKED)", async () => {
      const idempotencyKey = `skip-locked-test-${Date.now()}`;
      const cmd = await repo.enqueueOutboundCommand(
        {
          workspaceId,
          channelInstanceId,
          messageId,
          threadId,
          recipientE164: "+5511999990002",
          body: "Skip locked test",
          idempotencyKey,
        },
        ownerPool
      );

      // Worker 1 claims
      const worker1Batch = await repo.claimPendingBatch("worker-1", 10, 30, workerPool);
      const claimed1 = worker1Batch.find((c) => c.id === cmd.id);
      expect(claimed1).toBeDefined();

      // Worker 2 claims concurrently
      const worker2Batch = await repo.claimPendingBatch("worker-2", 10, 30, workerPool);
      const claimed2 = worker2Batch.find((c) => c.id === cmd.id);
      expect(claimed2).toBeUndefined();
    });

    it("should claim expired lease item from processing status and report previous_status = 'processing'", async () => {
      const idempotencyKey = `expired-lease-claim-${Date.now()}`;
      const cmd = await repo.enqueueOutboundCommand(
        {
          workspaceId,
          channelInstanceId,
          messageId,
          threadId,
          recipientE164: "+5511999990002",
          body: "Expired lease test",
          idempotencyKey,
        },
        ownerPool
      );

      // Manually set command into processing with an expired lease
      await ownerPool.query(`
        UPDATE outbound_commands
        SET status = 'processing',
            worker_id = 'crashed-worker',
            lease_token = gen_random_uuid(),
            lease_until = clock_timestamp() - INTERVAL '5 seconds'
        WHERE id = $1;
      `, [cmd.id]);

      const claimedBatch = await repo.claimPendingBatch("worker-recovery", 10, 30, workerPool);
      const recoveredItem = claimedBatch.find((c) => c.id === cmd.id);

      expect(recoveredItem).toBeDefined();
      expect(recoveredItem?.status).toBe("processing");
      expect(recoveredItem?.worker_id).toBe("worker-recovery");
      expect(recoveredItem?.previous_status).toBe("processing");
    });
  });

  describe("3. Lease Heartbeat & Fenced Lifecycle Transitions", () => {
    it("should extend lease via markProcessing when leaseToken matches", async () => {
      const idempotencyKey = `heartbeat-${Date.now()}`;
      const cmd = await repo.enqueueOutboundCommand(
        {
          workspaceId,
          channelInstanceId,
          messageId,
          threadId,
          recipientE164: "+5511999990002",
          body: "Heartbeat test",
          idempotencyKey,
        },
        ownerPool
      );

      const claimed = (await repo.claimPendingBatch("worker-hb", 10, 30, workerPool)).find((c) => c.id === cmd.id)!;
      expect(claimed).toBeDefined();

      const extended = await repo.markProcessing(claimed.id, "worker-hb", claimed.lease_token!, 60, workerPool);
      expect(extended).toBe(true);

      // Mismatched token must return false
      const wrongTokenExtended = await repo.markProcessing(
        claimed.id,
        "worker-hb",
        crypto.randomUUID(),
        60,
        workerPool
      );
      expect(wrongTokenExtended).toBe(false);
    });

    it("should successfully markSent under tenant scope and fail when fenced", async () => {
      const idempotencyKey = `sent-${Date.now()}`;
      const cmd = await repo.enqueueOutboundCommand(
        {
          workspaceId,
          channelInstanceId,
          messageId,
          threadId,
          recipientE164: "+5511999990002",
          body: "Sent test",
          idempotencyKey,
        },
        ownerPool
      );

      const claimed = (await repo.claimPendingBatch("worker-sent", 10, 30, workerPool)).find((c) => c.id === cmd.id)!;

      // Fenced attempt with invalid token must throw FencingViolationError
      await withWorkerTransaction(workspaceId, async (client) => {
        await expect(
          repo.markSent(claimed.id, "worker-sent", crypto.randomUUID(), "wamid.12345", new Date(), client)
        ).rejects.toThrow(FencingViolationError);
      }, workerPool);

      // Valid markSent under tenant scope
      await withWorkerTransaction(workspaceId, async (client) => {
        await repo.markSent(claimed.id, "worker-sent", claimed.lease_token!, "wamid.VALID_123", new Date(), client);
      }, workerPool);

      const verify = await ownerPool.query("SELECT status, external_message_id, lease_until FROM outbound_commands WHERE id = $1;", [claimed.id]);
      expect(verify.rows[0].status).toBe("sent");
      expect(verify.rows[0].external_message_id).toBe("wamid.VALID_123");
      expect(verify.rows[0].lease_until).toBeNull();
    });

    it("should markRetryableFailure with backoff and clear lease", async () => {
      const idempotencyKey = `retryable-${Date.now()}`;
      const cmd = await repo.enqueueOutboundCommand(
        {
          workspaceId,
          channelInstanceId,
          messageId,
          threadId,
          recipientE164: "+5511999990002",
          body: "Retry test",
          idempotencyKey,
        },
        ownerPool
      );

      const claimed = (await repo.claimPendingBatch("worker-retry", 10, 30, workerPool)).find((c) => c.id === cmd.id)!;
      const nextAttempt = new Date(Date.now() + 10_000);

      await repo.markRetryableFailure(
        claimed.id,
        "worker-retry",
        claimed.lease_token!,
        "Network transient timeout",
        nextAttempt,
        workerPool
      );

      const verify = await ownerPool.query("SELECT status, error_message, lease_until, next_attempt_at FROM outbound_commands WHERE id = $1;", [claimed.id]);
      expect(verify.rows[0].status).toBe("failed");
      expect(verify.rows[0].error_message).toBe("Network transient timeout");
      expect(verify.rows[0].lease_until).toBeNull();
    });

    it("should markPermanentFailure to dead_letter and clear lease", async () => {
      const idempotencyKey = `perm-fail-${Date.now()}`;
      const cmd = await repo.enqueueOutboundCommand(
        {
          workspaceId,
          channelInstanceId,
          messageId,
          threadId,
          recipientE164: "+5511999990002",
          body: "Permanent fail test",
          idempotencyKey,
        },
        ownerPool
      );

      const claimed = (await repo.claimPendingBatch("worker-perm", 10, 30, workerPool)).find((c) => c.id === cmd.id)!;

      await withWorkerTransaction(workspaceId, async (client) => {
        await repo.markPermanentFailure(
          claimed.id,
          "worker-perm",
          claimed.lease_token!,
          "Invalid recipient phone number",
          client
        );
      }, workerPool);

      const verify = await ownerPool.query("SELECT status, error_message, lease_until FROM outbound_commands WHERE id = $1;", [claimed.id]);
      expect(verify.rows[0].status).toBe("dead_letter");
      expect(verify.rows[0].error_message).toBe("Invalid recipient phone number");
      expect(verify.rows[0].lease_until).toBeNull();
    });

    it("should markReconciliationRequired for ambiguous outcomes", async () => {
      const idempotencyKey = `recon-req-${Date.now()}`;
      const cmd = await repo.enqueueOutboundCommand(
        {
          workspaceId,
          channelInstanceId,
          messageId,
          threadId,
          recipientE164: "+5511999990002",
          body: "Recon test",
          idempotencyKey,
        },
        ownerPool
      );

      const claimed = (await repo.claimPendingBatch("worker-recon", 10, 30, workerPool)).find((c) => c.id === cmd.id)!;

      await repo.markReconciliationRequired(
        claimed.id,
        "worker-recon",
        claimed.lease_token!,
        "Socket reset after message dispatch payload transmitted",
        workerPool
      );

      const verify = await ownerPool.query("SELECT status, error_message, lease_until FROM outbound_commands WHERE id = $1;", [claimed.id]);
      expect(verify.rows[0].status).toBe("reconciliation_required");
      expect(verify.rows[0].lease_until).toBeNull();
    });

    it("should reclaimExpiredLeases and transition abandoned processing items to reconciliation_required", async () => {
      const idempotencyKey = `reclaim-lease-${Date.now()}`;
      const cmd = await repo.enqueueOutboundCommand(
        {
          workspaceId,
          channelInstanceId,
          messageId,
          threadId,
          recipientE164: "+5511999990002",
          body: "Reclaim lease test",
          idempotencyKey,
        },
        ownerPool
      );

      // Simulate abandoned processing command with expired lease
      await ownerPool.query(`
        UPDATE outbound_commands
        SET status = 'processing',
            worker_id = 'dead-worker',
            lease_token = gen_random_uuid(),
            lease_until = clock_timestamp() - INTERVAL '10 seconds'
        WHERE id = $1;
      `, [cmd.id]);

      const reclaimedCount = await repo.reclaimExpiredLeases(10, workerPool);
      expect(reclaimedCount).toBeGreaterThanOrEqual(1);

      const verify = await ownerPool.query("SELECT status, error_message, lease_until FROM outbound_commands WHERE id = $1;", [cmd.id]);
      expect(verify.rows[0].status).toBe("reconciliation_required");
      expect(verify.rows[0].error_message).toContain("LEASE_EXPIRED_RECLAIMED");
      expect(verify.rows[0].lease_until).toBeNull();
    });
  });
});
