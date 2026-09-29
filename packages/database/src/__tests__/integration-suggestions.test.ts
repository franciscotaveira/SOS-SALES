import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import {
  createTestDatabasePools,
  withTenantTransaction,
  createIntegrationSuggestion,
  listIntegrationSuggestions,
  countPendingSuggestions,
  decideSuggestion,
  listIntegrationCandidates,
  expireStaleIntegrationSuggestions,
  SuggestionIdempotencyConflictError,
} from "../index";

describe("Integration Suggestions Repository (F1.1 Radar Hardening)", () => {
  const { ownerPool, appPool } = createTestDatabasePools();

  let workspaceA: string;
  let workspaceB: string;
  const operatorA = crypto.randomUUID();
  let channelInstanceId: string;
  let threadAId: string;
  let contactAId: string;

  let phoneCounter = 1000;
  async function createContactAndThread(
    wsId: string,
    options: {
      status?: "active" | "waiting_client" | "waiting_human" | "closed";
      optOut?: boolean;
      lastMessageHoursAgo?: number;
      withMessage?: boolean;
    } = {}
  ): Promise<{ contactId: string; threadId: string; messageId?: string; lastMessageAt: Date }> {
    phoneCounter++;
    const phone = `+554999999${phoneCounter.toString().padStart(4, "0")}`;
    const hoursAgo = options.lastMessageHoursAgo ?? 2;
    const threadStatus = options.status ?? "active";
    const optOut = options.optOut ?? false;

    const contactRes = await ownerPool.query(`
      INSERT INTO contacts (workspace_id, phone_e164, name, opt_out)
      VALUES ($1, $2, $3, $4)
      RETURNING id;
    `, [wsId, phone, `Contato ${phoneCounter}`, optOut]);
    const contactId = contactRes.rows[0].id;

    const threadRes = await ownerPool.query(`
      INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status, last_message_at)
      VALUES ($1, $2, $3, $4, now() - ($5 || ' hours')::interval)
      RETURNING id, last_message_at;
    `, [wsId, channelInstanceId, contactId, threadStatus, hoursAgo]);
    const threadId = threadRes.rows[0].id;
    const lastMessageAt = threadRes.rows[0].last_message_at;

    let messageId: string | undefined;
    if (options.withMessage !== false) {
      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, created_at
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'inbound',
          $4, '+5549999990000', 'text',
          'Mensagem de teste inbound', now() - ($5 || ' hours')::interval
        ) RETURNING id;
      `, [wsId, channelInstanceId, threadId, phone, hoursAgo]);
      messageId = msgRes.rows[0].id;
    }

    return { contactId, threadId, messageId, lastMessageAt };
  }

  beforeAll(async () => {
    // 1. Provision Organization and Workspaces
    const orgRes = await ownerPool.query(`
      INSERT INTO organizations (name, slug)
      VALUES ('F1.1 Radar Test Org', $1)
      RETURNING id;
    `, [`org-radar-f11-${Date.now()}`]);
    const orgId = orgRes.rows[0].id;

    const wsARes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'F1.1 Radar WS A', $2)
      RETURNING id;
    `, [orgId, `ws-a-f11-${Date.now()}`]);
    workspaceA = wsARes.rows[0].id;

    const wsBRes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'F1.1 Radar WS B', $2)
      RETURNING id;
    `, [orgId, `ws-b-f11-${Date.now()}`]);
    workspaceB = wsBRes.rows[0].id;

    // 2. Provision Operator for Workspace A
    await ownerPool.query(`
      INSERT INTO users (id, email, name)
      VALUES ($1, $2, 'Radar Operator A')
      ON CONFLICT (id) DO NOTHING;
    `, [operatorA, `operator-radar-${Date.now()}@mct.br`]);

    await ownerPool.query(`
      INSERT INTO workspace_memberships (workspace_id, user_id, role)
      VALUES ($1, $2, 'operator')
      ON CONFLICT DO NOTHING;
    `, [workspaceA, operatorA]);

    // 3. Provision Channel Instance
    const tokenHash = crypto.createHash("sha256").update(`token-radar-${Date.now()}`).digest("hex");
    const chanRes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164,
        endpoint_token_hash, is_active
      ) VALUES ($1, 'meta_waba', 'Radar Line', '+5549999990000', $2, true)
      RETURNING id;
    `, [workspaceA, tokenHash]);
    channelInstanceId = chanRes.rows[0].id;

    // Baseline contact & thread A
    const base = await createContactAndThread(workspaceA, { lastMessageHoursAgo: 5 });
    threadAId = base.threadId;
    contactAId = base.contactId;
  });

  afterAll(async () => {
    await appPool.end();
    await ownerPool.end();
  });

  describe("1. Semantic Idempotency & Creation", () => {
    it("returns existing suggestion for same key and identical payload (replay)", async () => {
      const idempotencyKey = `radar-idem-${crypto.randomUUID()}`;

      // First creation
      const first = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey,
          source: "n8n",
          threadId: threadAId,
          contactId: contactAId,
          suggestionType: "follow_up",
          title: "Follow-up BPO Financeiro",
          body: "Cliente parou após pedir proposta de BPO.",
          draftMessage: "Olá! Posso te apresentar nosso plano de BPO amanhã?",
          priority: "high",
        });
      }, appPool);

      expect(first.created).toBe(true);
      expect(first.suggestion.id).toBeDefined();
      expect(first.suggestion.title).toBe("Follow-up BPO Financeiro");

      // Replay with identical payload
      const second = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey,
          source: "n8n",
          threadId: threadAId,
          contactId: contactAId,
          suggestionType: "follow_up",
          title: "Follow-up BPO Financeiro",
          body: "Cliente parou após pedir proposta de BPO.",
          draftMessage: "Olá! Posso te apresentar nosso plano de BPO amanhã?",
          priority: "high",
        });
      }, appPool);

      expect(second.created).toBe(false);
      expect(second.suggestion.id).toBe(first.suggestion.id);
    });

    it("throws SuggestionIdempotencyConflictError (409) for same key but different logical payload", async () => {
      const idempotencyKey = `radar-conflict-${crypto.randomUUID()}`;

      // First creation
      await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey,
          title: "Título Original",
          body: "Corpo Original",
        });
      }, appPool);

      // Attempt with different payload -> must throw conflict
      await expect(
        withTenantTransaction(workspaceA, async (client) => {
          return createIntegrationSuggestion(client, workspaceA, {
            idempotencyKey,
            title: "Título Modificado Conflitante",
            body: "Corpo Original",
          });
        }, appPool)
      ).rejects.toThrow(SuggestionIdempotencyConflictError);
    });
  });

  describe("2. Origin State Revalidation on Decision", () => {
    it("invalidates decision if a new message was received after the origin snapshot", async () => {
      // Create fresh unique thread & contact
      const { contactId, threadId, messageId, lastMessageAt } = await createContactAndThread(workspaceA, {
        lastMessageHoursAgo: 2,
      });

      // Create suggestion with snapshot referencing base message
      const key = `snap-test-${crypto.randomUUID()}`;
      const { suggestion } = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: key,
          threadId,
          contactId,
          title: "Sugestão com snapshot",
          body: "Corpo sugestão",
          draftMessage: "Rascunho",
          originSnapshot: {
            threadId,
            lastMessageAt: lastMessageAt.toISOString(),
            lastMessageId: messageId,
            threadStatus: "active",
          },
        });
      }, appPool);

      // Now customer replies with a NEW message AFTER the snapshot!
      await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, created_at
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'inbound',
          '+5549999990001', '+5549999990000', 'text',
          'Mensagem superveniente do cliente mudando de ideia', now()
        );
      `, [workspaceA, channelInstanceId, threadId]);

      // Update thread last_message_at
      await ownerPool.query(`
        UPDATE commercial_threads
        SET last_message_at = now()
        WHERE id = $1;
      `, [threadId]);

      // Attempt to accept suggestion must be rejected with ORIGIN_STALE_NEW_MESSAGE
      await expect(
        withTenantTransaction(workspaceA, async (client) => {
          return decideSuggestion(client, workspaceA, suggestion.id, {
            status: "accepted",
            decidedByUserId: operatorA,
            expectedStateVersion: 1,
          });
        }, appPool)
      ).rejects.toThrow("Uma nova mensagem foi recebida na conversa");

      // Check that suggestion was NOT accepted (transaction rolled back safely)
      const checkRes = await ownerPool.query(`
        SELECT status FROM integration_suggestions WHERE id = $1;
      `, [suggestion.id]);
      expect(checkRes.rows[0].status).not.toBe("accepted");
    });

    it("rejects decision if origin thread is closed", async () => {
      const { contactId, threadId } = await createContactAndThread(workspaceA, {
        status: "closed",
        lastMessageHoursAgo: 1,
      });

      const key = `closed-test-${crypto.randomUUID()}`;
      const { suggestion } = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: key,
          threadId,
          contactId,
          title: "Sugestão em thread encerrada",
          body: "Corpo",
        });
      }, appPool);

      await expect(
        withTenantTransaction(workspaceA, async (client) => {
          return decideSuggestion(client, workspaceA, suggestion.id, {
            status: "accepted",
            decidedByUserId: operatorA,
            expectedStateVersion: 1,
          });
        }, appPool)
      ).rejects.toThrowError(/ORIGIN_THREAD_CLOSED|encerrada/);
    });

    it("rejects decision if thread is under human handoff (waiting_human)", async () => {
      const { contactId, threadId } = await createContactAndThread(workspaceA, {
        status: "waiting_human",
        lastMessageHoursAgo: 1,
      });

      const key = `handoff-test-${crypto.randomUUID()}`;
      const { suggestion } = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: key,
          threadId,
          contactId,
          title: "Sugestão em handoff",
          body: "Corpo",
        });
      }, appPool);

      await expect(
        withTenantTransaction(workspaceA, async (client) => {
          return decideSuggestion(client, workspaceA, suggestion.id, {
            status: "accepted",
            decidedByUserId: operatorA,
            expectedStateVersion: 1,
          });
        }, appPool)
      ).rejects.toThrowError(/ORIGIN_THREAD_HANDOFF|controle humano/);
    });

    it("rejects decision if contact performed opt-out", async () => {
      const { contactId, threadId } = await createContactAndThread(workspaceA, {
        optOut: true,
        lastMessageHoursAgo: 1,
      });

      const key = `optout-test-${crypto.randomUUID()}`;
      const { suggestion } = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: key,
          threadId,
          contactId,
          title: "Sugestão em contato opt-out",
          body: "Corpo",
        });
      }, appPool);

      await expect(
        withTenantTransaction(workspaceA, async (client) => {
          return decideSuggestion(client, workspaceA, suggestion.id, {
            status: "accepted",
            decidedByUserId: operatorA,
            expectedStateVersion: 1,
          });
        }, appPool)
      ).rejects.toThrowError(/ORIGIN_CONTACT_OPT_OUT|opt-out/);
    });

    it("rejects decision if suggestion is expired, even before worker runs", async () => {
      const key = `expired-decide-${crypto.randomUUID()}`;
      const expiredPastTime = new Date(Date.now() - 60_000).toISOString();

      const { suggestion } = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: key,
          title: "Sugestão Vencida",
          body: "Corpo Vencido",
          expiresAt: expiredPastTime,
        });
      }, appPool);

      await expect(
        withTenantTransaction(workspaceA, async (client) => {
          return decideSuggestion(client, workspaceA, suggestion.id, {
            status: "accepted",
            decidedByUserId: operatorA,
            expectedStateVersion: 1,
          });
        }, appPool)
      ).rejects.toThrowError(/SUGGESTION_EXPIRED|expirada/);
    });
  });

  describe("3. Expiration Filtering & Least-Privilege Worker Execution", () => {
    it("excludes expired suggestions from list and count automatically", async () => {
      const expiredPastTime = new Date(Date.now() - 30_000).toISOString();
      const futureTime = new Date(Date.now() + 3600_000).toISOString();

      // Expired pending suggestion
      await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: `expired-queue-${crypto.randomUUID()}`,
          title: "Não deve aparecer",
          body: "Vencida",
          expiresAt: expiredPastTime,
        });
      }, appPool);

      // Active pending suggestion
      await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: `active-queue-${crypto.randomUUID()}`,
          title: "Deve aparecer",
          body: "Ativa",
          expiresAt: futureTime,
        });
      }, appPool);

      // List pending
      const list = await withTenantTransaction(workspaceA, async (client) => {
        return listIntegrationSuggestions(client, workspaceA, { status: "pending" });
      }, appPool);

      // Must not contain any suggestion with expires_at in the past
      expect(list.items.every((s) => !s.expires_at || new Date(s.expires_at) > new Date())).toBe(true);

      // Count must only count non-expired
      const count = await withTenantTransaction(workspaceA, async (client) => {
        return countPendingSuggestions(client, workspaceA);
      }, appPool);
      expect(count).toBeGreaterThanOrEqual(1);

      // Expire worker cleans up
      const expiredCount = await expireStaleIntegrationSuggestions(ownerPool);
      expect(expiredCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("4. Optimistic Concurrency with Two Concurrent Decisions", () => {
    it("guarantees a single decision wins when two operators decide simultaneously", async () => {
      const key = `concur-decide-${crypto.randomUUID()}`;
      const { suggestion } = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: key,
          title: "Decisão Concorrente",
          body: "Corpo",
        });
      }, appPool);

      // Operator 1 accepts
      const op1Promise = withTenantTransaction(workspaceA, async (client) => {
        return decideSuggestion(client, workspaceA, suggestion.id, {
          status: "accepted",
          decidedByUserId: operatorA,
          expectedStateVersion: 1,
        });
      }, appPool);

      // Operator 2 attempts to dismiss with stateVersion: 1
      const op2Promise = withTenantTransaction(workspaceA, async (client) => {
        return decideSuggestion(client, workspaceA, suggestion.id, {
          status: "dismissed",
          decidedByUserId: operatorA,
          expectedStateVersion: 1,
        });
      }, appPool);

      // Exactly one succeeds, the other rejects
      const results = await Promise.allSettled([op1Promise, op2Promise]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
    });
  });

  describe("5. Governed Candidates (Cursor, Exclusions & Deduplication)", () => {
    it("excludes threads in closed, waiting_human, or contact opt-out from candidates", async () => {
      // 1. Thread in handoff
      await createContactAndThread(workspaceA, { status: "waiting_human", lastMessageHoursAgo: 10 });

      // 2. Thread closed
      await createContactAndThread(workspaceA, { status: "closed", lastMessageHoursAgo: 10 });

      // 3. Contact opt-out
      await createContactAndThread(workspaceA, { optOut: true, lastMessageHoursAgo: 10 });

      const candidates = await withTenantTransaction(workspaceA, async (client) => {
        return listIntegrationCandidates(client, workspaceA, { minHoursSinceLastMessage: 1 });
      }, appPool);

      expect(candidates.items.every((c) => c.evidence.threadStatus !== "waiting_human")).toBe(true);
      expect(candidates.items.every((c) => c.evidence.threadStatus !== "closed")).toBe(true);
    });

    it("deduplicates candidates even if contact/thread has multiple open journeys", async () => {
      const { contactId: multiContactId, threadId: multiThreadId } = await createContactAndThread(workspaceA, {
        lastMessageHoursAgo: 8,
      });

      // Insert TWO open journeys for this thread
      await ownerPool.query(`
        INSERT INTO commercial_journeys (workspace_id, contact_id, thread_id, title, stage, status)
        VALUES 
          ($1, $2, $3, 'Demanda A', 'lead', 'open'),
          ($1, $2, $3, 'Demanda B', 'proposal', 'open');
      `, [workspaceA, multiContactId, multiThreadId]);

      const candidates = await withTenantTransaction(workspaceA, async (client) => {
        return listIntegrationCandidates(client, workspaceA, { minHoursSinceLastMessage: 1 });
      }, appPool);

      const matching = candidates.items.filter((c) => c.threadId === multiThreadId);
      // LATERAL join guarantees exactly ONE identity per thread
      expect(matching.length).toBe(1);
      expect(matching[0]?.candidateId).toBe(multiThreadId);
      expect(matching[0]?.snapshotRevision).toBeDefined();
    });

    it("paginates stably using cursor without skipping or duplicating items", async () => {
      // Ensure at least 2 active candidates exist
      await createContactAndThread(workspaceA, { lastMessageHoursAgo: 4 });
      await createContactAndThread(workspaceA, { lastMessageHoursAgo: 6 });

      const page1 = await withTenantTransaction(workspaceA, async (client) => {
        return listIntegrationCandidates(client, workspaceA, { limit: 1 });
      }, appPool);

      expect(page1.items.length).toBe(1);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await withTenantTransaction(workspaceA, async (client) => {
        return listIntegrationCandidates(client, workspaceA, { limit: 1, cursor: page1.nextCursor! });
      }, appPool);

      expect(page2.items.length).toBe(1);
      expect(page2.items[0]?.candidateId).not.toBe(page1.items[0]?.candidateId);
    });
  });

  describe("6. Multi-Tenant Isolation (RLS)", () => {
    it("ensures Workspace A suggestions are completely invisible to Workspace B", async () => {
      const keyA = `rls-wsA-${crypto.randomUUID()}`;
      await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: keyA,
          title: "Sugestão A",
          body: "Corpo A",
        });
      }, appPool);

      const listB = await withTenantTransaction(workspaceB, async (client) => {
        return listIntegrationSuggestions(client, workspaceB);
      }, appPool);

      expect(listB.items.every((s) => s.workspace_id === workspaceB)).toBe(true);
      expect(listB.items.some((s) => s.idempotency_key === keyA)).toBe(false);
    });
  });
});
