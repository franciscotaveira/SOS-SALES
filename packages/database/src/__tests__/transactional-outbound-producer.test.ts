import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import {
  createTestDatabasePools,
  withTenantTransaction,
  withWorkerTransaction,
  TransactionalOutboundProducerRepository,
  IdempotencyRaceLostError,
  OutboundCommandRepository,
} from "../index";


describe("TransactionalOutboundProducerRepository (CH-11)", () => {
  const { ownerPool, appPool, workerPool } = createTestDatabasePools();
  const producerRepo = new TransactionalOutboundProducerRepository(appPool);
  const workerRepo = new OutboundCommandRepository(workerPool);

  let workspaceId: string;
  let channelInstanceId: string;
  const actorId = crypto.randomUUID();

  beforeAll(async () => {
    // 1. Provision Organization and Workspace
    const orgRes = await ownerPool.query(`
      INSERT INTO organizations (name, slug)
      VALUES ('CH-11 Test Org', $1)
      RETURNING id;
    `, [`org-ch11-${Date.now()}`]);
    const orgId = orgRes.rows[0].id;

    const wsRes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'CH-11 Test Workspace', $2)
      RETURNING id;
    `, [orgId, `ws-ch11-${Date.now()}`]);
    workspaceId = wsRes.rows[0].id;

    // 2. Provision User
    await ownerPool.query(`
      INSERT INTO users (id, email, name)
      VALUES ($1, $2, 'CH-11 Operator')
      ON CONFLICT (id) DO NOTHING;
    `, [actorId, `operator-${Date.now()}@mct.br`]);

    await ownerPool.query(`
      INSERT INTO workspace_memberships (workspace_id, user_id, role)
      VALUES ($1, $2, 'operator')
      ON CONFLICT DO NOTHING;
    `, [workspaceId, actorId]);


    // 3. Provision Channel Instance with sender phone
    const tokenHash = crypto.createHash("sha256").update(`token-ch11-${Date.now()}`).digest("hex");
    const chanRes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164,
        endpoint_token_hash, is_active
      ) VALUES ($1, 'meta_waba', 'CH-11 Line', '+5511999991111', $2, true)
      RETURNING id;
    `, [workspaceId, tokenHash]);
    channelInstanceId = chanRes.rows[0].id;
  });

  afterAll(async () => {
    await ownerPool.end();
    await appPool.end();
    await workerPool.end();
  });


  describe("1. Migration 006: Named Constraint & Drift Detection", () => {
    it("should have applied named constraint chk_outbound_payload_fingerprint", async () => {
      const res = await ownerPool.query(`
        SELECT conname, pg_get_constraintdef(oid) as def
        FROM pg_constraint
        WHERE conname = 'chk_outbound_payload_fingerprint'
          AND conrelid = 'public.outbound_commands'::regclass;
      `);

      expect(res.rows.length).toBe(1);
      expect(res.rows[0].conname).toBe("chk_outbound_payload_fingerprint");
      expect(res.rows[0].def).toContain("64");
    });

    it("should confirm column payload_fingerprint exists with type text", async () => {
      const res = await ownerPool.query(`
        SELECT data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'outbound_commands'
          AND column_name = 'payload_fingerprint';
      `);

      expect(res.rows.length).toBe(1);
      expect(res.rows[0].data_type).toBe("text");
      expect(res.rows[0].is_nullable).toBe("YES");
    });

    it("should reject invalid fingerprint not matching 64 hex characters", async () => {
      await expect(
        ownerPool.query(`
          INSERT INTO outbound_commands (
            workspace_id, channel_instance_id, message_id, recipient_e164,
            body, idempotency_key, payload_fingerprint
          ) VALUES (
            $1, $2, gen_random_uuid(), '+5511999992222',
            'test body', 'bad-fp-1', 'not-a-valid-64-hex'
          )
        `, [workspaceId, channelInstanceId])
      ).rejects.toThrow(/chk_outbound_payload_fingerprint/);
    });
  });

  describe("2. Least Privilege: sos_app_user has NO UPDATE on outbound_commands", () => {
    it("should deny UPDATE on outbound_commands for sos_app_user", async () => {
      const client = await appPool.connect();
      try {
        await client.query("BEGIN;");
        await client.query("SELECT set_config('app.current_workspace_id', $1, true);", [workspaceId]);

        let updateSucceeded = false;
        try {
          await client.query(`
            UPDATE public.outbound_commands
            SET status = 'sent'
            WHERE workspace_id = $1;
          `, [workspaceId]);
          updateSucceeded = true;
        } catch (err: any) {
          expect(err.message).toMatch(/permission denied for table outbound_commands/i);
        } finally {
          await client.query("ROLLBACK;");
        }

        expect(updateSucceeded).toBe(false);
      } finally {
        client.release();
      }
    });

    it("should deny DELETE on outbound_commands for sos_app_user", async () => {
      const client = await appPool.connect();
      try {
        await client.query("BEGIN;");
        await client.query("SELECT set_config('app.current_workspace_id', $1, true);", [workspaceId]);

        let deleteSucceeded = false;
        try {
          await client.query(`
            DELETE FROM public.outbound_commands
            WHERE workspace_id = $1;
          `, [workspaceId]);
          deleteSucceeded = true;
        } catch (err: any) {
          expect(err.message).toMatch(/permission denied for table outbound_commands/i);
        } finally {
          await client.query("ROLLBACK;");
        }

        expect(deleteSucceeded).toBe(false);
      } finally {
        client.release();
      }
    });
  });

  describe("3. Atomic Outbound Intention Persistence", () => {
    it("should persist 1 message + 1 command + 1 audit in a single transaction", async () => {
      const idempotencyKey = `atomic-idemp-${Date.now()}`;
      const payloadFingerprint = crypto.createHash("sha256").update(idempotencyKey).digest("hex");
      const recipientPhone = "+5511999993333";
      const messageBody = "Atomic persistence test";

      const outcome = await withTenantTransaction(workspaceId, async (client) => {
        const contactId = await producerRepo.upsertContact(
          { workspaceId, phoneE164: recipientPhone },
          client
        );
        const threadId = await producerRepo.upsertCommercialThread(
          { workspaceId, channelInstanceId, contactId },
          client
        );
        const message = await producerRepo.insertMessage(
          {
            workspaceId,
            channelInstanceId,
            threadId,
            provider: "meta_waba",
            senderE164: "+5511999991111",
            recipientE164: recipientPhone,
            contentType: "text",
            body: messageBody,
          },
          client
        );
        const command = await producerRepo.insertOutboundCommand(
          {
            workspaceId,
            channelInstanceId,
            threadId,
            messageId: message.id,
            recipientE164: recipientPhone,
            body: messageBody,
            idempotencyKey,
            payloadFingerprint,
          },
          client
        );
        expect(command).not.toBeNull();

        const auditId = await producerRepo.recordAudit(
          {
            workspaceId,
            actorId,
            action: "outbound.enqueued",
            resourceType: "outbound_command",
            resourceId: command!.id,
            metadata: {
              channelInstanceId,
              messageId: message.id,
              threadId,
              contactId,
              payloadFingerprint,
              idempotencyKey,
            },
          },
          client
        );

        return { contactId, threadId, messageId: message.id, commandId: command!.id, auditId };
      }, appPool);

      // Verify in DB
      const msgCheck = await ownerPool.query(
        "SELECT id, delivery_status FROM messages WHERE id = $1",
        [outcome.messageId]
      );
      expect(msgCheck.rows.length).toBe(1);
      expect(msgCheck.rows[0].delivery_status).toBe("queued");

      const cmdCheck = await ownerPool.query(
        "SELECT id, payload_fingerprint, status FROM outbound_commands WHERE id = $1",
        [outcome.commandId]
      );
      expect(cmdCheck.rows.length).toBe(1);
      expect(cmdCheck.rows[0].payload_fingerprint).toBe(payloadFingerprint);
      expect(cmdCheck.rows[0].status).toBe("pending");

      const auditCheck = await ownerPool.query(
        "SELECT id, action FROM audit_events WHERE id = $1",
        [outcome.auditId]
      );
      expect(auditCheck.rows.length).toBe(1);
      expect(auditCheck.rows[0].action).toBe("outbound.enqueued");
    });

    it("should fully rollback and leave zero orphan messages if transaction fails", async () => {
      let insertedMessageId: string | null = null;
      const recipientPhone = "+5511999994444";

      await expect(
        withTenantTransaction(workspaceId, async (client) => {
          const contactId = await producerRepo.upsertContact(
            { workspaceId, phoneE164: recipientPhone },
            client
          );
          const threadId = await producerRepo.upsertCommercialThread(
            { workspaceId, channelInstanceId, contactId },
            client
          );
          const message = await producerRepo.insertMessage(
            {
              workspaceId,
              channelInstanceId,
              threadId,
              provider: "meta_waba",
              senderE164: "+5511999991111",
              recipientE164: recipientPhone,
              contentType: "text",
              body: "This message must be rolled back",
            },
            client
          );
          insertedMessageId = message.id;

          // Force failure before commit
          throw new Error("SIMULATED_PRODUCER_TRANSACTION_FAILURE");
        }, appPool)
      ).rejects.toThrow("SIMULATED_PRODUCER_TRANSACTION_FAILURE");

      expect(insertedMessageId).not.toBeNull();

      // Verify zero orphan messages in DB
      const orphanCheck = await ownerPool.query(
        "SELECT id FROM messages WHERE id = $1",
        [insertedMessageId]
      );
      expect(orphanCheck.rows.length).toBe(0);
    });
  });

  describe("4. Replay Projection with Canonical JOIN", () => {
    it("should retrieve contactId, messageId, and deliveryStatus via explicit relational JOIN", async () => {
      const idempotencyKey = `replay-test-${Date.now()}`;
      const payloadFingerprint = crypto.createHash("sha256").update(idempotencyKey).digest("hex");
      const recipientPhone = "+5511999995555";

      let seededContactId: string;
      let seededMessageId: string;
      let seededCommandId: string;

      await withTenantTransaction(workspaceId, async (client) => {
        seededContactId = await producerRepo.upsertContact(
          { workspaceId, phoneE164: recipientPhone },
          client
        );
        const threadId = await producerRepo.upsertCommercialThread(
          { workspaceId, channelInstanceId, contactId: seededContactId },
          client
        );
        const msg = await producerRepo.insertMessage(
          {
            workspaceId,
            channelInstanceId,
            threadId,
            provider: "meta_waba",
            senderE164: "+5511999991111",
            recipientE164: recipientPhone,
            contentType: "text",
            body: "Replay projection check",
          },
          client
        );
        seededMessageId = msg.id;

        const cmd = await producerRepo.insertOutboundCommand(
          {
            workspaceId,
            channelInstanceId,
            threadId,
            messageId: seededMessageId,
            recipientE164: recipientPhone,
            body: "Replay projection check",
            idempotencyKey,
            payloadFingerprint,
          },
          client
        );
        seededCommandId = cmd!.id;
      }, appPool);

      // Perform replay query
      const projection = await withTenantTransaction(workspaceId, async (client) => {
        return producerRepo.findReplayProjection({ workspaceId, idempotencyKey }, client);
      }, appPool);

      expect(projection).not.toBeNull();
      expect(projection!.commandId).toBe(seededCommandId!);
      expect(projection!.messageId).toBe(seededMessageId!);
      expect(projection!.contactId).toBe(seededContactId!);
      expect(projection!.payloadFingerprint).toBe(payloadFingerprint);
      expect(projection!.commandStatus).toBe("pending");
      expect(projection!.deliveryStatus).toBe("queued");
    });

    it("should fail closed if existing legacy record lacks payload_fingerprint", async () => {
      const legacyIdempotencyKey = `legacy-idemp-${Date.now()}`;
      const recipientPhone = "+5511999996666";

      // Seed directly with null fingerprint using ownerPool
      const contactRes = await ownerPool.query(`
        INSERT INTO contacts (workspace_id, phone_e164) VALUES ($1, $2) RETURNING id;
      `, [workspaceId, recipientPhone]);
      const contactId = contactRes.rows[0].id;

      const threadRes = await ownerPool.query(`
        INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id)
        VALUES ($1, $2, $3) RETURNING id;
      `, [workspaceId, channelInstanceId, contactId]);
      const threadId = threadRes.rows[0].id;

      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, delivery_status
        ) VALUES ($1, $2, $3, 'meta_waba', 'outbound', '+5511999991111', $4, 'text', 'Legacy body', 'queued')
        RETURNING id;
      `, [workspaceId, channelInstanceId, threadId, recipientPhone]);
      const messageId = msgRes.rows[0].id;

      await ownerPool.query(`
        INSERT INTO outbound_commands (
          workspace_id, channel_instance_id, thread_id, message_id,
          recipient_e164, body, idempotency_key, payload_fingerprint, status
        ) VALUES ($1, $2, $3, $4, $5, 'Legacy body', $6, NULL, 'pending');
      `, [workspaceId, channelInstanceId, threadId, messageId, recipientPhone, legacyIdempotencyKey]);

      // Query replay projection
      const projection = await withTenantTransaction(workspaceId, async (client) => {
        return producerRepo.findReplayProjection({ workspaceId, idempotencyKey: legacyIdempotencyKey }, client);
      }, appPool);

      expect(projection).not.toBeNull();
      expect(projection!.payloadFingerprint).toBeNull();
    });
  });

  describe("5. High Concurrency: 10 Parallel Requests with Same Idempotency Key", () => {
    it("should create strictly 1 message, 1 command and rollback 9 losing races", async () => {
      const sharedKey = `race-idemp-${Date.now()}`;
      const sharedFingerprint = crypto.createHash("sha256").update(sharedKey).digest("hex");
      const recipientPhone = "+5511999997777";
      const body = "Concurrent race test";

      let winCount = 0;
      let raceLostCount = 0;

      // Run 10 parallel attempts
      const attempts = Array.from({ length: 10 }).map(async () => {
        try {

          return await withTenantTransaction(workspaceId, async (client) => {
            const contactId = await producerRepo.upsertContact(
              { workspaceId, phoneE164: recipientPhone },
              client
            );
            const threadId = await producerRepo.upsertCommercialThread(
              { workspaceId, channelInstanceId, contactId },
              client
            );
            const message = await producerRepo.insertMessage(
              {
                workspaceId,
                channelInstanceId,
                threadId,
                provider: "meta_waba",
                senderE164: "+5511999991111",
                recipientE164: recipientPhone,
                contentType: "text",
                body,
              },
              client
            );

            const command = await producerRepo.insertOutboundCommand(
              {
                workspaceId,
                channelInstanceId,
                threadId,
                messageId: message.id,
                recipientE164: recipientPhone,
                body,
                idempotencyKey: sharedKey,
                payloadFingerprint: sharedFingerprint,
              },
              client
            );

            if (!command) {
              throw new IdempotencyRaceLostError(workspaceId, sharedKey);
            }

            winCount++;
            return { winner: true, messageId: message.id, commandId: command.id };
          }, appPool);
        } catch (err: any) {
          if (err instanceof IdempotencyRaceLostError) {
            raceLostCount++;
            // Replay from winner
            const winner = await withTenantTransaction(workspaceId, async (client) => {
              return producerRepo.findReplayProjection({ workspaceId, idempotencyKey: sharedKey }, client);
            }, appPool);
            return { winner: false, messageId: winner!.messageId, commandId: winner!.commandId };
          }
          throw err;
        }
      });

      const results = await Promise.all(attempts);

      expect(winCount).toBe(1);
      expect(raceLostCount).toBe(9);

      // All 10 results must have converged on the exact same messageId and commandId
      const firstResult = results[0]!;
      for (const res of results) {
        expect(res.messageId).toBe(firstResult.messageId);
        expect(res.commandId).toBe(firstResult.commandId);
      }

      // Verify in DB that only 1 message and 1 command exist
      const totalCommands = await ownerPool.query(
        "SELECT count(*) FROM outbound_commands WHERE workspace_id = $1 AND idempotency_key = $2",
        [workspaceId, sharedKey]
      );
      expect(Number(totalCommands.rows[0].count)).toBe(1);

      const totalMessages = await ownerPool.query(
        "SELECT count(*) FROM messages WHERE workspace_id = $1 AND body = $2",
        [workspaceId, body]
      );
      expect(Number(totalMessages.rows[0].count)).toBe(1);
    });
  });

  describe("6. Consumer Compatibility: Worker CH-10 consumes CH-11 command", () => {
    it("should allow OutboundCommandRepository to claim and process CH-11 produced command", async () => {
      const idempotencyKey = `worker-compat-${Date.now()}`;
      const payloadFingerprint = crypto.createHash("sha256").update(idempotencyKey).digest("hex");
      const recipientPhone = "+5511999998888";

      let commandId: string;

      // Produce command using producerRepo
      await withTenantTransaction(workspaceId, async (client) => {
        const contactId = await producerRepo.upsertContact(
          { workspaceId, phoneE164: recipientPhone },
          client
        );
        const threadId = await producerRepo.upsertCommercialThread(
          { workspaceId, channelInstanceId, contactId },
          client
        );
        const message = await producerRepo.insertMessage(
          {
            workspaceId,
            channelInstanceId,
            threadId,
            provider: "meta_waba",
            senderE164: "+5511999991111",
            recipientE164: recipientPhone,
            contentType: "text",
            body: "Worker CH-10 dispatch test",
          },
          client
        );
        const command = await producerRepo.insertOutboundCommand(
          {
            workspaceId,
            channelInstanceId,
            threadId,
            messageId: message.id,
            recipientE164: recipientPhone,
            body: "Worker CH-10 dispatch test",
            idempotencyKey,
            payloadFingerprint,
          },
          client
        );
        commandId = command!.id;
      }, appPool);

      // Claim command using workerRepo
      const workerId = `worker-test-${Date.now()}`;
      const claimed = await withWorkerTransaction(workspaceId, async (client) => {
        return workerRepo.claimPendingBatch(workerId, 10, 60, client);
      }, workerPool);


      const myCommand = claimed.find((c) => c.id === commandId);
      expect(myCommand).toBeDefined();
      expect(myCommand!.status).toBe("processing");
      expect(myCommand!.lease_token).toBeDefined();

      // Mark sent by worker
      await withWorkerTransaction(workspaceId, async (client) => {
        await workerRepo.markSent(
          commandId,
          workerId,
          myCommand!.lease_token!,
          `wamid.test.${Date.now()}`,
          new Date(),
          client
        );
      }, workerPool);


      // Verify final status in DB
      const finalRes = await ownerPool.query(
        "SELECT status, external_message_id FROM outbound_commands WHERE id = $1",
        [commandId!]
      );
      expect(finalRes.rows[0].status).toBe("sent");
      expect(finalRes.rows[0].external_message_id).toContain("wamid.test.");
    });
  });
});
