import crypto from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDatabasePools } from "../test-support";
import { DatabaseSigningSecretResolver } from "../infrastructure/database-signing-secret-resolver";

describe("Migration 005: Channel Foundation, Ingress Shielding & Transactional Inbox/Outbox", () => {
  const { appPool, ownerPool } = createTestDatabasePools();

  let workspaceAId: string;
  let workspaceBId: string;
  let channelAId: string;
  let channelBId: string;
  let channelA2Id: string; // Second channel in Workspace Alpha
  let credentialAId: string;
  let credentialBId: string;

  const validTokenHashA = "a".repeat(64);
  const previousTokenHashA = "b".repeat(64);
  const validTokenHashB = "c".repeat(64);
  const validTokenHashA2 = "d".repeat(64);
  const expiredTokenHash = "e".repeat(64);
  const expiredPreviousHash = "f".repeat(64);

  const testMasterKeyHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const rawSecretA = "meta_app_secret_test_2026_super_confidential";

  beforeAll(async () => {
    // 1. Provision workspaces
    const orgRes = await ownerPool.query(`
      INSERT INTO organizations (name, slug) 
      VALUES ('Channel Test Org', 'channel-test-org-${Date.now()}') 
      RETURNING id;
    `);
    const orgId = orgRes.rows[0].id;

    const wsARes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug) 
      VALUES ($1, 'Workspace Alpha', 'ws-alpha-${Date.now()}') 
      RETURNING id;
    `, [orgId]);
    workspaceAId = wsARes.rows[0].id;

    const wsBRes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug) 
      VALUES ($1, 'Workspace Beta', 'ws-beta-${Date.now()}') 
      RETURNING id;
    `, [orgId]);
    workspaceBId = wsBRes.rows[0].id;

    // 2. Provision encrypted credentials for Workspace Alpha
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(testMasterKeyHex, "hex"), iv);
    const payloadStr = JSON.stringify({ app_secret: rawSecretA, phone_number_id: "phone_01" });
    const ciphertext = Buffer.concat([cipher.update(payloadStr, "utf-8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const credRes = await ownerPool.query(`
      INSERT INTO provider_credentials (
        workspace_id, provider, account_id, encrypted_payload, iv, auth_tag
      ) VALUES ($1, 'meta_waba', 'waba_acc_01', $2, $3, $4)
      RETURNING id;
    `, [
      workspaceAId,
      ciphertext.toString("base64"),
      iv.toString("base64"),
      authTag.toString("base64"),
    ]);
    credentialAId = credRes.rows[0].id;

    // Provision credential for Workspace Beta (for cross-tenant FK testing)
    const credBRes = await ownerPool.query(`
      INSERT INTO provider_credentials (
        workspace_id, provider, account_id, encrypted_payload, iv, auth_tag
      ) VALUES ($1, 'waha', 'waha_acc_02', 'enc_b', 'iv_b', 'tag_b')
      RETURNING id;
    `, [workspaceBId]);
    credentialBId = credBRes.rows[0].id;

    // 3. Provision Channel Instances
    const chanARes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164, 
        endpoint_token_hash, previous_token_hash, previous_token_valid_until, 
        credential_id, is_active
      ) VALUES (
        $1, 'meta_waba', 'WABA Alpha Line 1', '+5511999998888',
        $2, $3, NOW() + INTERVAL '1 hour', $4, true
      ) RETURNING id;
    `, [workspaceAId, validTokenHashA, previousTokenHashA, credentialAId]);
    channelAId = chanARes.rows[0].id;

    const chanA2Res = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164, 
        endpoint_token_hash, is_active
      ) VALUES (
        $1, 'meta_waba', 'WABA Alpha Line 2', '+5511999997777',
        $2, true
      ) RETURNING id;
    `, [workspaceAId, validTokenHashA2]);
    channelA2Id = chanA2Res.rows[0].id;

    const chanBRes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164, 
        endpoint_token_hash, credential_id, is_active
      ) VALUES (
        $1, 'waha', 'WAHA Beta Line', '+5511977776666',
        $2, $3, true
      ) RETURNING id;
    `, [workspaceBId, validTokenHashB, credentialBId]);
    channelBId = chanBRes.rows[0].id;

    // Channel with expired previous token
    await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164, 
        endpoint_token_hash, previous_token_hash, previous_token_valid_until, is_active
      ) VALUES (
        $1, 'meta_waba', 'WABA Expired Line', '+5511999995555',
        $2, $3, NOW() - INTERVAL '10 minutes', true
      ) RETURNING id;
    `, [workspaceAId, expiredTokenHash, expiredPreviousHash]);
  });

  afterAll(async () => {
    await ownerPool.end();
    await appPool.end();
  });

  describe("1. Shielded lookup_channel_ingress Function Security & Token Rotation", () => {
    it("should allow sos_ingress_user to execute lookup_channel_ingress and return minimal safe tuple", async () => {
      const client = await ownerPool.connect();
      try {
        await client.query("SET ROLE sos_ingress_user;");

        const res = await client.query(
          "SELECT * FROM public.lookup_channel_ingress($1);",
          [validTokenHashA]
        );

        expect(res.rows.length).toBe(1);
        const row = res.rows[0];
        expect(row.channel_instance_id).toBe(channelAId);
        expect(row.workspace_id).toBe(workspaceAId);
        expect(row.provider).toBe("meta_waba");
        expect(row.is_active).toBe(true);

        // Security Invariant: zero credentials exposed in return tuple
        expect(row).not.toHaveProperty("credential_id");
        expect(row).not.toHaveProperty("encrypted_payload");
      } finally {
        await client.query("RESET ROLE;").catch(() => {});
        client.release();
      }
    });

    it("should resolve previous token within grace period for zero-downtime rotation", async () => {
      const client = await ownerPool.connect();
      try {
        await client.query("SET ROLE sos_ingress_user;");

        const res = await client.query(
          "SELECT * FROM public.lookup_channel_ingress($1);",
          [previousTokenHashA]
        );

        expect(res.rows.length).toBe(1);
        expect(res.rows[0].channel_instance_id).toBe(channelAId);
      } finally {
        await client.query("RESET ROLE;").catch(() => {});
        client.release();
      }
    });

    it("should REJECT lookup when previous token has expired", async () => {
      const client = await ownerPool.connect();
      try {
        await client.query("SET ROLE sos_ingress_user;");

        const res = await client.query(
          "SELECT * FROM public.lookup_channel_ingress($1);",
          [expiredPreviousHash]
        );

        // Expired previous token returns 0 rows
        expect(res.rows.length).toBe(0);
      } finally {
        await client.query("RESET ROLE;").catch(() => {});
        client.release();
      }
    });

    it("should reject malformed token hash with strict hex format validation", async () => {
      const client = await ownerPool.connect();
      try {
        await client.query("SET ROLE sos_ingress_user;");

        // Short length
        await expect(
          client.query("SELECT * FROM public.lookup_channel_ingress('abc');")
        ).rejects.toThrow(/INVALID_ENDPOINT_TOKEN_HASH/);

        // Non-hex characters
        await expect(
          client.query("SELECT * FROM public.lookup_channel_ingress($1);", ["z".repeat(64)])
        ).rejects.toThrow(/INVALID_ENDPOINT_TOKEN_HASH/);
      } finally {
        await client.query("RESET ROLE;").catch(() => {});
        client.release();
      }
    });

    it("should enforce structural consistency CHECK on previous_token columns", async () => {
      // Hash provided without valid_until timestamp
      await expect(
        ownerPool.query(`
          INSERT INTO channel_instances (
            workspace_id, provider, display_name, endpoint_token_hash, previous_token_hash, is_active
          ) VALUES (
            $1, 'meta_waba', 'Inconsistent Line', $2, $3, true
          );
        `, [workspaceAId, "1".repeat(64), "2".repeat(64)])
      ).rejects.toThrow(/check_previous_token_consistency/i);

      // Timestamp provided without previous_token_hash
      await expect(
        ownerPool.query(`
          INSERT INTO channel_instances (
            workspace_id, provider, display_name, endpoint_token_hash, previous_token_valid_until, is_active
          ) VALUES (
            $1, 'meta_waba', 'Inconsistent Line 2', $2, NOW() + INTERVAL '1 hour', true
          );
        `, [workspaceAId, "3".repeat(64)])
      ).rejects.toThrow(/check_previous_token_consistency/i);
    });

    it("should DENY execution of lookup_channel_ingress to sos_app_user and sos_worker_user", async () => {
      const appClient = await appPool.connect();
      try {
        await expect(
          appClient.query("SELECT * FROM public.lookup_channel_ingress($1);", [validTokenHashA])
        ).rejects.toThrow(/permission denied for function lookup_channel_ingress/i);
      } finally {
        appClient.release();
      }

      const workerClient = await ownerPool.connect();
      try {
        await workerClient.query("SET ROLE sos_worker_user;");
        await expect(
          workerClient.query("SELECT * FROM public.lookup_channel_ingress($1);", [validTokenHashA])
        ).rejects.toThrow(/permission denied for function lookup_channel_ingress/i);
      } finally {
        await workerClient.query("RESET ROLE;").catch(() => {});
        workerClient.release();
      }
    });
  });

  describe("2. Composite Tenant & Channel Foreign Key Integrity", () => {
    let contactAId: string;
    let contactBId: string;
    let threadAId: string;
    let threadA2Id: string;

    beforeAll(async () => {
      const contactARes = await ownerPool.query(`
        INSERT INTO contacts (workspace_id, phone_e164, name)
        VALUES ($1, '+5511999990001', 'Lead Alpha')
        RETURNING id;
      `, [workspaceAId]);
      contactAId = contactARes.rows[0].id;

      const contactBRes = await ownerPool.query(`
        INSERT INTO contacts (workspace_id, phone_e164, name)
        VALUES ($1, '+5511999990002', 'Lead Beta')
        RETURNING id;
      `, [workspaceBId]);
      contactBId = contactBRes.rows[0].id;

      const threadRes = await ownerPool.query(`
        INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status)
        VALUES ($1, $2, $3, 'active')
        RETURNING id;
      `, [workspaceAId, channelAId, contactAId]);
      threadAId = threadRes.rows[0].id;

      const threadA2Res = await ownerPool.query(`
        INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status)
        VALUES ($1, $2, $3, 'active')
        RETURNING id;
      `, [workspaceAId, channelA2Id, contactAId]);
      threadA2Id = threadA2Res.rows[0].id;
    });

    it("should REJECT channel_instances combining Workspace Alpha with Credential from Workspace Beta", async () => {
      await expect(
        ownerPool.query(`
          INSERT INTO channel_instances (
            workspace_id, provider, display_name, endpoint_token_hash, credential_id, is_active
          ) VALUES (
            $1, 'waha', 'Cross-Tenant Credential Channel', $2, $3, true
          );
        `, [workspaceAId, "7".repeat(64), credentialBId])
      ).rejects.toThrow(/fk_channel_instances_credential|foreign key constraint/i);
    });

    it("should REJECT commercial_threads combining Workspace Alpha with Channel from Workspace Beta", async () => {
      await expect(
        ownerPool.query(`
          INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status)
          VALUES ($1, $2, $3, 'active');
        `, [workspaceAId, channelBId, contactAId])
      ).rejects.toThrow(/fk_commercial_threads_channel|foreign key constraint/i);
    });

    it("should REJECT commercial_threads combining Workspace Alpha with Contact from Workspace Beta", async () => {
      await expect(
        ownerPool.query(`
          INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status)
          VALUES ($1, $2, $3, 'active');
        `, [workspaceAId, channelAId, contactBId])
      ).rejects.toThrow(/fk_commercial_threads_contact|foreign key constraint/i);
    });

    it("should REJECT messages combining Workspace Alpha with Channel from Workspace Beta", async () => {
      await expect(
        ownerPool.query(`
          INSERT INTO messages (
            workspace_id, channel_instance_id, thread_id, provider, direction,
            sender_e164, recipient_e164, content_type, provider_message_id
          ) VALUES (
            $1, $2, $3, 'meta_waba', 'inbound',
            '+5511999990001', '+5511999998888', 'text', 'msg_cross_tenant_test'
          );
        `, [workspaceAId, channelBId, threadAId])
      ).rejects.toThrow(/fk_messages_channel|foreign key constraint/i);
    });

    it("should REJECT messages combining Channel A2 with Thread from Channel A (intra-tenant cross-channel rejection)", async () => {
      await expect(
        ownerPool.query(`
          INSERT INTO messages (
            workspace_id, channel_instance_id, thread_id, provider, direction,
            sender_e164, recipient_e164, content_type, provider_message_id
          ) VALUES (
            $1, $2, $3, 'meta_waba', 'inbound',
            '+5511999990001', '+5511999997777', 'text', 'msg_intra_tenant_mismatch'
          );
        `, [workspaceAId, channelA2Id, threadAId]) // threadAId belongs to channelAId, not channelA2Id!
      ).rejects.toThrow(/fk_messages_thread_composite|foreign key constraint/i);
    });

    it("should REJECT messages combining Channel A with Thread from Channel A2 (intra-tenant cross-channel rejection)", async () => {
      await expect(
        ownerPool.query(`
          INSERT INTO messages (
            workspace_id, channel_instance_id, thread_id, provider, direction,
            sender_e164, recipient_e164, content_type, provider_message_id
          ) VALUES (
            $1, $2, $3, 'meta_waba', 'inbound',
            '+5511999990001', '+5511999997777', 'text', 'msg_intra_tenant_mismatch_rev'
          );
        `, [workspaceAId, channelAId, threadA2Id]) // threadA2Id belongs to channelA2Id, not channelAId!
      ).rejects.toThrow(/fk_messages_thread_composite|foreign key constraint/i);
    });

    it("should REJECT outbound_commands combining Channel A2 with Thread from Channel A (intra-tenant cross-channel rejection)", async () => {
      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, provider_message_id
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999990001', '+5511999997777', 'text', 'msg_for_outbox_fk_test'
        ) RETURNING id;
      `, [workspaceAId, channelAId, threadAId]);
      const msgId = msgRes.rows[0].id;

      await expect(
        ownerPool.query(`
          INSERT INTO outbound_commands (
            workspace_id, channel_instance_id, thread_id, message_id, recipient_e164, body, idempotency_key
          ) VALUES (
            $1, $2, $3, $4, '+5511999990001', 'Cross-channel thread', 'idempotency_cross_thread'
          );
        `, [workspaceAId, channelA2Id, threadAId, msgId])
      ).rejects.toThrow(/fk_outbound_thread_composite|foreign key constraint/i);
    });

    it("should REJECT outbound_commands without message_id (NOT NULL constraint)", async () => {
      await expect(
        ownerPool.query(`
          INSERT INTO outbound_commands (
            workspace_id, channel_instance_id, recipient_e164, body, idempotency_key
          ) VALUES (
            $1, $2, '+5511999990001', 'Missing message_id', 'idemp_missing_msg_id'
          );
        `, [workspaceAId, channelAId])
      ).rejects.toThrow(/null value in column "message_id" of relation "outbound_commands" violates not-null constraint/i);
    });
  });

  describe("3. Channel-Scoped Message Uniqueness, Delivery FK & ON DELETE SET NULL", () => {
    let threadAId: string;
    let threadA2Id: string;
    let messageA1Id: string;

    beforeAll(async () => {
      const threadRes = await ownerPool.query(`
        SELECT id FROM commercial_threads WHERE workspace_id = $1 AND channel_instance_id = $2 LIMIT 1;
      `, [workspaceAId, channelAId]);
      threadAId = threadRes.rows[0].id;

      const threadA2Res = await ownerPool.query(`
        SELECT id FROM commercial_threads WHERE workspace_id = $1 AND channel_instance_id = $2 LIMIT 1;
      `, [workspaceAId, channelA2Id]);
      threadA2Id = threadA2Res.rows[0].id;

      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, provider_message_id, delivery_status
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'inbound',
          '+5511999990001', '+5511999998888', 'text', 'shared_provider_msg_001', 'sent'
        ) RETURNING id;
      `, [workspaceAId, channelAId, threadAId]);
      messageA1Id = msgRes.rows[0].id;
    });

    it("should ALLOW identical provider_message_id across two DIFFERENT channels in the same workspace", async () => {
      // Channel A2 is also in Workspace Alpha, but is a distinct line with its own thread
      const res = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, provider_message_id, delivery_status
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'inbound',
          '+5511999990001', '+5511999997777', 'text', 'shared_provider_msg_001', 'sent'
        ) RETURNING id;
      `, [workspaceAId, channelA2Id, threadA2Id]);

      expect(res.rows.length).toBe(1);
    });

    it("should REJECT duplicate provider_message_id on the SAME channel", async () => {
      await expect(
        ownerPool.query(`
          INSERT INTO messages (
            workspace_id, channel_instance_id, thread_id, provider, direction,
            sender_e164, recipient_e164, content_type, provider_message_id, delivery_status
          ) VALUES (
            $1, $2, $3, 'meta_waba', 'inbound',
            '+5511999990001', '+5511999998888', 'text', 'shared_provider_msg_001', 'sent'
          );
        `, [workspaceAId, channelAId, threadAId])
      ).rejects.toThrow(/uq_messages_channel_provider_msg|unique constraint/i);
    });

    it("should REJECT delivery event combining Channel A2 with Message from Channel A (intra-tenant cross-channel rejection)", async () => {
      const hash = "9".repeat(64);
      await expect(
        ownerPool.query(`
          INSERT INTO provider_delivery_events (
            workspace_id, channel_instance_id, message_id, external_message_id, external_event_id,
            recipient_e164, provider, status, raw_payload_hash, encrypted_payload, payload_iv, payload_auth_tag, occurred_at
          ) VALUES (
            $1, $2, $3, 'shared_provider_msg_001', 'v1:waba:shared_provider_msg_001:delivered:1726700099',
            '+5511999990001', 'meta_waba', 'delivered', $4, 'enc', 'iv', 'tag', NOW()
          );
        `, [workspaceAId, channelA2Id, messageA1Id, hash]) // messageA1Id belongs to channelAId, not channelA2Id!
      ).rejects.toThrow(/fk_delivery_events_message_composite|foreign key constraint/i);
    });

    it("should set message_id to NULL on provider_delivery_events when referenced message is deleted without clearing workspace_id or channel_instance_id", async () => {
      // 1. Insert a dedicated message to be deleted
      const tempMsgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, provider_message_id, delivery_status
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'inbound',
          '+5511999990001', '+5511999998888', 'text', 'temp_to_delete_msg', 'sent'
        ) RETURNING id;
      `, [workspaceAId, channelAId, threadAId]);
      const tempMsgId = tempMsgRes.rows[0].id;

      // 2. Insert delivery event referencing this message
      const hash = "8".repeat(64);
      const deliveryRes = await ownerPool.query(`
        INSERT INTO provider_delivery_events (
          workspace_id, channel_instance_id, message_id, external_message_id, external_event_id,
          recipient_e164, provider, status, raw_payload_hash, encrypted_payload, payload_iv, payload_auth_tag, occurred_at
        ) VALUES (
          $1, $2, $3, 'temp_to_delete_msg', 'v1:waba:temp_to_delete_msg:delivered:1726700000',
          '+5511999990001', 'meta_waba', 'delivered', $4, 'enc', 'iv', 'tag', NOW()
        ) RETURNING id;
      `, [workspaceAId, channelAId, tempMsgId, hash]);
      const deliveryId = deliveryRes.rows[0].id;

      // 3. Delete the message as migration owner
      await ownerPool.query("DELETE FROM messages WHERE id = $1;", [tempMsgId]);

      // 4. Verify ON DELETE SET NULL (message_id) behavior
      const checkRes = await ownerPool.query(
        "SELECT workspace_id, channel_instance_id, message_id FROM provider_delivery_events WHERE id = $1;",
        [deliveryId]
      );
      const eventRow = checkRes.rows[0];
      expect(eventRow.message_id).toBeNull();
      expect(eventRow.workspace_id).toBe(workspaceAId);
      expect(eventRow.channel_instance_id).toBe(channelAId);
    });
    it("should set thread_id to NULL on outbound_commands when referenced thread is deleted without clearing workspace_id or channel_instance_id", async () => {
      // 1. Create a temporary contact & thread to delete
      const tempContactRes = await ownerPool.query(`
        INSERT INTO contacts (workspace_id, phone_e164, name)
        VALUES ($1, '+5511999999999', 'Ephemeral Contact')
        RETURNING id;
      `, [workspaceAId]);
      const tempContactId = tempContactRes.rows[0].id;

      const tempThreadRes = await ownerPool.query(`
        INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status)
        VALUES ($1, $2, $3, 'active')
        RETURNING id;
      `, [workspaceAId, channelAId, tempContactId]);
      const tempThreadId = tempThreadRes.rows[0].id;

      // Insert message in persistent threadAId so deleting tempThreadId doesn't cascade-delete the message
      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, provider_message_id
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999990001', '+5511999998888', 'text', 'msg_for_temp_thread'
        ) RETURNING id;
      `, [workspaceAId, channelAId, threadAId]);
      const tempMsgId = msgRes.rows[0].id;

      // 2. Insert outbound command referencing the temporary thread and message
      const outboxRes = await ownerPool.query(`
        INSERT INTO outbound_commands (
          workspace_id, channel_instance_id, thread_id, message_id, recipient_e164, body, idempotency_key
        ) VALUES (
          $1, $2, $3, $4, '+5511999998888', 'Ephemeral thread message', 'idempotency_temp_thread'
        ) RETURNING id;
      `, [workspaceAId, channelAId, tempThreadId, tempMsgId]);
      const commandId = outboxRes.rows[0].id;

      // 3. Delete the temporary thread
      await ownerPool.query("DELETE FROM commercial_threads WHERE id = $1;", [tempThreadId]);

      // 4. Verify ON DELETE SET NULL (thread_id) behavior
      const checkRes = await ownerPool.query(
        "SELECT workspace_id, channel_instance_id, thread_id FROM outbound_commands WHERE id = $1;",
        [commandId]
      );
      const cmdRow = checkRes.rows[0];
      expect(cmdRow.thread_id).toBeNull();
      expect(cmdRow.workspace_id).toBe(workspaceAId);
      expect(cmdRow.channel_instance_id).toBe(channelAId);
    });
  });

  describe("4. Durable Queue Contracts (Inbox & Outbox State Constraints)", () => {
    let threadAId: string;

    beforeAll(async () => {
      const threadRes = await ownerPool.query(`
        SELECT id FROM commercial_threads WHERE workspace_id = $1 AND channel_instance_id = $2 LIMIT 1;
      `, [workspaceAId, channelAId]);
      threadAId = threadRes.rows[0].id;
    });

    it("should verify channel_webhook_inbox defaults next_attempt_at and enforces retry_count <= max_retries", async () => {
      const hash = "7".repeat(64);

      // Default next_attempt_at is set to now()
      const insertRes = await ownerPool.query(`
        INSERT INTO channel_webhook_inbox (
          channel_instance_id, workspace_id, provider_event_key, raw_payload_hash,
          encrypted_payload, payload_iv, payload_auth_tag, status, retry_count, max_retries
        ) VALUES (
          $1, $2, 'test_inbox_contract', $3, 'enc', 'iv', 'tag', 'pending', 0, 5
        ) RETURNING id, next_attempt_at;
      `, [channelAId, workspaceAId, hash]);

      expect(insertRes.rows[0].next_attempt_at).toBeDefined();

      // Check constraint: retry_count cannot exceed max_retries
      await expect(
        ownerPool.query(`
          UPDATE channel_webhook_inbox 
          SET retry_count = 6 
          WHERE id = $1;
        `, [insertRes.rows[0].id])
      ).rejects.toThrow(/check_inbox_retry_limit|check constraint/i);
    });

    it("should verify outbound_commands rejects 'delivered' status and accepts 'dead_letter'", async () => {
      const key = `outbox_state_${Date.now()}`;

      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, provider_message_id
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999990001', '+5511999998888', 'text', $4
        ) RETURNING id;
      `, [workspaceAId, channelAId, threadAId, `msg_state_${Date.now()}`]);
      const msgId = msgRes.rows[0].id;

      // Rejects 'delivered' status (outbox only tracks pending -> processing -> sent -> failed / dead_letter)
      await expect(
        ownerPool.query(`
          INSERT INTO outbound_commands (
            workspace_id, channel_instance_id, message_id, recipient_e164, body, idempotency_key, status
          ) VALUES (
            $1, $2, $3, '+5511999998888', 'Testing invalid delivered status', $4, 'delivered'
          );
        `, [workspaceAId, channelAId, msgId, key])
      ).rejects.toThrow(/check constraint|outbound_commands_status_check/i);

      // Accepts 'dead_letter' status
      const deadLetterRes = await ownerPool.query(`
        INSERT INTO outbound_commands (
          workspace_id, channel_instance_id, message_id, recipient_e164, body, idempotency_key, status, retry_count, max_retries
        ) VALUES (
          $1, $2, $3, '+5511999998888', 'Testing dead letter status', $4, 'dead_letter', 3, 3
        ) RETURNING id, status;
      `, [workspaceAId, channelAId, msgId, key]);

      expect(deadLetterRes.rows[0].status).toBe("dead_letter");

      // Check constraint: retry_count cannot exceed max_retries
      await expect(
        ownerPool.query(`
          UPDATE outbound_commands 
          SET retry_count = 4 
          WHERE id = $1;
        `, [deadLetterRes.rows[0].id])
      ).rejects.toThrow(/check_outbound_retry_limit|check constraint/i);
    });

    it("should guarantee exactly 1 successful insert and 9 duplicate conflicts under high concurrency in inbox", async () => {
      const concurrentKey = `concurrent_evt_${Date.now()}`;
      const hash = "8".repeat(64);

      // Launch 10 simultaneous insertion attempts across independent connections
      const attempts = Array.from({ length: 10 }).map(async () => {
        const client = await ownerPool.connect();
        try {
          return await client.query(`
            INSERT INTO channel_webhook_inbox (
              channel_instance_id, workspace_id, provider_event_key, raw_payload_hash,
              encrypted_payload, payload_iv, payload_auth_tag, status
            ) VALUES (
              $1, $2, $3, $4, 'enc', 'iv', 'tag', 'pending'
            ) RETURNING id;
          `, [channelAId, workspaceAId, concurrentKey, hash]);
        } finally {
          client.release();
        }
      });

      const settled = await Promise.allSettled(attempts);
      const fulfilled = settled.filter((s) => s.status === "fulfilled");
      const rejected = settled.filter((s) => s.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(9);

      for (const rej of rejected) {
        expect((rej as PromiseRejectedResult).reason.message).toMatch(
          /uq_inbox_channel_event|unique constraint|duplicate key/i
        );
      }
    });

    it("should guarantee exactly 1 successful insert and 9 duplicate conflicts under high concurrency in outbox", async () => {
      const concurrentKey = `concurrent_outbox_${Date.now()}`;

      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, provider_message_id
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999990001', '+5511999998888', 'text', $4
        ) RETURNING id;
      `, [workspaceAId, channelAId, threadAId, `msg_concurrent_${Date.now()}`]);
      const concMsgId = msgRes.rows[0].id;

      const attempts = Array.from({ length: 10 }).map(async () => {
        const client = await appPool.connect();
        try {
          await client.query("SELECT set_config('app.current_workspace_id', $1, false);", [workspaceAId]);

          return await client.query(`
            INSERT INTO outbound_commands (
              workspace_id, channel_instance_id, message_id, recipient_e164, body, idempotency_key
            ) VALUES (
              $1, $2, $3, '+5511999998888', 'Concurrent attempt', $4
            ) RETURNING id;
          `, [workspaceAId, channelAId, concMsgId, concurrentKey]);
        } finally {
          client.release();
        }
      });

      const settled = await Promise.allSettled(attempts);
      const fulfilled = settled.filter((s) => s.status === "fulfilled");
      const rejected = settled.filter((s) => s.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(9);

      for (const rej of rejected) {
        expect((rej as PromiseRejectedResult).reason.message).toMatch(
          /uq_outbound_workspace_idempotency|unique constraint|duplicate key/i
        );
      }
    });
  });

  describe("5. Effective Minimal Privileges Verification (has_table_privilege & has_column_privilege)", () => {
    it("should verify sos_ingress_user has ZERO select privilege on business tables", async () => {
      const res = await ownerPool.query(`
        SELECT 
          has_table_privilege('sos_ingress_user', 'contacts', 'SELECT') AS contacts_select,
          has_table_privilege('sos_ingress_user', 'commercial_threads', 'SELECT') AS threads_select,
          has_table_privilege('sos_ingress_user', 'messages', 'SELECT') AS messages_select,
          has_table_privilege('sos_ingress_user', 'provider_delivery_events', 'SELECT') AS delivery_select,
          has_table_privilege('sos_ingress_user', 'provider_credentials', 'SELECT') AS credentials_select,
          has_table_privilege('sos_ingress_user', 'channel_webhook_inbox', 'INSERT') AS inbox_insert,
          has_column_privilege('sos_ingress_user', 'channel_webhook_inbox', 'id', 'SELECT') AS inbox_id_select,
          has_column_privilege('sos_ingress_user', 'channel_webhook_inbox', 'encrypted_payload', 'SELECT') AS inbox_payload_select;
      `);

      const p = res.rows[0];
      expect(p.contacts_select).toBe(false);
      expect(p.threads_select).toBe(false);
      expect(p.messages_select).toBe(false);
      expect(p.delivery_select).toBe(false);
      expect(p.credentials_select).toBe(false);

      expect(p.inbox_insert).toBe(true);
      expect(p.inbox_id_select).toBe(true);
      expect(p.inbox_payload_select).toBe(false);
    });

    it("should verify DELETE is completely revoked from sos_app_user across operational tables", async () => {
      const res = await ownerPool.query(`
        SELECT 
          has_table_privilege('sos_app_user', 'channel_instances', 'DELETE') AS channel_del,
          has_table_privilege('sos_app_user', 'contacts', 'DELETE') AS contacts_del,
          has_table_privilege('sos_app_user', 'commercial_threads', 'DELETE') AS threads_del,
          has_table_privilege('sos_app_user', 'messages', 'DELETE') AS messages_del,
          has_table_privilege('sos_app_user', 'provider_delivery_events', 'DELETE') AS delivery_del,
          has_table_privilege('sos_app_user', 'outbound_commands', 'DELETE') AS outbound_del;
      `);

      const p = res.rows[0];
      expect(p.channel_del).toBe(false);
      expect(p.contacts_del).toBe(false);
      expect(p.threads_del).toBe(false);
      expect(p.messages_del).toBe(false);
      expect(p.delivery_del).toBe(false);
      expect(p.outbound_del).toBe(false);
    });

    it("should verify sos_worker_user is strictly append-only on provider_delivery_events and cannot DELETE", async () => {
      const res = await ownerPool.query(`
        SELECT 
          has_table_privilege('sos_worker_user', 'provider_delivery_events', 'INSERT') AS delivery_ins,
          has_table_privilege('sos_worker_user', 'provider_delivery_events', 'UPDATE') AS delivery_upd,
          has_table_privilege('sos_worker_user', 'provider_delivery_events', 'DELETE') AS delivery_del,
          has_table_privilege('sos_worker_user', 'messages', 'DELETE') AS messages_del,
          has_table_privilege('sos_worker_user', 'channel_webhook_inbox', 'DELETE') AS inbox_del;
      `);

      const p = res.rows[0];
      expect(p.delivery_ins).toBe(true);
      expect(p.delivery_upd).toBe(false);
      expect(p.delivery_del).toBe(false);
      expect(p.messages_del).toBe(false);
      expect(p.inbox_del).toBe(false);
    });
  });

  describe("6. Infrastructure Signing Secret Resolver & Secret Redaction", () => {
    it("should THROW immediately when master key is missing (no default fallback key works)", () => {
      const originalEnv = process.env.MCT_CREDENTIALS_MASTER_KEY;
      delete process.env.MCT_CREDENTIALS_MASTER_KEY;

      try {
        expect(() => {
          new DatabaseSigningSecretResolver({ pool: ownerPool });
        }).toThrow(/DATABASE_SIGNING_SECRET_RESOLVER_ERROR: Master key must be explicitly provided/);
      } finally {
        if (originalEnv) {
          process.env.MCT_CREDENTIALS_MASTER_KEY = originalEnv;
        }
      }
    });

    it("should decrypt credentials in memory, execute scoped callback and never leak buffers", async () => {
      const resolver = new DatabaseSigningSecretResolver({
        pool: ownerPool,
        masterKeyHex: testMasterKeyHex,
      });

      let callbackExecuted = false;
      const result = await resolver.useSigningSecret(
        channelAId,
        workspaceAId,
        (secret) => {
          callbackExecuted = true;
          expect(secret).toBe(rawSecretA);
          return "signature_valid";
        }
      );

      expect(callbackExecuted).toBe(true);
      expect(result).toBe("signature_valid");
    });

    it("should return null when channel is not found or inactive", async () => {
      const resolver = new DatabaseSigningSecretResolver({
        pool: ownerPool,
        masterKeyHex: testMasterKeyHex,
      });

      const result = await resolver.useSigningSecret(
        "00000000-0000-0000-0000-000000000000",
        workspaceAId,
        () => "should_not_run"
      );
      expect(result).toBeNull();
    });

    it("should strictly REDACT error messages and never leak keys or secret material", async () => {
      const invalidResolver = new DatabaseSigningSecretResolver({
        pool: ownerPool,
        masterKeyHex: "f".repeat(64), // Incorrect master key triggers auth tag failure
      });

      // Resolving with wrong key returns null fail-closed without leaking exception
      const result = await invalidResolver.useSigningSecret(
        channelAId,
        workspaceAId,
        () => "should_not_run"
      );
      expect(result).toBeNull();

      // Malformed master key throws redacted error without exposing key
      expect(() => {
        new DatabaseSigningSecretResolver({
          pool: ownerPool,
          masterKeyHex: "invalid_short_key",
        });
      }).toThrow(/DATABASE_SIGNING_SECRET_RESOLVER_ERROR: Master key must be explicitly provided/);
    });
  });
});
