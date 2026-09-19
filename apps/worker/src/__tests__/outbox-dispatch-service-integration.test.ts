import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  createTestDatabasePools,
  encryptPayload,
  DatabaseSigningSecretResolver,
  ChannelInstanceRepository,
  OutboundCommandRepository,
} from "@sos-sales/database";
import {
  ChannelAdapterRegistry,
  ChannelDispatchService,
  ChannelDispatchFailedError,
  ChannelProviderUnavailableError,
  ChannelInstanceNotFoundError,
  maskRecipientPhone,
  type IChannelAdapter,
  type OutboundSendParams,
  type ChannelSendResult,
} from "@sos-sales/application";
import { OutboxDispatcher } from "../processors/outbox-dispatcher";

describe("CH-10: Outbox → Worker → ChannelDispatchService Integration & Resilience", () => {
  const { ownerPool, workerPool } = createTestDatabasePools();
  const testMasterKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  let workspaceAId: string;
  let workspaceBId: string;
  let lineCommercialId: string;
  let lineSupportId: string;
  let wahaLineId: string;
  let workspaceBLineId: string;
  let contactAId: string;
  let threadACommercialId: string;

  async function createMessageAndCommand(opts: {
    workspaceId: string;
    channelInstanceId: string;
    threadId?: string;
    recipientE164?: string;
    body?: string;
    idempotencyKey?: string;
    status?: "pending" | "processing";
    retryCount?: number;
    maxRetries?: number;
  }): Promise<{ messageId: string; commandId: string }> {
    const recipient = opts.recipientE164 || "+5511988887777";
    const body = opts.body || "Test message body";
    const idempKey = opts.idempotencyKey || `idemp-${crypto.randomUUID()}`;
    const status = opts.status || "pending";

    let threadId = opts.threadId;
    if (!threadId) {
      const threadRes = await ownerPool.query(
        `INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status)
         VALUES ($1, $2, $3, 'active')
         ON CONFLICT (workspace_id, channel_instance_id, contact_id) DO UPDATE SET updated_at = clock_timestamp()
         RETURNING id;`,
        [opts.workspaceId, opts.channelInstanceId, contactAId]
      );
      threadId = threadRes.rows[0].id;
    }

    const msgRes = await ownerPool.query(
      `INSERT INTO messages (
        workspace_id, channel_instance_id, thread_id, provider, direction,
        sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
      ) VALUES (
        $1, $2, $3, 'meta_waba', 'outbound',
        '+5511999990001', $4, 'text', $5, 'queued', 0
      ) RETURNING id;`,
      [opts.workspaceId, opts.channelInstanceId, threadId, recipient, body]
    );
    const messageId = msgRes.rows[0].id;

    const outboxRes = await ownerPool.query(
      `INSERT INTO outbound_commands (
        workspace_id, channel_instance_id, thread_id, message_id,
        recipient_e164, body, idempotency_key, status, retry_count, max_retries
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8, $9, $10
      ) RETURNING id;`,
      [
        opts.workspaceId,
        opts.channelInstanceId,
        threadId,
        messageId,
        recipient,
        body,
        idempKey,
        status,
        opts.retryCount ?? 0,
        opts.maxRetries ?? 3,
      ]
    );
    return { messageId, commandId: outboxRes.rows[0].id };
  }

  beforeAll(async () => {
    // 1. Provision Organizations and Workspaces
    const orgRes = await ownerPool.query(`
      INSERT INTO organizations (name, slug)
      VALUES ('CH10 Integration Org', $1)
      RETURNING id;
    `, [`org-ch10-${Date.now()}`]);
    const orgId = orgRes.rows[0].id;

    const wsARes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'Workspace Alpha', $2)
      RETURNING id;
    `, [orgId, `ws-alpha-${Date.now()}`]);
    workspaceAId = wsARes.rows[0].id;

    const wsBRes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'Workspace Beta', $2)
      RETURNING id;
    `, [orgId, `ws-beta-${Date.now()}`]);
    workspaceBId = wsBRes.rows[0].id;

    // 2. Provision Encrypted Credentials
    const rawWabaCreds = JSON.stringify({
      access_token: "EAAB_test_ch10_waba_token",
      phone_number_id: "10987654321",
      app_secret: "waba_secret_ch10",
    });
    const encWaba = encryptPayload(rawWabaCreds, testMasterKey);

    const credWabaRes = await ownerPool.query(`
      INSERT INTO provider_credentials (
        workspace_id, provider, account_id, encrypted_payload, iv, auth_tag
      ) VALUES ($1, 'meta_waba', 'waba_acc_ch10', $2, $3, $4)
      RETURNING id;
    `, [workspaceAId, encWaba.encryptedBase64, encWaba.ivBase64, encWaba.authTagBase64]);
    const credWabaId = credWabaRes.rows[0].id;

    const rawWahaCreds = JSON.stringify({
      api_key: "waha_key_ch10",
      session_name: "ch10-session",
    });
    const encWaha = encryptPayload(rawWahaCreds, testMasterKey);

    const credWahaRes = await ownerPool.query(`
      INSERT INTO provider_credentials (
        workspace_id, provider, account_id, encrypted_payload, iv, auth_tag
      ) VALUES ($1, 'waha', 'waha_acc_ch10', $2, $3, $4)
      RETURNING id;
    `, [workspaceAId, encWaha.encryptedBase64, encWaha.ivBase64, encWaha.authTagBase64]);
    const credWahaId = credWahaRes.rows[0].id;

    const credBRes = await ownerPool.query(`
      INSERT INTO provider_credentials (
        workspace_id, provider, account_id, encrypted_payload, iv, auth_tag
      ) VALUES ($1, 'meta_waba', 'waba_acc_beta', $2, $3, $4)
      RETURNING id;
    `, [workspaceBId, encWaba.encryptedBase64, encWaba.ivBase64, encWaba.authTagBase64]);
    const credBId = credBRes.rows[0].id;

    // 3. Provision Channel Instances:
    // - Line Commercial (Meta WABA, Workspace Alpha)
    const line1Res = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164,
        endpoint_token_hash, credential_id, is_active
      ) VALUES ($1, 'meta_waba', 'Comercial Line Alpha', '+5511999990001', $2, $3, true)
      RETURNING id;
    `, [workspaceAId, crypto.createHash("sha256").update(`tok-com-${Date.now()}`).digest("hex"), credWabaId]);
    lineCommercialId = line1Res.rows[0].id;

    // - Line Support (Meta WABA, Workspace Alpha)
    const line2Res = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164,
        endpoint_token_hash, credential_id, is_active
      ) VALUES ($1, 'meta_waba', 'Support Line Alpha', '+5511999990002', $2, $3, true)
      RETURNING id;
    `, [workspaceAId, crypto.createHash("sha256").update(`tok-sup-${Date.now()}`).digest("hex"), credWabaId]);
    lineSupportId = line2Res.rows[0].id;

    // - WAHA Line (WAHA, Workspace Alpha)
    const wahaRes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164,
        endpoint_token_hash, credential_id, is_active
      ) VALUES ($1, 'waha', 'WAHA Line Alpha', '+5511999990003', $2, $3, true)
      RETURNING id;
    `, [workspaceAId, crypto.createHash("sha256").update(`tok-waha-${Date.now()}`).digest("hex"), credWahaId]);
    wahaLineId = wahaRes.rows[0].id;

    // - Line in Workspace Beta (Cross-tenant probe)
    const wsBLineRes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164,
        endpoint_token_hash, credential_id, is_active
      ) VALUES ($1, 'meta_waba', 'Beta Line', '+5511999990004', $2, $3, true)
      RETURNING id;
    `, [workspaceBId, crypto.createHash("sha256").update(`tok-beta-${Date.now()}`).digest("hex"), credBId]);
    workspaceBLineId = wsBLineRes.rows[0].id;

    // 4. Provision Contact & Thread for Workspace Alpha
    const contactRes = await ownerPool.query(`
      INSERT INTO contacts (workspace_id, phone_e164, name)
      VALUES ($1, '+5511988887777', 'Lead Alpha')
      RETURNING id;
    `, [workspaceAId]);
    contactAId = contactRes.rows[0].id;

    const threadRes = await ownerPool.query(`
      INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status)
      VALUES ($1, $2, $3, 'active')
      RETURNING id;
    `, [workspaceAId, lineCommercialId, contactAId]);
    threadACommercialId = threadRes.rows[0].id;
  });

  afterAll(async () => {
    await workerPool.end();
    await ownerPool.end();
  });

  it("1. should partition outbox commands between two concurrent workers with zero overlap (FOR UPDATE SKIP LOCKED)", async () => {
    const dispatcher = new OutboxDispatcher();
    const commandIds: string[] = [];

    // Insert 10 pending outbound commands with valid message_ids
    for (let i = 0; i < 10; i++) {
      const { commandId } = await createMessageAndCommand({
        workspaceId: workspaceAId,
        channelInstanceId: lineCommercialId,
        body: `Bulk command ${i}`,
        idempotencyKey: `bulk-claim-${Date.now()}-${i}`,
      });
      commandIds.push(commandId);
    }

    // Run claimBatch concurrently from two separate worker IDs
    const [batchAlpha, batchBeta] = await Promise.all([
      dispatcher.claimBatch(workerPool, "worker-concurrent-alpha", 5),
      dispatcher.claimBatch(workerPool, "worker-concurrent-beta", 5),
    ]);

    const alphaIds = batchAlpha.map((c) => c.id);
    const betaIds = batchBeta.map((c) => c.id);

    // Assert strictly no intersection between claimed batches
    const intersection = alphaIds.filter((id) => betaIds.includes(id));
    expect(intersection).toHaveLength(0);

    // Clean up claimed commands
    await ownerPool.query(`DELETE FROM outbound_commands WHERE id = ANY($1::uuid[]);`, [commandIds]);
  });

  it("2. should explicitly route dispatch by channelInstanceId when two active lines share the same provider", async () => {
    const dispatcher = new OutboxDispatcher();
    const registry = new ChannelAdapterRegistry();

    const dispatchedInstances: string[] = [];
    const mockWabaAdapter: IChannelAdapter = {
      provider: "meta_waba",
      async sendMessage(params: OutboundSendParams): Promise<ChannelSendResult> {
        dispatchedInstances.push(params.channelInstanceId);
        return {
          success: true,
          externalMessageId: `wamid.CH10_LINE_${params.channelInstanceId.slice(0, 8)}`,
          sentAt: new Date(),
        };
      },
    };
    registry.register(mockWabaAdapter);

    const secretResolver = new DatabaseSigningSecretResolver({
      pool: workerPool,
      masterKeyHex: testMasterKey,
    });

    // Create command explicitly assigned to lineSupportId (NOT lineCommercialId)
    const { commandId } = await createMessageAndCommand({
      workspaceId: workspaceAId,
      channelInstanceId: lineSupportId,
      body: "Targeting Support Line explicitly",
      idempotencyKey: `explicit-line-${Date.now()}`,
    });

    const claimed = await dispatcher.claimBatch(workerPool, "worker-router-test", 10);
    const item = claimed.find((c) => c.id === commandId);
    expect(item).toBeDefined();

    const result = await dispatcher.dispatchItem(workerPool, item!, "worker-router-test", registry, secretResolver);
    expect(result.success).toBe(true);

    // Verify it was dispatched strictly to lineSupportId
    expect(dispatchedInstances).toContain(lineSupportId);
    expect(dispatchedInstances).not.toContain(lineCommercialId);

    // Verify DB reflects 'sent'
    const check = await ownerPool.query("SELECT status, external_message_id FROM outbound_commands WHERE id = $1", [commandId]);
    expect(check.rows[0].status).toBe("sent");
    expect(check.rows[0].external_message_id).toBe(`wamid.CH10_LINE_${lineSupportId.slice(0, 8)}`);
  });

  it("3. should enforce fail-closed routing without cross-provider fallback", async () => {
    const dispatcher = new OutboxDispatcher();
    const registry = new ChannelAdapterRegistry();

    let wahaAttempts = 0;
    let wabaAttempts = 0;

    const mockWahaAdapter: IChannelAdapter = {
      provider: "waha",
      async sendMessage(): Promise<ChannelSendResult> {
        wahaAttempts++;
        return {
          success: false,
          category: "transient",
          errorCode: "WAHA_SERVER_UNAVAILABLE",
          errorMessage: "WAHA container is restarting",
        };
      },
    };
    const mockWabaAdapter: IChannelAdapter = {
      provider: "meta_waba",
      async sendMessage(): Promise<ChannelSendResult> {
        wabaAttempts++;
        return {
          success: true,
          externalMessageId: "wamid.SHOULD_NEVER_BE_CALLED_AS_FALLBACK",
          sentAt: new Date(),
        };
      },
    };

    registry.register(mockWahaAdapter);
    registry.register(mockWabaAdapter);

    const secretResolver = new DatabaseSigningSecretResolver({
      pool: workerPool,
      masterKeyHex: testMasterKey,
    });

    // Command created for WAHA line
    const { commandId } = await createMessageAndCommand({
      workspaceId: workspaceAId,
      channelInstanceId: wahaLineId,
      body: "Fail closed test message",
      idempotencyKey: `fail-closed-${Date.now()}`,
    });

    const claimed = await dispatcher.claimBatch(workerPool, "worker-fail-closed-test", 10);
    const item = claimed.find((c) => c.id === commandId);
    expect(item).toBeDefined();

    const result = await dispatcher.dispatchItem(workerPool, item!, "worker-fail-closed-test", registry, secretResolver);
    expect(result.success).toBe(false);

    // Verify WAHA was attempted, and WABA was NEVER called as fallback
    expect(wahaAttempts).toBe(1);
    expect(wabaAttempts).toBe(0);
  });

  it("4. should schedule retry with exponential backoff and bounded jitter on transient failure", async () => {
    const dispatcher = new OutboxDispatcher();
    const registry = new ChannelAdapterRegistry();

    const mockTransientAdapter: IChannelAdapter = {
      provider: "meta_waba",
      async sendMessage(): Promise<ChannelSendResult> {
        return {
          success: false,
          category: "transient",
          errorCode: "RATE_LIMIT_EXCEEDED",
          errorMessage: "Rate limit exceeded, retry later",
        };
      },
    };
    registry.register(mockTransientAdapter);

    const secretResolver = new DatabaseSigningSecretResolver({
      pool: workerPool,
      masterKeyHex: testMasterKey,
    });

    const { commandId } = await createMessageAndCommand({
      workspaceId: workspaceAId,
      channelInstanceId: lineCommercialId,
      body: "Retryable backoff test",
      idempotencyKey: `backoff-${Date.now()}`,
      retryCount: 0,
      maxRetries: 5,
    });

    const claimed = await dispatcher.claimBatch(workerPool, "worker-backoff-test", 10);
    const item = claimed.find((c) => c.id === commandId);
    expect(item).toBeDefined();

    const result = await dispatcher.dispatchItem(workerPool, item!, "worker-backoff-test", registry, secretResolver);
    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");

    // Verify DB has status 'failed', retry_count incremented to 1, and next_attempt_at in the future
    const check = await ownerPool.query(
      "SELECT status, retry_count, next_attempt_at, lease_until, error_message FROM outbound_commands WHERE id = $1",
      [commandId]
    );
    expect(check.rows[0].status).toBe("failed");
    expect(check.rows[0].retry_count).toBe(1);
    expect(check.rows[0].lease_until).toBeNull();
    expect(check.rows[0].error_message).toContain("RATE_LIMIT_EXCEEDED");
    expect(new Date(check.rows[0].next_attempt_at).getTime()).toBeGreaterThan(Date.now() - 1000);
  });

  it("5. should route directly to dead_letter without retry on permanent rejection", async () => {
    const dispatcher = new OutboxDispatcher();
    const registry = new ChannelAdapterRegistry();

    const mockPermanentAdapter: IChannelAdapter = {
      provider: "meta_waba",
      async sendMessage(): Promise<ChannelSendResult> {
        return {
          success: false,
          category: "permanent",
          errorCode: "INVALID_TEMPLATE_PARAMETERS",
          errorMessage: "Template variable count mismatch",
        };
      },
    };
    registry.register(mockPermanentAdapter);

    const secretResolver = new DatabaseSigningSecretResolver({
      pool: workerPool,
      masterKeyHex: testMasterKey,
    });

    const { messageId, commandId } = await createMessageAndCommand({
      workspaceId: workspaceAId,
      channelInstanceId: lineCommercialId,
      body: "Permanent fail test",
      idempotencyKey: `perm-fail-${Date.now()}`,
      retryCount: 0,
      maxRetries: 5,
    });

    const claimed = await dispatcher.claimBatch(workerPool, "worker-perm-test", 10);
    const item = claimed.find((c) => c.id === commandId);
    expect(item).toBeDefined();

    const result = await dispatcher.dispatchItem(workerPool, item!, "worker-perm-test", registry, secretResolver);
    expect(result.success).toBe(false);
    expect(result.status).toBe("dead_letter");

    // Command must be dead_letter, lease cleared
    const cmdCheck = await ownerPool.query(
      "SELECT status, lease_until, error_message FROM outbound_commands WHERE id = $1",
      [commandId]
    );
    expect(cmdCheck.rows[0].status).toBe("dead_letter");
    expect(cmdCheck.rows[0].lease_until).toBeNull();
    expect(cmdCheck.rows[0].error_message).toContain("INVALID_TEMPLATE_PARAMETERS");

    // Message must be failed
    const msgCheck = await ownerPool.query(
      "SELECT delivery_status, status_rank FROM messages WHERE id = $1",
      [messageId]
    );
    expect(msgCheck.rows[0].delivery_status).toBe("failed");
    expect(msgCheck.rows[0].status_rank).toBe(-1);
  });

  it("6. should safely recover commands with expired leases using OutboundCommandRepository", async () => {
    const repo = new OutboundCommandRepository(ownerPool);

    // Create message first
    const msgRes = await ownerPool.query(`
      INSERT INTO messages (
        workspace_id, channel_instance_id, thread_id, provider, direction,
        sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
      ) VALUES (
        $1, $2, $3, 'meta_waba', 'outbound',
        '+5511999990001', '+5511988887777', 'text', 'Expired lease message', 'queued', 0
      ) RETURNING id;
    `, [workspaceAId, lineCommercialId, threadACommercialId]);
    const messageId = msgRes.rows[0].id;

    // Enqueue command with expired lease
    const cmd = await repo.enqueueOutboundCommand({
      workspaceId: workspaceAId,
      channelInstanceId: lineCommercialId,
      messageId,
      threadId: threadACommercialId,
      recipientE164: "+5511988887777",
      body: "Expired lease test",
      idempotencyKey: `expired-lease-${Date.now()}`,
    }, ownerPool);
    expect(cmd.id).toBeDefined();

    // Force expired lease state directly
    await ownerPool.query(`
      UPDATE outbound_commands
      SET status = 'processing', worker_id = 'worker-crashed',
          lease_token = gen_random_uuid(), lease_until = clock_timestamp() - interval '1 minute'
      WHERE id = $1;
    `, [cmd.id]);

    // Claim batch with a new worker
    const batch = await repo.claimPendingBatch("worker-recovered", 10, 30, ownerPool);
    const recovered = batch.find((c) => c.id === cmd.id);
    expect(recovered).toBeDefined();
    expect(recovered!.worker_id).toBe("worker-recovered");
    expect(recovered!.lease_token).toBeDefined();
    expect(new Date(recovered!.lease_until!).getTime()).toBeGreaterThan(Date.now());
  });

  it("7. should transition ambiguous network timeout to reconciliation_required to prevent duplicate dispatch", async () => {
    const dispatcher = new OutboxDispatcher();
    const registry = new ChannelAdapterRegistry();

    const mockTimeoutAdapter: IChannelAdapter = {
      provider: "meta_waba",
      async sendMessage(): Promise<ChannelSendResult> {
        return {
          success: false,
          category: "ambiguous",
          errorCode: "ETIMEDOUT",
          errorMessage: "Connection timed out waiting for headers",
        };
      },
    };
    registry.register(mockTimeoutAdapter);

    const secretResolver = new DatabaseSigningSecretResolver({
      pool: workerPool,
      masterKeyHex: testMasterKey,
    });

    const { commandId } = await createMessageAndCommand({
      workspaceId: workspaceAId,
      channelInstanceId: lineCommercialId,
      body: "Ambiguous timeout test",
      idempotencyKey: `ambiguous-${Date.now()}`,
    });

    const claimed = await dispatcher.claimBatch(workerPool, "worker-ambiguous-test", 10);
    const item = claimed.find((c) => c.id === commandId);
    expect(item).toBeDefined();

    const result = await dispatcher.dispatchItem(workerPool, item!, "worker-ambiguous-test", registry, secretResolver);
    expect(result.success).toBe(false);
    expect(result.status).toBe("reconciliation_required");

    const check = await ownerPool.query(
      "SELECT status, lease_until, error_message FROM outbound_commands WHERE id = $1",
      [commandId]
    );
    expect(check.rows[0].status).toBe("reconciliation_required");
    expect(check.rows[0].lease_until).toBeNull();
    expect(check.rows[0].error_message).toContain("ETIMEDOUT");
  });

  it("8. should persistently reject duplicate commands with identical idempotencyKey", async () => {
    const repo = new OutboundCommandRepository(ownerPool);
    const key = `idemp-persist-${Date.now()}`;

    // Create message
    const msgRes = await ownerPool.query(`
      INSERT INTO messages (
        workspace_id, channel_instance_id, thread_id, provider, direction,
        sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
      ) VALUES (
        $1, $2, $3, 'meta_waba', 'outbound',
        '+5511999990001', '+5511988887777', 'text', 'Persist message', 'queued', 0
      ) RETURNING id;
    `, [workspaceAId, lineCommercialId, threadACommercialId]);
    const messageId = msgRes.rows[0].id;

    const cmd1 = await repo.enqueueOutboundCommand({
      workspaceId: workspaceAId,
      channelInstanceId: lineCommercialId,
      messageId,
      threadId: threadACommercialId,
      recipientE164: "+5511988887777",
      body: "Original command",
      idempotencyKey: key,
    }, ownerPool);
    expect(cmd1.id).toBeDefined();

    const cmd2 = await repo.enqueueOutboundCommand({
      workspaceId: workspaceAId,
      channelInstanceId: lineCommercialId,
      messageId,
      threadId: threadACommercialId,
      recipientE164: "+5511988887777",
      body: "Original command",
      idempotencyKey: key,
    }, ownerPool);
    expect(cmd2.id).toBe(cmd1.id);

    // Verify only ONE row exists in database
    const countRes = await ownerPool.query(
      "SELECT COUNT(*) FROM outbound_commands WHERE workspace_id = $1 AND idempotency_key = $2",
      [workspaceAId, key]
    );
    expect(parseInt(countRes.rows[0].count, 10)).toBe(1);
  });

  it("9. should fail closed with blind enumeration protection when attempting cross-tenant channel dispatch", async () => {
    const registry = new ChannelAdapterRegistry();
    const secretResolver = new DatabaseSigningSecretResolver({
      pool: workerPool,
      masterKeyHex: testMasterKey,
    });

    // 1. Database layer: foreign key constraint fk_outbound_channel strictly rejects cross-tenant command insertion
    await expect(
      ownerPool.query(`
        INSERT INTO outbound_commands (
          workspace_id, channel_instance_id, message_id,
          recipient_e164, body, idempotency_key, status
        ) VALUES (
          $1, $2, gen_random_uuid(),
          '+5511988887777', 'Cross-tenant probe', $3, 'pending'
        );
      `, [workspaceAId, workspaceBLineId, `cross-tenant-${Date.now()}`])
    ).rejects.toThrow(/fk_outbound_channel|foreign key constraint/i);

    // 2. Application layer: ChannelDispatchService rejects cross-tenant lookup with ChannelInstanceNotFoundError
    const dispatchService = new ChannelDispatchService({
      channelInstanceRepo: new ChannelInstanceRepository(workerPool),
      adapterRegistry: registry,
      secretResolver,
    });

    await expect(
      dispatchService.dispatchOutbound(workspaceAId, workspaceBLineId, {
        recipientE164: "+5511988887777",
        body: "Cross-tenant probe",
        idempotencyKey: `cross-tenant-service-${Date.now()}`,
      })
    ).rejects.toThrow(ChannelInstanceNotFoundError);
  });

  it("10. should sanitize logs and mask E.164 phone numbers to prevent PII leakage", () => {
    expect(maskRecipientPhone("+5511999998888")).toBe("+5511*****8888");
    expect(maskRecipientPhone("+14155552671")).toBe("+1415*****2671");
    expect(maskRecipientPhone("short")).toBe("***");
    expect(maskRecipientPhone("")).toBe("***");
  });

  it("11. should statically verify total absence of legacy shell execution in worker and smoke scripts", () => {
    const filesToAudit = [
      path.resolve(__dirname, "../processors/outbox-dispatcher.ts"),
      path.resolve(__dirname, "../index.ts"),
      path.resolve(__dirname, "../../../../scripts/smoke-docker-waha.ts"),
    ];

    const forbiddenPatterns = [
      /\bexec\s*\(/,
      /\bexecSync\s*\(/,
      /spawn\s*\([^)]*shell:\s*true/,
      /\bargs\.join\s*\(/,
    ];

    for (const filePath of filesToAudit) {
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, "utf8");

      for (const pattern of forbiddenPatterns) {
        expect(pattern.test(content)).toBe(false);
      }
    }
  });

  it("12. should verify that ChannelDispatchBaseError.toJSON() strips cause and never leaks internal details", () => {
    const sensitiveCause = new Error("SENSITIVE_INTERNAL_DATABASE_CREDENTIALS_LEAK");
    const error = new ChannelDispatchFailedError("External safe message", sensitiveCause);
    const unavail = new ChannelProviderUnavailableError("meta_waba", "Provider unavailable", sensitiveCause);

    const serialized = error.toJSON();
    expect(serialized).toHaveProperty("name", "ChannelDispatchFailedError");
    expect(serialized).toHaveProperty("message", "External safe message");
    expect(serialized).toHaveProperty("code", "CHANNEL_DISPATCH_FAILED");
    expect(serialized).not.toHaveProperty("cause");

    const unavailSerialized = unavail.toJSON();
    expect(unavailSerialized).toHaveProperty("name", "ChannelProviderUnavailableError");
    expect(unavailSerialized).toHaveProperty("code", "CHANNEL_PROVIDER_UNAVAILABLE");
    expect(unavailSerialized).not.toHaveProperty("cause");

    const jsonString = JSON.stringify(serialized);
    expect(jsonString).not.toContain("SENSITIVE_INTERNAL_DATABASE_CREDENTIALS_LEAK");
  });
});
