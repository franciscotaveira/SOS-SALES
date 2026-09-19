import crypto from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDatabasePools } from "../test-support";
import { encryptPayload } from "../infrastructure/crypto-payload";

describe("CH-01: Worker Fail-Closed RLS & Migration 005 Saneamento", () => {
  const { ownerPool, workerPool } = createTestDatabasePools();

  let workspaceAId: string;
  let workspaceBId: string;
  let channelAId: string;
  let channelBId: string;
  let contactAId: string;
  let contactBId: string;
  let threadAId: string;
  let threadBId: string;
  let messageAId: string;
  let messageBId: string;

  const testMasterKeyHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  beforeAll(async () => {
    // 1. Provision organization and two distinct workspaces (Alpha & Beta)
    const orgRes = await ownerPool.query(`
      INSERT INTO organizations (name, slug)
      VALUES ('Worker Security Test Org', $1)
      RETURNING id;
    `, [`org-worker-sec-${Date.now()}`]);
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

    // 2. Provision credentials for both workspaces
    const encA = encryptPayload(JSON.stringify({ secret: "alpha_secret" }), testMasterKeyHex);
    const credARes = await ownerPool.query(`
      INSERT INTO provider_credentials (workspace_id, provider, account_id, encrypted_payload, iv, auth_tag)
      VALUES ($1, 'meta_waba', 'acc_alpha', $2, $3, $4)
      RETURNING id;
    `, [workspaceAId, encA.encryptedBase64, encA.ivBase64, encA.authTagBase64]);
    const credAId = credARes.rows[0].id;

    const encB = encryptPayload(JSON.stringify({ secret: "beta_secret" }), testMasterKeyHex);
    const credBRes = await ownerPool.query(`
      INSERT INTO provider_credentials (workspace_id, provider, account_id, encrypted_payload, iv, auth_tag)
      VALUES ($1, 'waha', 'acc_beta', $2, $3, $4)
      RETURNING id;
    `, [workspaceBId, encB.encryptedBase64, encB.ivBase64, encB.authTagBase64]);
    const credBId = credBRes.rows[0].id;

    // 3. Provision channels for both workspaces
    const chanARes = await ownerPool.query(`
      INSERT INTO channel_instances (workspace_id, provider, display_name, phone_number_e164, endpoint_token_hash, credential_id)
      VALUES ($1, 'meta_waba', 'Alpha Line', '+5511999990001', $2, $3)
      RETURNING id;
    `, [workspaceAId, crypto.createHash("sha256").update(`alpha-${Date.now()}`).digest("hex"), credAId]);
    channelAId = chanARes.rows[0].id;

    const chanBRes = await ownerPool.query(`
      INSERT INTO channel_instances (workspace_id, provider, display_name, phone_number_e164, endpoint_token_hash, credential_id)
      VALUES ($1, 'waha', 'Beta Line', '+5511999990002', $2, $3)
      RETURNING id;
    `, [workspaceBId, crypto.createHash("sha256").update(`beta-${Date.now()}`).digest("hex"), credBId]);
    channelBId = chanBRes.rows[0].id;

    // 4. Provision contacts, threads, and messages in both workspaces
    const contactARes = await ownerPool.query(`
      INSERT INTO contacts (workspace_id, phone_e164, name)
      VALUES ($1, '+5511999991111', 'Contact Alpha')
      RETURNING id;
    `, [workspaceAId]);
    contactAId = contactARes.rows[0].id;

    const contactBRes = await ownerPool.query(`
      INSERT INTO contacts (workspace_id, phone_e164, name)
      VALUES ($1, '+5511999992222', 'Contact Beta')
      RETURNING id;
    `, [workspaceBId]);
    contactBId = contactBRes.rows[0].id;

    const threadARes = await ownerPool.query(`
      INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id)
      VALUES ($1, $2, $3)
      RETURNING id;
    `, [workspaceAId, channelAId, contactAId]);
    threadAId = threadARes.rows[0].id;

    const threadBRes = await ownerPool.query(`
      INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id)
      VALUES ($1, $2, $3)
      RETURNING id;
    `, [workspaceBId, channelBId, contactBId]);
    threadBId = threadBRes.rows[0].id;

    const msgARes = await ownerPool.query(`
      INSERT INTO messages (workspace_id, channel_instance_id, thread_id, provider, direction, sender_e164, recipient_e164, content_type, body)
      VALUES ($1, $2, $3, 'meta_waba', 'inbound', '+5511999991111', '+5511999990001', 'text', 'Alpha message body')
      RETURNING id;
    `, [workspaceAId, channelAId, threadAId]);
    messageAId = msgARes.rows[0].id;

    const msgBRes = await ownerPool.query(`
      INSERT INTO messages (workspace_id, channel_instance_id, thread_id, provider, direction, sender_e164, recipient_e164, content_type, body)
      VALUES ($1, $2, $3, 'waha', 'inbound', '+5511999992222', '+5511999990002', 'text', 'Beta message body')
      RETURNING id;
    `, [workspaceBId, channelBId, threadBId]);
    messageBId = msgBRes.rows[0].id;
  });

  afterAll(async () => {
    await workerPool.end();
    await ownerPool.end();
  });

  describe("1. Fail-Closed Tenant Isolation when app.current_workspace_id IS NULL", () => {
    it("should return ZERO rows for contacts when app.current_workspace_id is not set", async () => {
      const res = await workerPool.query("SELECT * FROM public.contacts;");
      expect(res.rows).toHaveLength(0);
    });

    it("should return ZERO rows for commercial_threads when app.current_workspace_id is not set", async () => {
      const res = await workerPool.query("SELECT * FROM public.commercial_threads;");
      expect(res.rows).toHaveLength(0);
    });

    it("should return ZERO rows for messages when app.current_workspace_id is not set", async () => {
      const res = await workerPool.query("SELECT * FROM public.messages;");
      expect(res.rows).toHaveLength(0);
    });

    it("should return ZERO rows for channel_instances when app.current_workspace_id is not set", async () => {
      const res = await workerPool.query("SELECT * FROM public.channel_instances;");
      expect(res.rows).toHaveLength(0);
    });

    it("should return ZERO rows for provider_credentials when app.current_workspace_id is not set", async () => {
      const res = await workerPool.query("SELECT * FROM public.provider_credentials;");
      expect(res.rows).toHaveLength(0);
    });

    it("should return ZERO rows for provider_delivery_events when app.current_workspace_id is not set", async () => {
      const res = await workerPool.query("SELECT * FROM public.provider_delivery_events;");
      expect(res.rows).toHaveLength(0);
    });

    it("should return ZERO rows for workspaces when app.current_workspace_id is not set", async () => {
      const res = await workerPool.query("SELECT * FROM public.workspaces;");
      expect(res.rows).toHaveLength(0);
    });
  });

  describe("2. Cross-Tenant Isolation under sos_worker_user when app.current_workspace_id is set", () => {
    it("should allow querying Alpha contacts and STRICTLY HIDE Beta contacts when scoped to Alpha", async () => {
      const client = await workerPool.connect();
      try {
        await client.query("BEGIN;");
        await client.query("SELECT set_config('app.current_workspace_id', $1, true);", [workspaceAId]);

        const resA = await client.query("SELECT * FROM public.contacts WHERE id = $1;", [contactAId]);
        expect(resA.rows).toHaveLength(1);
        expect(resA.rows[0].name).toBe("Contact Alpha");

        const resB = await client.query("SELECT * FROM public.contacts WHERE id = $1;", [contactBId]);
        expect(resB.rows).toHaveLength(0);

        await client.query("ROLLBACK;");
      } finally {
        client.release();
      }
    });

    it("should REJECT inserting a contact for Beta while session is set to Alpha (WITH CHECK violation)", async () => {
      const client = await workerPool.connect();
      try {
        await client.query("BEGIN;");
        await client.query("SELECT set_config('app.current_workspace_id', $1, true);", [workspaceAId]);

        await expect(
          client.query(
            "INSERT INTO public.contacts (workspace_id, phone_e164, name) VALUES ($1, '+5511999993333', 'Rogue Contact');",
            [workspaceBId]
          )
        ).rejects.toThrow(/violates row-level security policy/);

        await client.query("ROLLBACK;");
      } finally {
        client.release();
      }
    });

    it("should isolate commercial_threads and messages between Alpha and Beta", async () => {
      const client = await workerPool.connect();
      try {
        await client.query("BEGIN;");
        await client.query("SELECT set_config('app.current_workspace_id', $1, true);", [workspaceAId]);

        const threadRes = await client.query("SELECT * FROM public.commercial_threads;");
        expect(threadRes.rows.every((r) => r.workspace_id === workspaceAId)).toBe(true);

        const msgRes = await client.query("SELECT * FROM public.messages;");
        expect(msgRes.rows.every((r) => r.workspace_id === workspaceAId)).toBe(true);
        expect(msgRes.rows.find((r) => r.id === messageBId)).toBeUndefined();

        await client.query("ROLLBACK;");
      } finally {
        client.release();
      }
    });
  });

  describe("3. Queue Polling Isolation on channel_webhook_inbox & outbound_commands", () => {
    let inboxProcessedId: string;
    let inboxPendingId: string;
    let outboundSentId: string;
    let outboundPendingId: string;

    beforeAll(async () => {
      // Create pending and processed inbox records
      const invPending = await ownerPool.query(`
        INSERT INTO public.channel_webhook_inbox (
          channel_instance_id, workspace_id, provider_event_key, raw_payload_hash,
          encrypted_payload, payload_iv, payload_auth_tag, status
        ) VALUES ($1, $2, 'evt-pending-1', $3, 'enc', 'iv', 'tag', 'pending')
        RETURNING id;
      `, [channelAId, workspaceAId, "0".repeat(64)]);
      inboxPendingId = invPending.rows[0].id;

      const invProc = await ownerPool.query(`
        INSERT INTO public.channel_webhook_inbox (
          channel_instance_id, workspace_id, provider_event_key, raw_payload_hash,
          encrypted_payload, payload_iv, payload_auth_tag, status
        ) VALUES ($1, $2, 'evt-processed-1', $3, 'enc', 'iv', 'tag', 'processed')
        RETURNING id;
      `, [channelAId, workspaceAId, "1".repeat(64)]);
      inboxProcessedId = invProc.rows[0].id;

      // Create pending and sent outbound commands
      const outPending = await ownerPool.query(`
        INSERT INTO public.outbound_commands (
          workspace_id, channel_instance_id, message_id, recipient_e164,
          body, idempotency_key, status
        ) VALUES ($1, $2, $3, '+5511999991111', 'Hello pending', 'idem-pending-1', 'pending')
        RETURNING id;
      `, [workspaceAId, channelAId, messageAId]);
      outboundPendingId = outPending.rows[0].id;

      const outSent = await ownerPool.query(`
        INSERT INTO public.outbound_commands (
          workspace_id, channel_instance_id, message_id, recipient_e164,
          body, idempotency_key, status
        ) VALUES ($1, $2, $3, '+5511999991111', 'Hello sent', 'idem-sent-1', 'sent')
        RETURNING id;
      `, [workspaceAId, channelAId, messageAId]);
      outboundSentId = outSent.rows[0].id;
    });

    it("should allow workerPool (app.current_workspace_id IS NULL) to see pending inbox items but HIDE processed items", async () => {
      const pendingRes = await workerPool.query(
        "SELECT id, status FROM public.channel_webhook_inbox WHERE id = $1;",
        [inboxPendingId]
      );
      expect(pendingRes.rows).toHaveLength(1);
      expect(pendingRes.rows[0].status).toBe("pending");

      const procRes = await workerPool.query(
        "SELECT id, status FROM public.channel_webhook_inbox WHERE id = $1;",
        [inboxProcessedId]
      );
      expect(procRes.rows).toHaveLength(0);
    });

    it("should allow workerPool (app.current_workspace_id IS NULL) to see pending outbound commands but HIDE sent commands", async () => {
      const pendingRes = await workerPool.query(
        "SELECT id, status FROM public.outbound_commands WHERE id = $1;",
        [outboundPendingId]
      );
      expect(pendingRes.rows).toHaveLength(1);
      expect(pendingRes.rows[0].status).toBe("pending");

      const sentRes = await workerPool.query(
        "SELECT id, status FROM public.outbound_commands WHERE id = $1;",
        [outboundSentId]
      );
      expect(sentRes.rows).toHaveLength(0);
    });

    it("should BLOCK marking an inbox item as 'processed' when app.current_workspace_id is NULL", async () => {
      await expect(
        workerPool.query(
          "UPDATE public.channel_webhook_inbox SET status = 'processed' WHERE id = $1;",
          [inboxPendingId]
        )
      ).rejects.toThrow(/violates row-level security policy/);
    });

    it("should BLOCK marking an outbound command as 'sent' when app.current_workspace_id is NULL", async () => {
      await expect(
        workerPool.query(
          "UPDATE public.outbound_commands SET status = 'sent' WHERE id = $1;",
          [outboundPendingId]
        )
      ).rejects.toThrow(/violates row-level security policy/);
    });
  });

  describe("4. Saneamento de Constraints CHECK e Transição Terminal no Limite de Retries", () => {
    it("should allow transitioning channel_webhook_inbox to 'dead_letter' when retry_count = max_retries", async () => {
      const insertRes = await ownerPool.query(`
        INSERT INTO public.channel_webhook_inbox (
          channel_instance_id, workspace_id, provider_event_key, raw_payload_hash,
          encrypted_payload, payload_iv, payload_auth_tag, status, retry_count, max_retries
        ) VALUES ($1, $2, 'evt-dead-letter-test', $3, 'enc', 'iv', 'tag', 'processing', 5, 5)
        RETURNING id;
      `, [channelAId, workspaceAId, "2".repeat(64)]);
      const itemId = insertRes.rows[0].id;

      const updateRes = await ownerPool.query(`
        UPDATE public.channel_webhook_inbox
        SET status = 'dead_letter', error_message = 'Max retries exhausted'
        WHERE id = $1
        RETURNING status, retry_count, max_retries;
      `, [itemId]);

      expect(updateRes.rows[0].status).toBe("dead_letter");
      expect(updateRes.rows[0].retry_count).toBe(5);
    });

    it("should allow recovering expired lease in claimBatch without violating retry constraint when retry_count = max_retries", async () => {
      // Create an expired lease item with retry_count = 5 and max_retries = 5
      const insertRes = await ownerPool.query(`
        INSERT INTO public.channel_webhook_inbox (
          channel_instance_id, workspace_id, provider_event_key, raw_payload_hash,
          encrypted_payload, payload_iv, payload_auth_tag, status, retry_count, max_retries,
          lease_until, lease_token, worker_id
        ) VALUES ($1, $2, 'evt-lease-recovery-test', $3, 'enc', 'iv', 'tag', 'processing', 5, 5,
          clock_timestamp() - INTERVAL '10 seconds', gen_random_uuid(), 'dead-worker')
        RETURNING id;
      `, [channelAId, workspaceAId, "3".repeat(64)]);
      const itemId = insertRes.rows[0].id;

      // When recovered by claimBatch, retry_count remains capped at max_retries without constraint violation
      const claimRes = await ownerPool.query(`
        UPDATE public.channel_webhook_inbox
        SET status = 'processing', worker_id = 'new-worker', lease_token = gen_random_uuid(),
            lease_until = clock_timestamp() + INTERVAL '30 seconds',
            retry_count = LEAST(retry_count + 1, max_retries)
        WHERE id = $1 AND status = 'processing' AND lease_until < clock_timestamp()
        RETURNING retry_count, status;
      `, [itemId]);

      expect(claimRes.rows[0].status).toBe("processing");
      expect(claimRes.rows[0].retry_count).toBe(5);

      // And it cannot manually exceed max_retries
      await expect(
        ownerPool.query(`
          UPDATE public.channel_webhook_inbox
          SET retry_count = 6
          WHERE id = $1;
        `, [itemId])
      ).rejects.toThrow(/check_inbox_retry_limit|check constraint/i);
    });

    it("should allow transitioning outbound_commands to 'reconciliation_required' and 'dead_letter' at max_retries", async () => {
      const insertRes = await ownerPool.query(`
        INSERT INTO public.outbound_commands (
          workspace_id, channel_instance_id, message_id, recipient_e164,
          body, idempotency_key, status, retry_count, max_retries
        ) VALUES ($1, $2, $3, '+5511999991111', 'Crash test', 'idem-crash-1', 'processing', 3, 3)
        RETURNING id;
      `, [workspaceAId, channelAId, messageAId]);
      const cmdId = insertRes.rows[0].id;

      const reconRes = await ownerPool.query(`
        UPDATE public.outbound_commands
        SET status = 'reconciliation_required', error_message = 'Lease expired during external send'
        WHERE id = $1
        RETURNING status, retry_count;
      `, [cmdId]);
      expect(reconRes.rows[0].status).toBe("reconciliation_required");
      expect(reconRes.rows[0].retry_count).toBe(3);

      const dlqRes = await ownerPool.query(`
        UPDATE public.outbound_commands
        SET status = 'dead_letter'
        WHERE id = $1
        RETURNING status;
      `, [cmdId]);
      expect(dlqRes.rows[0].status).toBe("dead_letter");
    });
  });

  describe("5. Least Privilege and Revocation Audits for sos_worker_user", () => {
    it("should confirm sos_worker_user CANNOT execute DELETE on ANY table", async () => {
      const res = await ownerPool.query(`
        SELECT 
          has_table_privilege('sos_worker_user', 'public.contacts', 'DELETE') AS contacts_del,
          has_table_privilege('sos_worker_user', 'public.commercial_threads', 'DELETE') AS threads_del,
          has_table_privilege('sos_worker_user', 'public.messages', 'DELETE') AS messages_del,
          has_table_privilege('sos_worker_user', 'public.channel_instances', 'DELETE') AS channels_del,
          has_table_privilege('sos_worker_user', 'public.channel_webhook_inbox', 'DELETE') AS inbox_del,
          has_table_privilege('sos_worker_user', 'public.outbound_commands', 'DELETE') AS outbound_del,
          has_table_privilege('sos_worker_user', 'public.provider_delivery_events', 'DELETE') AS delivery_del;
      `);
      const p = res.rows[0];
      expect(p.contacts_del).toBe(false);
      expect(p.threads_del).toBe(false);
      expect(p.messages_del).toBe(false);
      expect(p.channels_del).toBe(false);
      expect(p.inbox_del).toBe(false);
      expect(p.outbound_del).toBe(false);
      expect(p.delivery_del).toBe(false);
    });

    it("should confirm sos_worker_user cannot execute lookup_channel_ingress", async () => {
      await expect(
        workerPool.query("SELECT * FROM public.lookup_channel_ingress($1);", ["a".repeat(64)])
      ).rejects.toThrow(/permission denied/);
    });
  });
});
