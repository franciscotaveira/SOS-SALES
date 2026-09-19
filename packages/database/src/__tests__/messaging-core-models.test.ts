import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDatabasePools } from "../test-support";
import {
  createOrGetContact,
  getOrCreateCommercialThread,
  insertMessage,
  listThreadMessages,
} from "../messaging";

describe("CH-00: Messaging Core Models — Contacts, Commercial Threads & Messages", () => {
  const { appPool, ownerPool } = createTestDatabasePools();

  let workspaceAId: string;
  let workspaceBId: string;
  let channelAId: string;
  let channelBId: string;

  beforeAll(async () => {
    // 1. Setup organizations and workspaces via owner pool
    const orgRes = await ownerPool.query(`
      INSERT INTO organizations (name, slug)
      VALUES ('Org CH-00', 'org-ch00-${Date.now()}')
      RETURNING id;
    `);
    const orgId = orgRes.rows[0].id;

    const wsARes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'Workspace Alpha', 'ws-a-ch00-${Date.now()}')
      RETURNING id;
    `, [orgId]);
    workspaceAId = wsARes.rows[0].id;

    const wsBRes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'Workspace Beta', 'ws-b-ch00-${Date.now()}')
      RETURNING id;
    `, [orgId]);
    workspaceBId = wsBRes.rows[0].id;

    // 2. Setup channel instances for each workspace
    const chanARes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164, endpoint_token_hash, is_active
      ) VALUES (
        $1, 'meta_waba', 'Line Alpha 1', '+5511999990001', $2, true
      ) RETURNING id;
    `, [workspaceAId, "1".repeat(64)]);
    channelAId = chanARes.rows[0].id;

    const chanBRes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164, endpoint_token_hash, is_active
      ) VALUES (
        $1, 'meta_waba', 'Line Beta 1', '+5511999990002', $2, true
      ) RETURNING id;
    `, [workspaceBId, "2".repeat(64)]);
    channelBId = chanBRes.rows[0].id;
  });

  afterAll(async () => {
    await appPool.end();
    await ownerPool.end();
  });

  // ---------------------------------------------------------------------------
  // 1. Contacts Model & Tenant Isolation
  // ---------------------------------------------------------------------------
  describe("1. Contacts Model & Tenant Isolation", () => {
    let contactAId: string;

    it("should fail-closed when app.current_workspace_id is not set", async () => {
      const client = await appPool.connect();
      try {
        const res = await client.query("SELECT * FROM public.contacts");
        expect(res.rows.length).toBe(0);
      } finally {
        client.release();
      }
    });

    it("should insert and retrieve contacts within active tenant scope", async () => {
      const client = await appPool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceAId]);

        const contact = await createOrGetContact(client, {
          workspaceId: workspaceAId,
          phoneE164: "+5511988887777",
          name: "Cliente Alpha Teste",
        });

        expect(contact.id).toBeDefined();
        expect(contact.workspace_id).toBe(workspaceAId);
        expect(contact.phone_e164).toBe("+5511988887777");
        expect(contact.name).toBe("Cliente Alpha Teste");
        contactAId = contact.id;

        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    });

    it("should not allow Workspace Beta to read contacts belonging to Workspace Alpha", async () => {
      const client = await appPool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceBId]);

        const res = await client.query("SELECT * FROM public.contacts WHERE id = $1", [contactAId]);
        expect(res.rows.length).toBe(0);

        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    });

    it("should reject contact insertion with non-E.164 phone format", async () => {
      const client = await appPool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceAId]);

        await expect(
          createOrGetContact(client, {
            workspaceId: workspaceAId,
            phoneE164: "11999998888", // Missing '+'
            name: "Invalid Phone",
          })
        ).rejects.toThrow(/check|violates check constraint/i);

        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });

    it("should allow identical phone numbers across different workspaces but reject within same workspace", async () => {
      // In Workspace B, the same phone number can exist cleanly
      const clientB = await appPool.connect();
      try {
        await clientB.query("BEGIN");
        await clientB.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceBId]);

        const contactB = await createOrGetContact(clientB, {
          workspaceId: workspaceBId,
          phoneE164: "+5511988887777",
          name: "Cliente Beta Mesmo Telefone",
        });

        expect(contactB.workspace_id).toBe(workspaceBId);
        expect(contactB.id).not.toBe(contactAId);

        await clientB.query("COMMIT");
      } catch (e) {
        await clientB.query("ROLLBACK");
        throw e;
      } finally {
        clientB.release();
      }

      // In Workspace A, duplicate insert without ON CONFLICT fails unique constraint
      const clientA = await appPool.connect();
      try {
        await clientA.query("BEGIN");
        await clientA.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceAId]);

        await expect(
          clientA.query(
            "INSERT INTO public.contacts (workspace_id, phone_e164, name) VALUES ($1, $2, $3)",
            [workspaceAId, "+5511988887777", "Duplicado"]
          )
        ).rejects.toThrow(/uq_contacts_workspace_phone|unique constraint/i);

        await clientA.query("ROLLBACK");
      } finally {
        clientA.release();
      }
    });

    it("should REJECT DELETE on contacts under sos_app_user", async () => {
      const client = await appPool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceAId]);

        await expect(
          client.query("DELETE FROM public.contacts WHERE id = $1", [contactAId])
        ).rejects.toThrow(/permission denied for table contacts/i);

        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Commercial Threads Model & Composite FK Integrity
  // ---------------------------------------------------------------------------
  describe("2. Commercial Threads Model & Composite FK Integrity", () => {
    let contactAId: string;
    let contactBId: string;
    let threadAId: string;

    beforeAll(async () => {
      const resA = await ownerPool.query(
        "INSERT INTO public.contacts (workspace_id, phone_e164, name) VALUES ($1, '+5511977770001', 'Contact A') RETURNING id;",
        [workspaceAId]
      );
      contactAId = resA.rows[0].id;

      const resB = await ownerPool.query(
        "INSERT INTO public.contacts (workspace_id, phone_e164, name) VALUES ($1, '+5511977770002', 'Contact B') RETURNING id;",
        [workspaceBId]
      );
      contactBId = resB.rows[0].id;
    });

    it("should REJECT commercial_threads combining Workspace A with Channel from Workspace B", async () => {
      const client = await appPool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceAId]);

        await expect(
          getOrCreateCommercialThread(client, {
            workspaceId: workspaceAId,
            channelInstanceId: channelBId, // From Workspace B!
            contactId: contactAId,
          })
        ).rejects.toThrow(/fk_commercial_threads_channel|foreign key constraint/i);

        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });

    it("should REJECT commercial_threads combining Workspace A with Contact from Workspace B", async () => {
      const client = await appPool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceAId]);

        await expect(
          getOrCreateCommercialThread(client, {
            workspaceId: workspaceAId,
            channelInstanceId: channelAId,
            contactId: contactBId, // From Workspace B!
          })
        ).rejects.toThrow(/fk_commercial_threads_contact|foreign key constraint/i);

        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });

    it("should create and retrieve commercial thread within matching workspace", async () => {
      const client = await appPool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceAId]);

        const thread = await getOrCreateCommercialThread(client, {
          workspaceId: workspaceAId,
          channelInstanceId: channelAId,
          contactId: contactAId,
          status: "active",
        });

        expect(thread.id).toBeDefined();
        expect(thread.workspace_id).toBe(workspaceAId);
        expect(thread.channel_instance_id).toBe(channelAId);
        expect(thread.contact_id).toBe(contactAId);
        expect(thread.status).toBe("active");
        threadAId = thread.id;

        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    });

    it("should not allow Workspace B to see Workspace A commercial threads", async () => {
      const client = await appPool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceBId]);

        const res = await client.query("SELECT * FROM public.commercial_threads WHERE id = $1", [threadAId]);
        expect(res.rows.length).toBe(0);

        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    });

    it("should REJECT DELETE on commercial_threads under sos_app_user", async () => {
      const client = await appPool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceAId]);

        await expect(
          client.query("DELETE FROM public.commercial_threads WHERE id = $1", [threadAId])
        ).rejects.toThrow(/permission denied for table commercial_threads/i);

        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Messages Model & Persistence Integrity
  // ---------------------------------------------------------------------------
  describe("3. Messages Model & Persistence Integrity", () => {
    let contactAId: string;
    let threadAId: string;
    let messageAId: string;

    beforeAll(async () => {
      const cRes = await ownerPool.query(
        "INSERT INTO public.contacts (workspace_id, phone_e164, name) VALUES ($1, '+5511966660001', 'Message Contact A') RETURNING id;",
        [workspaceAId]
      );
      contactAId = cRes.rows[0].id;

      const tRes = await ownerPool.query(
        "INSERT INTO public.commercial_threads (workspace_id, channel_instance_id, contact_id, status) VALUES ($1, $2, $3, 'active') RETURNING id;",
        [workspaceAId, channelAId, contactAId]
      );
      threadAId = tRes.rows[0].id;
    });

    it("should REJECT message linking Workspace A to a thread from Workspace B", async () => {
      const threadBRes = await ownerPool.query(`
        INSERT INTO public.contacts (workspace_id, phone_e164, name) VALUES ($1, '+5511966660002', 'Contact B') RETURNING id;
      `, [workspaceBId]);
      const contactBId = threadBRes.rows[0].id;

      const threadB = await ownerPool.query(`
        INSERT INTO public.commercial_threads (workspace_id, channel_instance_id, contact_id, status)
        VALUES ($1, $2, $3, 'active') RETURNING id;
      `, [workspaceBId, channelBId, contactBId]);
      const threadBId = threadB.rows[0].id;

      const client = await appPool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceAId]);

        await expect(
          insertMessage(client, {
            workspaceId: workspaceAId,
            channelInstanceId: channelAId,
            threadId: threadBId, // Thread belongs to Workspace B!
            provider: "meta_waba",
            direction: "inbound",
            senderE164: "+5511966660001",
            recipientE164: "+5511999990001",
            contentType: "text",
            body: "Cross tenant attempt",
          })
        ).rejects.toThrow(/fk_messages_thread_composite|foreign key constraint/i);

        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });

    it("should insert inbound message and update thread last_message_at", async () => {
      const client = await appPool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceAId]);

        const initialThread = await client.query<{ last_message_at: Date }>(
          "SELECT last_message_at FROM public.commercial_threads WHERE id = $1",
          [threadAId]
        );
        const initialTimestamp = new Date(initialThread.rows[0]!.last_message_at).getTime();

        // Small pause to guarantee timestamp difference
        await new Promise((r) => setTimeout(r, 15));

        const msg = await insertMessage(client, {
          workspaceId: workspaceAId,
          channelInstanceId: channelAId,
          threadId: threadAId,
          provider: "meta_waba",
          direction: "inbound",
          senderE164: "+5511966660001",
          recipientE164: "+5511999990001",
          contentType: "text",
          body: "Olá, tenho interesse no produto!",
          providerMessageId: "wamid.HBgLMTIzNDU2",
          deliveryStatus: "delivered",
          statusRank: 20,
        });

        expect(msg.id).toBeDefined();
        expect(msg.workspace_id).toBe(workspaceAId);
        expect(msg.direction).toBe("inbound");
        expect(msg.body).toBe("Olá, tenho interesse no produto!");
        expect(msg.status_rank).toBe(20);
        messageAId = msg.id;

        const updatedThread = await client.query<{ last_message_at: Date }>(
          "SELECT last_message_at FROM public.commercial_threads WHERE id = $1",
          [threadAId]
        );
        const updatedTimestamp = new Date(updatedThread.rows[0]!.last_message_at).getTime();
        expect(updatedTimestamp).toBeGreaterThanOrEqual(initialTimestamp);

        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    });

    it("should insert outbound message with queued status and list messages for thread", async () => {
      const client = await appPool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceAId]);

        const outMsg = await insertMessage(client, {
          workspaceId: workspaceAId,
          channelInstanceId: channelAId,
          threadId: threadAId,
          provider: "meta_waba",
          direction: "outbound",
          senderE164: "+5511999990001",
          recipientE164: "+5511966660001",
          contentType: "text",
          body: "Olá! Como posso te ajudar hoje?",
          deliveryStatus: "queued",
          statusRank: 0,
        });

        expect(outMsg.direction).toBe("outbound");
        expect(outMsg.delivery_status).toBe("queued");
        expect(outMsg.status_rank).toBe(0);

        const messages = await listThreadMessages(client, {
          workspaceId: workspaceAId,
          threadId: threadAId,
          ascending: true,
        });

        expect(messages.length).toBe(2);
        expect(messages[0]!.direction).toBe("inbound");
        expect(messages[1]!.direction).toBe("outbound");

        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    });

    it("should REJECT duplicate (channel_instance_id, provider_message_id)", async () => {
      const client = await appPool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceAId]);

        await expect(
          insertMessage(client, {
            workspaceId: workspaceAId,
            channelInstanceId: channelAId,
            threadId: threadAId,
            provider: "meta_waba",
            direction: "inbound",
            senderE164: "+5511966660001",
            recipientE164: "+5511999990001",
            contentType: "text",
            body: "Tentativa duplicada",
            providerMessageId: "wamid.HBgLMTIzNDU2", // Já inserido acima!
          })
        ).rejects.toThrow(/uq_messages_channel_provider_msg|unique constraint/i);

        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });

    it("should not allow Workspace B to read messages from Workspace A", async () => {
      const client = await appPool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceBId]);

        const res = await client.query("SELECT * FROM public.messages WHERE id = $1", [messageAId]);
        expect(res.rows.length).toBe(0);

        const listRes = await listThreadMessages(client, {
          workspaceId: workspaceBId,
          threadId: threadAId,
        });
        expect(listRes.length).toBe(0);

        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    });

    it("should REJECT DELETE on messages under sos_app_user", async () => {
      const client = await appPool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceAId]);

        await expect(
          client.query("DELETE FROM public.messages WHERE id = $1", [messageAId])
        ).rejects.toThrow(/permission denied for table messages/i);

        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    });
  });
});
