import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import crypto from "node:crypto";
import {
  createTestDatabasePools,
  withWorkerTransaction,
  resetTestQueueState,
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

  let orgId: string;
  let workspaceId: string;
  let channelInstanceId: string;
  let contactId: string;
  let threadId: string;
  let messageId: string;

  beforeAll(async () => {
    // 0. Reset operational queues
    await resetTestQueueState(ownerPool);

    // 1. Provision Workspace
    const orgRes = await ownerPool.query(`
      INSERT INTO organizations (name, slug)
      VALUES ('Repo Test Org', $1)
      RETURNING id;
    `, [`org-repo-${Date.now()}`]);
    orgId = orgRes.rows[0].id;

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

  beforeEach(async () => {
    await ownerPool.query("DELETE FROM public.outbound_commands WHERE workspace_id = $1;", [workspaceId]);
  });

  afterAll(async () => {
    await ownerPool.query("DELETE FROM workspaces WHERE id = $1;", [workspaceId]);
    await ownerPool.query("DELETE FROM organizations WHERE id = $1;", [orgId]);
    await resetTestQueueState(ownerPool);
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

    it("should NOT claim expired lease item from processing status via normal claim, but reclaim it via reclaimExpiredLeases", async () => {
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

      // Normal claim MUST NOT claim processing items (P0-5)
      const claimedBatch = await repo.claimPendingBatch("worker-recovery", 10, 30, workerPool);
      const recoveredItem = claimedBatch.find((c) => c.id === cmd.id);
      expect(recoveredItem).toBeUndefined();

      // Explicit lease recovery reclaims it to reconciliation_required without incrementing retry_count
      const reclaimed = await repo.reclaimExpiredLeases(10, workerPool);
      expect(reclaimed).toBeGreaterThanOrEqual(1);

      const verify = await ownerPool.query("SELECT status, error_message, retry_count, lease_until FROM outbound_commands WHERE id = $1;", [cmd.id]);
      expect(verify.rows[0].status).toBe("reconciliation_required");
      expect(verify.rows[0].error_message).toContain("ERR_LEASE_EXPIRED_DURING_PROCESSING");
      expect(verify.rows[0].retry_count).toBe(0);
      expect(verify.rows[0].lease_until).toBeNull();
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
      expect(verify.rows[0].error_message).toContain("ERR_LEASE_EXPIRED_DURING_PROCESSING");
      expect(verify.rows[0].lease_until).toBeNull();
    });
  });

  describe("5. Deterministic Post-Send Reconciliation Monotonic Fencing (Tests A-J)", () => {
    async function createClaimedCommand(prefix: string) {
      const idempotencyKey = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const cmd = await repo.enqueueOutboundCommand(
        {
          workspaceId,
          channelInstanceId,
          messageId,
          threadId,
          recipientE164: "+5511999990002",
          body: `Post-send test ${prefix}`,
          idempotencyKey,
        },
        ownerPool
      );
      const workerId = `worker-${prefix}`;
      const batch = await repo.claimPendingBatch(workerId, 10, 30, workerPool);
      const claimed = batch.find((c) => c.id === cmd.id)!;
      return { cmd, claimed, workerId, leaseToken: claimed.lease_token! };
    }

    it("A. processing → reconciliation_required com lease válida", async () => {
      const { cmd, workerId, leaseToken } = await createClaimedCommand("test-a");
      const extMsgId = `wamid.test-a-${Date.now()}`;

      const outcome = await withWorkerTransaction(workspaceId, async (client) => {
        return repo.markPostSendReconciliationRequired(
          workspaceId,
          cmd.id,
          workerId,
          leaseToken,
          extMsgId,
          "Simulated post-send finalization failure",
          client
        );
      }, workerPool);

      expect(outcome.outcome).toBe("transitioned_to_reconciliation");
      expect(outcome.persistedExternalMessageId).toBe(extMsgId);
      expect(outcome.persistedStatus).toBe("reconciliation_required");

      const check = await ownerPool.query(
        "SELECT status, worker_id, lease_token, lease_until, external_message_id, error_message FROM outbound_commands WHERE id = $1;",
        [cmd.id]
      );
      expect(check.rows[0].status).toBe("reconciliation_required");
      expect(check.rows[0].worker_id).toBeNull();
      expect(check.rows[0].lease_token).toBeNull();
      expect(check.rows[0].lease_until).toBeNull();
      expect(check.rows[0].external_message_id).toBe(extMsgId);
      expect(check.rows[0].error_message).toBe("Simulated post-send finalization failure");
    });

    it("B. sent concorrente → permanece sent", async () => {
      const { cmd, workerId, leaseToken } = await createClaimedCommand("test-b");
      const confirmedExtId = `wamid.confirmed-webhook-b-${Date.now()}`;

      // Simulate concurrent webhook setting status='sent' before compensation executes
      await ownerPool.query(
        "UPDATE outbound_commands SET status = 'sent', external_message_id = $1, sent_at = clock_timestamp(), worker_id = NULL, lease_token = NULL, lease_until = NULL WHERE id = $2;",
        [confirmedExtId, cmd.id]
      );

      // Late compensation executes
      const outcome = await withWorkerTransaction(workspaceId, async (client) => {
        return repo.markPostSendReconciliationRequired(
          workspaceId,
          cmd.id,
          workerId,
          leaseToken,
          `wamid.late-divergent-b-${Date.now()}`,
          "Late compensation error",
          client
        );
      }, workerPool);

      expect(outcome.outcome).toBe("already_sent");
      expect(outcome.persistedExternalMessageId).toBe(confirmedExtId);
      expect(outcome.persistedStatus).toBe("sent");

      const check = await ownerPool.query(
        "SELECT status, external_message_id FROM outbound_commands WHERE id = $1;",
        [cmd.id]
      );
      expect(check.rows[0].status).toBe("sent");
      expect(check.rows[0].external_message_id).toBe(confirmedExtId);
    });

    it("C. dead_letter concorrente → permanece dead_letter", async () => {
      const { cmd, workerId, leaseToken } = await createClaimedCommand("test-c");

      // Concurrent terminal dead_letter
      await ownerPool.query(
        "UPDATE outbound_commands SET status = 'dead_letter', error_message = 'Terminal delivery drop', worker_id = NULL, lease_token = NULL, lease_until = NULL WHERE id = $1;",
        [cmd.id]
      );

      const outcome = await withWorkerTransaction(workspaceId, async (client) => {
        return repo.markPostSendReconciliationRequired(
          workspaceId,
          cmd.id,
          workerId,
          leaseToken,
          `wamid.late-c-${Date.now()}`,
          "Late compensation attempt",
          client
        );
      }, workerPool);

      expect(outcome.outcome).toBe("already_dead_letter");
      expect(outcome.persistedStatus).toBe("dead_letter");

      const check = await ownerPool.query(
        "SELECT status, error_message FROM outbound_commands WHERE id = $1;",
        [cmd.id]
      );
      expect(check.rows[0].status).toBe("dead_letter");
      expect(check.rows[0].error_message).toBe("Terminal delivery drop");
    });

    it("D. leaseToken incorreto → nenhuma alteração", async () => {
      const { cmd, workerId } = await createClaimedCommand("test-d");
      const invalidLease = crypto.randomUUID();

      const outcome = await withWorkerTransaction(workspaceId, async (client) => {
        return repo.markPostSendReconciliationRequired(
          workspaceId,
          cmd.id,
          workerId,
          invalidLease,
          `wamid.bad-lease-${Date.now()}`,
          "Invalid lease attempt",
          client
        );
      }, workerPool);

      expect(outcome.outcome).toBe("ownership_lost");
      expect(outcome.persistedStatus).toBe("processing");

      const check = await ownerPool.query(
        "SELECT status, worker_id, lease_token, external_message_id FROM outbound_commands WHERE id = $1;",
        [cmd.id]
      );
      expect(check.rows[0].status).toBe("processing");
      expect(check.rows[0].worker_id).toBe(workerId);
      expect(check.rows[0].external_message_id).toBeNull();
    });

    it("E. workerId incorreto → nenhuma alteração", async () => {
      const { cmd, leaseToken } = await createClaimedCommand("test-e");

      const outcome = await withWorkerTransaction(workspaceId, async (client) => {
        return repo.markPostSendReconciliationRequired(
          workspaceId,
          cmd.id,
          "rogue-worker-impostor",
          leaseToken,
          `wamid.bad-worker-${Date.now()}`,
          "Impostor attempt",
          client
        );
      }, workerPool);

      expect(outcome.outcome).toBe("ownership_lost");
      expect(outcome.persistedStatus).toBe("processing");

      const check = await ownerPool.query(
        "SELECT status, worker_id, lease_token, external_message_id FROM outbound_commands WHERE id = $1;",
        [cmd.id]
      );
      expect(check.rows[0].status).toBe("processing");
      expect(check.rows[0].lease_token).toBe(leaseToken);
      expect(check.rows[0].external_message_id).toBeNull();
    });

    it("F. workspace incorreto → nenhuma alteração", async () => {
      const { cmd, workerId, leaseToken } = await createClaimedCommand("test-f");
      const wrongWorkspaceId = crypto.randomUUID();

      const outcome = await withWorkerTransaction(wrongWorkspaceId, async (client) => {
        return repo.markPostSendReconciliationRequired(
          wrongWorkspaceId,
          cmd.id,
          workerId,
          leaseToken,
          `wamid.wrong-ws-${Date.now()}`,
          "Cross workspace attempt",
          client
        );
      }, workerPool);

      expect(outcome.outcome).toBe("invalid_state");

      const check = await ownerPool.query(
        "SELECT status, worker_id, lease_token, external_message_id FROM outbound_commands WHERE id = $1;",
        [cmd.id]
      );
      expect(check.rows[0].status).toBe("processing");
      expect(check.rows[0].worker_id).toBe(workerId);
      expect(check.rows[0].lease_token).toBe(leaseToken);
    });

    it("G. webhook confirma sent entre rollback e compensação", async () => {
      const { cmd, workerId, leaseToken } = await createClaimedCommand("test-g");
      const webhookExtId = `wamid.webhook-fast-g-${Date.now()}`;

      // Provider sent successfully. Local transaction rolled back.
      // Webhook confirms sent BEFORE markPostSendReconciliationRequired runs.
      await withWorkerTransaction(workspaceId, async (client) => {
        await client.query(
          `UPDATE outbound_commands
           SET status = 'sent', external_message_id = $1, sent_at = clock_timestamp(),
               worker_id = NULL, lease_token = NULL, lease_until = NULL, updated_at = clock_timestamp()
           WHERE id = $2 AND workspace_id = $3;`,
          [webhookExtId, cmd.id, workspaceId]
        );
      }, workerPool);

      // Late compensation now runs
      const outcome = await withWorkerTransaction(workspaceId, async (client) => {
        return repo.markPostSendReconciliationRequired(
          workspaceId,
          cmd.id,
          workerId,
          leaseToken,
          `wamid.local-send-g-${Date.now()}`,
          "ERR_POST_SEND_PERSISTENCE_FAILED",
          client
        );
      }, workerPool);

      expect(outcome.outcome).toBe("already_sent");
      expect(outcome.persistedExternalMessageId).toBe(webhookExtId);
      expect(outcome.persistedStatus).toBe("sent");

      const check = await ownerPool.query(
        "SELECT status, external_message_id FROM outbound_commands WHERE id = $1;",
        [cmd.id]
      );
      expect(check.rows[0].status).toBe("sent");
      expect(check.rows[0].external_message_id).toBe(webhookExtId);
    });

    it("H. duas compensações concorrentes", async () => {
      const { cmd, workerId, leaseToken } = await createClaimedCommand("test-h");
      const extMsgId = `wamid.concurrent-h-${Date.now()}`;

      // Simulate two racing compensation handlers (e.g. heartbeat timeout + rollback handler)
      const [outcome1, outcome2] = await Promise.all([
        withWorkerTransaction(workspaceId, async (client) => {
          return repo.markPostSendReconciliationRequired(
            workspaceId,
            cmd.id,
            workerId,
            leaseToken,
            extMsgId,
            "Compensation attempt 1",
            client
          );
        }, workerPool),
        withWorkerTransaction(workspaceId, async (client) => {
          return repo.markPostSendReconciliationRequired(
            workspaceId,
            cmd.id,
            workerId,
            leaseToken,
            extMsgId,
            "Compensation attempt 2",
            client
          );
        }, workerPool),
      ]);

      const outcomeTypes = [outcome1.outcome, outcome2.outcome];
      expect(outcomeTypes).toContain("transitioned_to_reconciliation");
      expect(outcomeTypes).toContain("ownership_lost");

      const check = await ownerPool.query(
        "SELECT status, external_message_id, lease_until, worker_id FROM outbound_commands WHERE id = $1;",
        [cmd.id]
      );
      expect(check.rows[0].status).toBe("reconciliation_required");
      expect(check.rows[0].external_message_id).toBe(extMsgId);
      expect(check.rows[0].lease_until).toBeNull();
      expect(check.rows[0].worker_id).toBeNull();
    });

    it("I. external_message_id já confirmado nunca é substituído por valor divergente", async () => {
      const { cmd, workerId, leaseToken } = await createClaimedCommand("test-i");
      const originalConfirmedId = `wamid.original-confirmed-${Date.now()}`;

      // Set external_message_id on the processing command
      await ownerPool.query(
        "UPDATE outbound_commands SET external_message_id = $1 WHERE id = $2;",
        [originalConfirmedId, cmd.id]
      );

      // Attempt compensation with a divergent externalMessageId
      const outcome = await withWorkerTransaction(workspaceId, async (client) => {
        return repo.markPostSendReconciliationRequired(
          workspaceId,
          cmd.id,
          workerId,
          leaseToken,
          `wamid.divergent-fake-${Date.now()}`,
          "Divergent id test",
          client
        );
      }, workerPool);

      expect(outcome.outcome).toBe("transitioned_to_reconciliation");
      expect(outcome.persistedExternalMessageId).toBe(originalConfirmedId);

      const check = await ownerPool.query(
        "SELECT status, external_message_id FROM outbound_commands WHERE id = $1;",
        [cmd.id]
      );
      expect(check.rows[0].status).toBe("reconciliation_required");
      // Preserved original confirmed id, never replaced by divergent!
      expect(check.rows[0].external_message_id).toBe(originalConfirmedId);
    });

    it("J. nenhuma rota reintroduz retry automático de estado ambíguo", async () => {
      const { cmd, claimed, workerId, leaseToken } = await createClaimedCommand("test-j");
      const extMsgId = `wamid.ambiguous-j-${Date.now()}`;

      // Transition to reconciliation_required
      const outcome = await withWorkerTransaction(workspaceId, async (client) => {
        return repo.markPostSendReconciliationRequired(
          workspaceId,
          cmd.id,
          workerId,
          leaseToken,
          extMsgId,
          "Ambiguous post-send network condition",
          client
        );
      }, workerPool);
      expect(outcome.outcome).toBe("transitioned_to_reconciliation");

      // Verify normal pending claim ignores reconciliation_required items
      const pendingBatch = await repo.claimPendingBatch("worker-regular", 10, 30, workerPool);
      const foundInPending = pendingBatch.find((c) => c.id === cmd.id);
      expect(foundInPending).toBeUndefined();

      // Verify retry_count was not modified and status remains reconciliation_required
      const check = await ownerPool.query(
        "SELECT status, retry_count, next_attempt_at FROM outbound_commands WHERE id = $1;",
        [cmd.id]
      );
      expect(check.rows[0].status).toBe("reconciliation_required");
      expect(check.rows[0].retry_count).toBe(claimed.retry_count);

      // Verify only governed reconciliation claim can pick it up
      const reconBatch = await repo.claimReconciliationBatch("worker-recon", 1000, 30, workerPool);
      const foundInRecon = reconBatch.find((c) => c.id === cmd.id);
      expect(foundInRecon).toBeDefined();
      expect(foundInRecon?.external_message_id).toBe(extMsgId);
    });

    it("K. markProcessing falha e NÃO renova lease quando lease_until expirou no PostgreSQL (clock real)", async () => {
      const { cmd, workerId, leaseToken } = await createClaimedCommand("test-k");

      // Expire lease directly in PostgreSQL using real clock timestamp
      await ownerPool.query(
        "UPDATE outbound_commands SET lease_until = clock_timestamp() - interval '5 seconds' WHERE id = $1;",
        [cmd.id]
      );

      // Attempt heartbeat renewal on expired lease
      const renewed = await withWorkerTransaction(workspaceId, async (client) => {
        return repo.markProcessing(cmd.id, workerId, leaseToken, 30, client);
      }, workerPool);

      // Must fail to renew
      expect(renewed).toBe(false);

      // Verify in DB that lease was NOT renewed into the future
      const check = await ownerPool.query(
        "SELECT lease_until, clock_timestamp() AS now_ts FROM outbound_commands WHERE id = $1;",
        [cmd.id]
      );
      expect(new Date(check.rows[0].lease_until).getTime()).toBeLessThan(new Date(check.rows[0].now_ts).getTime());
    });

    it("L. markSent rejeita lease expirada com FencingViolationError (clock real)", async () => {
      const { cmd, workerId, leaseToken } = await createClaimedCommand("test-l");
      const extMsgId = `wamid.test-l-${Date.now()}`;

      // Expire lease directly in PostgreSQL
      await ownerPool.query(
        "UPDATE outbound_commands SET lease_until = clock_timestamp() - interval '5 seconds' WHERE id = $1;",
        [cmd.id]
      );

      // Attempt to finalize as sent after expiration
      await expect(
        withWorkerTransaction(workspaceId, async (client) => {
          return repo.markSent(cmd.id, workerId, leaseToken, extMsgId, new Date(), client);
        }, workerPool)
      ).rejects.toThrow(FencingViolationError);

      // Verify status in DB did NOT become 'sent'
      const check = await ownerPool.query("SELECT status FROM outbound_commands WHERE id = $1;", [cmd.id]);
      expect(check.rows[0].status).toBe("processing");
    });

    it("M. Provider confirma após expiração da lease sem reclaim: transiciona para reconciliation_required e preserva ID", async () => {
      const { cmd, workerId, leaseToken } = await createClaimedCommand("test-m");
      const extMsgId = `wamid.test-m-${Date.now()}`;

      // Expire lease directly in PostgreSQL without reclaim
      await ownerPool.query(
        "UPDATE outbound_commands SET lease_until = clock_timestamp() - interval '5 seconds' WHERE id = $1;",
        [cmd.id]
      );

      // Worker executes post-send reconciliation compensation
      const outcome = await withWorkerTransaction(workspaceId, async (client) => {
        return repo.markPostSendReconciliationRequired(
          workspaceId,
          cmd.id,
          workerId,
          leaseToken,
          extMsgId,
          "Lease expired during external send",
          client
        );
      }, workerPool);

      expect(outcome.outcome).toBe("transitioned_to_reconciliation");
      expect(outcome.persistedExternalMessageId).toBe(extMsgId);
      expect(outcome.persistedStatus).toBe("reconciliation_required");

      // Verify in DB
      const check = await ownerPool.query(
        "SELECT status, external_message_id, lease_until, worker_id, lease_token FROM outbound_commands WHERE id = $1;",
        [cmd.id]
      );
      expect(check.rows[0].status).toBe("reconciliation_required");
      expect(check.rows[0].external_message_id).toBe(extMsgId);
      expect(check.rows[0].lease_until).toBeNull();
      expect(check.rows[0].worker_id).toBeNull();
      expect(check.rows[0].lease_token).toBeNull();
    });

    it("N. Provider confirma após reclaim concorrente: retorna ownership_lost e NÃO altera o registro", async () => {
      const { cmd, workerId, leaseToken } = await createClaimedCommand("test-n");
      const lateExtId = `wamid.test-n-late-${Date.now()}`;

      // Expire lease in PostgreSQL
      await ownerPool.query(
        "UPDATE outbound_commands SET lease_until = clock_timestamp() - interval '5 seconds' WHERE id = $1;",
        [cmd.id]
      );

      // Another process reclaims the expired lease
      await ownerPool.query(
        `UPDATE outbound_commands 
         SET status = 'reconciliation_required', error_message = 'ERR_RECLAIMED_CONCURRENTLY',
             worker_id = NULL, lease_token = NULL, lease_until = NULL, updated_at = clock_timestamp()
         WHERE id = $1;`,
        [cmd.id]
      );

      // Original worker attempts post-send reconciliation with its old lease token
      const outcome = await withWorkerTransaction(workspaceId, async (client) => {
        return repo.markPostSendReconciliationRequired(
          workspaceId,
          cmd.id,
          workerId,
          leaseToken,
          lateExtId,
          "Late post-send attempt",
          client
        );
      }, workerPool);

      expect(outcome.outcome).toBe("ownership_lost");
      expect(outcome.persistedStatus).toBe("reconciliation_required");

      // Verify database record was NOT overwritten by the late worker
      const check = await ownerPool.query(
        "SELECT status, error_message, external_message_id FROM outbound_commands WHERE id = $1;",
        [cmd.id]
      );
      expect(check.rows[0].status).toBe("reconciliation_required");
      expect(check.rows[0].error_message).toBe("ERR_RECLAIMED_CONCURRENTLY");
      expect(check.rows[0].external_message_id).toBeNull();
    });

    it("O. Webhook grava sent com ID A enquanto tentativa local possui ID B: retorna ID A canônico", async () => {
      const { cmd, workerId, leaseToken } = await createClaimedCommand("test-o");
      const canonicalIdA = `wamid.canonical-id-a-${Date.now()}`;
      const localIdB = `wamid.local-id-b-${Date.now()}`;

      // Concurrent webhook writes sent with ID A
      await ownerPool.query(
        `UPDATE outbound_commands
         SET status = 'sent', external_message_id = $1, sent_at = clock_timestamp(),
             worker_id = NULL, lease_token = NULL, lease_until = NULL, updated_at = clock_timestamp()
         WHERE id = $2;`,
        [canonicalIdA, cmd.id]
      );

      // Local worker compensation runs with ID B
      const outcome = await withWorkerTransaction(workspaceId, async (client) => {
        return repo.markPostSendReconciliationRequired(
          workspaceId,
          cmd.id,
          workerId,
          leaseToken,
          localIdB,
          "Local post-send persistence failure",
          client
        );
      }, workerPool);

      expect(outcome.outcome).toBe("already_sent");
      // MUST return canonical ID A from the database, never local ID B!
      expect(outcome.persistedExternalMessageId).toBe(canonicalIdA);
      expect(outcome.persistedStatus).toBe("sent");
    });

    it("P. markRetryableFailure e markPermanentFailure rejeitam lease expirada com FencingViolationError", async () => {
      const { cmd: cmd1, workerId: w1, leaseToken: lt1 } = await createClaimedCommand("test-p1");
      const { cmd: cmd2, workerId: w2, leaseToken: lt2 } = await createClaimedCommand("test-p2");

      // Expire both leases in PostgreSQL
      await ownerPool.query(
        "UPDATE outbound_commands SET lease_until = clock_timestamp() - interval '5 seconds' WHERE id IN ($1, $2);",
        [cmd1.id, cmd2.id]
      );

      // markRetryableFailure must reject expired lease
      await expect(
        withWorkerTransaction(workspaceId, async (client) => {
          return repo.markRetryableFailure(cmd1.id, w1, lt1, "Transient network drop", new Date(), client);
        }, workerPool)
      ).rejects.toThrow(FencingViolationError);

      // markPermanentFailure must reject expired lease
      await expect(
        withWorkerTransaction(workspaceId, async (client) => {
          return repo.markPermanentFailure(cmd2.id, w2, lt2, "Permanent unrecoverable error", client);
        }, workerPool)
      ).rejects.toThrow(FencingViolationError);
    });
  });
});
