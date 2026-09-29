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
  InvalidCursorError,
  decodeCursor,
} from "../index";

describe("Integration Suggestions Repository (F1.1-B Radar Hardening)", () => {
  const { ownerPool, appPool } = createTestDatabasePools();

  let workspaceA: string;
  let workspaceB: string;
  const operatorA = crypto.randomUUID();
  let channelInstanceId: string;
  let threadAId: string;
  let contactAId: string;

  let phoneCounter = 2000;
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
      VALUES ('F1.1-B Radar Test Org', $1)
      RETURNING id;
    `, [`org-radar-f11b-${Date.now()}`]);
    const orgId = orgRes.rows[0].id;

    const wsARes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug, radar_enabled, radar_cooldown_seconds)
      VALUES ($1, 'F1.1-B Radar WS A', $2, true, 86400)
      RETURNING id;
    `, [orgId, `ws-a-f11b-${Date.now()}`]);
    workspaceA = wsARes.rows[0].id;

    const wsBRes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug, radar_enabled, radar_cooldown_seconds)
      VALUES ($1, 'F1.1-B Radar WS B', $2, true, 86400)
      RETURNING id;
    `, [orgId, `ws-b-f11b-${Date.now()}`]);
    workspaceB = wsBRes.rows[0].id;

    // 2. Provision Operator for Workspace A
    await ownerPool.query(`
      INSERT INTO users (id, email, name)
      VALUES ($1, $2, 'Radar Operator A')
      ON CONFLICT (id) DO NOTHING;
    `, [operatorA, `operator-radar-b-${Date.now()}@mct.br`]);

    await ownerPool.query(`
      INSERT INTO workspace_memberships (workspace_id, user_id, role)
      VALUES ($1, $2, 'operator')
      ON CONFLICT DO NOTHING;
    `, [workspaceA, operatorA]);

    // 3. Provision Channel Instance
    const tokenHash = crypto.createHash("sha256").update(`token-radar-b-${Date.now()}`).digest("hex");
    const chanRes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164,
        endpoint_token_hash, is_active
      ) VALUES ($1, 'meta_waba', 'Radar Line B', '+5549999990000', $2, true)
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
      expect(first.suggestion.origin_snapshot.snapshotRevision).toBeDefined();

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

    it("throws SuggestionIdempotencyConflictError (409) for same key with different expiresAt, rule, or evidence", async () => {
      const idempotencyKey = `radar-conflict-${crypto.randomUUID()}`;
      const now = new Date();

      // First creation
      await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey,
          title: "Título Original",
          body: "Corpo Original",
          expiresAt: new Date(now.getTime() + 3600_000).toISOString(),
          ruleVersion: "1.0.0",
          evidence: { reason: "unanswered" },
        });
      }, appPool);

      // Attempt with different expiresAt -> conflict
      await expect(
        withTenantTransaction(workspaceA, async (client) => {
          return createIntegrationSuggestion(client, workspaceA, {
            idempotencyKey,
            title: "Título Original",
            body: "Corpo Original",
            expiresAt: new Date(now.getTime() + 7200_000).toISOString(),
            ruleVersion: "1.0.0",
            evidence: { reason: "unanswered" },
          });
        }, appPool)
      ).rejects.toThrow(SuggestionIdempotencyConflictError);

      // Attempt with different evidence -> conflict
      await expect(
        withTenantTransaction(workspaceA, async (client) => {
          return createIntegrationSuggestion(client, workspaceA, {
            idempotencyKey,
            title: "Título Original",
            body: "Corpo Original",
            expiresAt: new Date(now.getTime() + 3600_000).toISOString(),
            ruleVersion: "1.0.0",
            evidence: { reason: "different_evidence" },
          });
        }, appPool)
      ).rejects.toThrow(SuggestionIdempotencyConflictError);
    });

    it("rejects replay of legacy row with empty fingerprint (fail-closed safe policy)", async () => {
      const legacyKey = `legacy-empty-fp-${crypto.randomUUID()}`;

      // Insert directly a legacy row with empty fingerprint
      await ownerPool.query(`
        INSERT INTO integration_suggestions (
          workspace_id, idempotency_key, payload_fingerprint, source,
          title, body, status
        ) VALUES (
          $1, $2, '', 'n8n',
          'Sugestão Legada Sem Hash', 'Corpo Legado', 'pending'
        );
      `, [workspaceA, legacyKey]);

      // Replay must be rejected with 409 conflict
      await expect(
        withTenantTransaction(workspaceA, async (client) => {
          return createIntegrationSuggestion(client, workspaceA, {
            idempotencyKey: legacyKey,
            title: "Sugestão Legada Sem Hash",
            body: "Corpo Legado",
          });
        }, appPool)
      ).rejects.toThrow(SuggestionIdempotencyConflictError);
    });
  });

  describe("2. Origin State Revalidation & Safe Persistence on Decision", () => {
    it("persists invalidated state with reason and state_version when new message arrived", async () => {
      // 1. Create fresh thread & contact
      const { contactId, threadId } = await createContactAndThread(workspaceA, {
        lastMessageHoursAgo: 3,
      });

      // 2. Create suggestion (server derives origin_snapshot)
      const key = `snap-test-${crypto.randomUUID()}`;
      const { suggestion } = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: key,
          threadId,
          contactId,
          title: "Sugestão com snapshot do servidor",
          body: "Corpo sugestão",
          draftMessage: "Rascunho",
        });
      }, appPool);

      expect(suggestion.origin_snapshot.lastMessageAt).toBeDefined();
      expect(suggestion.origin_snapshot.snapshotRevision).toBeDefined();

      // 3. Customer sends a NEW message after snapshot
      await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, created_at
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'inbound',
          '+5549999990001', '+5549999990000', 'text',
          'Mensagem superveniente do cliente', now()
        );
      `, [workspaceA, channelInstanceId, threadId]);

      await ownerPool.query(`
        UPDATE commercial_threads
        SET last_message_at = now()
        WHERE id = $1;
      `, [threadId]);

      // 4. Operator attempts to decide -> returns { ok: false, code: 'ORIGIN_STALE_NEW_MESSAGE' }
      const decisionRes = await withTenantTransaction(workspaceA, async (client) => {
        return decideSuggestion(client, workspaceA, suggestion.id, {
          status: "accepted",
          decidedByUserId: operatorA,
          expectedStateVersion: 1,
        });
      }, appPool);

      expect(decisionRes.ok).toBe(false);
      if (!decisionRes.ok) {
        expect(decisionRes.code).toBe("ORIGIN_STALE_NEW_MESSAGE");
      }

      // 5. Read directly from DB to verify that 'invalidated' was PERSISTED and committed
      const checkRes = await ownerPool.query(`
        SELECT status, state_version, metadata
        FROM integration_suggestions
        WHERE id = $1;
      `, [suggestion.id]);

      expect(checkRes.rows[0].status).toBe("invalidated");
      expect(checkRes.rows[0].state_version).toBe(2);
      expect(checkRes.rows[0].metadata.invalidation_reason).toContain("Nova mensagem recebida");

      // 6. Verify item does not return in pending queue
      const pendingList = await withTenantTransaction(workspaceA, async (client) => {
        return listIntegrationSuggestions(client, workspaceA, { status: "pending" });
      }, appPool);
      expect(pendingList.items.some((s) => s.id === suggestion.id)).toBe(false);
    });

    it("persists invalidated state when origin thread is closed", async () => {
      const { contactId, threadId } = await createContactAndThread(workspaceA, {
        status: "active",
        lastMessageHoursAgo: 2,
      });

      const key = `closed-test-${crypto.randomUUID()}`;
      const { suggestion } = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: key,
          threadId,
          contactId,
          title: "Sugestão em thread",
          body: "Corpo",
        });
      }, appPool);

      // Thread is closed after suggestion creation
      await ownerPool.query(`UPDATE commercial_threads SET status = 'closed' WHERE id = $1;`, [threadId]);

      const res = await withTenantTransaction(workspaceA, async (client) => {
        return decideSuggestion(client, workspaceA, suggestion.id, {
          status: "accepted",
          decidedByUserId: operatorA,
          expectedStateVersion: 1,
        });
      }, appPool);

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("ORIGIN_THREAD_CLOSED");
      }

      // Re-read row
      const check = await ownerPool.query(`SELECT status, state_version, metadata FROM integration_suggestions WHERE id = $1;`, [suggestion.id]);
      expect(check.rows[0].status).toBe("invalidated");
      expect(check.rows[0].state_version).toBe(2);
      expect(check.rows[0].metadata.invalidation_reason).toContain("encerrada");
    });

    it("persists invalidated state when thread enters handoff (waiting_human)", async () => {
      const { contactId, threadId } = await createContactAndThread(workspaceA, {
        status: "active",
        lastMessageHoursAgo: 2,
      });

      const key = `handoff-test-${crypto.randomUUID()}`;
      const { suggestion } = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: key,
          threadId,
          contactId,
          title: "Sugestão ativa",
          body: "Corpo",
        });
      }, appPool);

      // Thread enters waiting_human
      await ownerPool.query(`UPDATE commercial_threads SET status = 'waiting_human' WHERE id = $1;`, [threadId]);

      const res = await withTenantTransaction(workspaceA, async (client) => {
        return decideSuggestion(client, workspaceA, suggestion.id, {
          status: "accepted",
          decidedByUserId: operatorA,
          expectedStateVersion: 1,
        });
      }, appPool);

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("ORIGIN_THREAD_HANDOFF");
      }

      const check = await ownerPool.query(`SELECT status, state_version, metadata FROM integration_suggestions WHERE id = $1;`, [suggestion.id]);
      expect(check.rows[0].status).toBe("invalidated");
      expect(check.rows[0].state_version).toBe(2);
      expect(check.rows[0].metadata.invalidation_reason).toContain("handoff");
    });

    it("persists invalidated state when contact opts out", async () => {
      const { contactId, threadId } = await createContactAndThread(workspaceA, {
        optOut: false,
        lastMessageHoursAgo: 2,
      });

      const key = `optout-test-${crypto.randomUUID()}`;
      const { suggestion } = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: key,
          threadId,
          contactId,
          title: "Sugestão ativa",
          body: "Corpo",
        });
      }, appPool);

      // Contact opts out
      await ownerPool.query(`UPDATE contacts SET opt_out = true WHERE id = $1;`, [contactId]);

      const res = await withTenantTransaction(workspaceA, async (client) => {
        return decideSuggestion(client, workspaceA, suggestion.id, {
          status: "accepted",
          decidedByUserId: operatorA,
          expectedStateVersion: 1,
        });
      }, appPool);

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("ORIGIN_CONTACT_OPT_OUT");
      }

      const check = await ownerPool.query(`SELECT status, state_version, metadata FROM integration_suggestions WHERE id = $1;`, [suggestion.id]);
      expect(check.rows[0].status).toBe("invalidated");
      expect(check.rows[0].state_version).toBe(2);
      expect(check.rows[0].metadata.invalidation_reason).toContain("opt-out");
    });

    it("persists expired state using database clock when suggestion expired", async () => {
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

      const res = await withTenantTransaction(workspaceA, async (client) => {
        return decideSuggestion(client, workspaceA, suggestion.id, {
          status: "accepted",
          decidedByUserId: operatorA,
          expectedStateVersion: 1,
        });
      }, appPool);

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("SUGGESTION_EXPIRED");
      }

      const check = await ownerPool.query(`SELECT status, state_version, metadata FROM integration_suggestions WHERE id = $1;`, [suggestion.id]);
      expect(check.rows[0].status).toBe("expired");
      expect(check.rows[0].state_version).toBe(2);
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

      const list = await withTenantTransaction(workspaceA, async (client) => {
        return listIntegrationSuggestions(client, workspaceA, { status: "pending" });
      }, appPool);

      expect(list.items.every((s) => !s.expires_at || new Date(s.expires_at) > new Date())).toBe(true);

      const count = await withTenantTransaction(workspaceA, async (client) => {
        return countPendingSuggestions(client, workspaceA);
      }, appPool);
      expect(count).toBeGreaterThanOrEqual(1);

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

      const [res1, res2] = await Promise.all([op1Promise, op2Promise]);
      const successful = [res1, res2].filter((r) => r.ok);
      const rejected = [res1, res2].filter((r) => !r.ok);

      expect(successful.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect(rejected[0]?.code).toMatch(/ALREADY_DECIDED|VERSION_MISMATCH/);
    });
  });

  describe("5. Governed Candidates (Cursor, Cooldown & Module Governance)", () => {
    it("fails with InvalidCursorError when cursor is malformed and does not repeat page 1", () => {
      expect(() => decodeCursor("invalid-base64-not-json")).toThrow(InvalidCursorError);
      expect(() => decodeCursor(Buffer.from(JSON.stringify({ lastMessageAt: "invalid-date", id: "123" })).toString("base64url"))).toThrow(InvalidCursorError);
    });

    it("excludes threads in closed, waiting_human, or contact opt-out from candidates", async () => {
      await createContactAndThread(workspaceA, { status: "waiting_human", lastMessageHoursAgo: 10 });
      await createContactAndThread(workspaceA, { status: "closed", lastMessageHoursAgo: 10 });
      await createContactAndThread(workspaceA, { optOut: true, lastMessageHoursAgo: 10 });

      const candidates = await withTenantTransaction(workspaceA, async (client) => {
        return listIntegrationCandidates(client, workspaceA, { minHoursSinceLastMessage: 1 });
      }, appPool);

      expect(candidates.items.every((c) => c.evidence.threadStatus !== "waiting_human")).toBe(true);
      expect(candidates.items.every((c) => c.evidence.threadStatus !== "closed")).toBe(true);
    });

    it("respects cooldown window after suggestion is accepted or dismissed", async () => {
      // 1. Thread with accepted suggestion
      const { contactId: c1, threadId: t1 } = await createContactAndThread(workspaceA, { lastMessageHoursAgo: 10 });
      const { suggestion: s1 } = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: `cooldown-acc-${crypto.randomUUID()}`,
          threadId: t1,
          contactId: c1,
          title: "Sugestão para aceite",
          body: "Corpo",
        });
      }, appPool);
      await withTenantTransaction(workspaceA, async (client) => {
        return decideSuggestion(client, workspaceA, s1.id, {
          status: "accepted",
          decidedByUserId: operatorA,
          expectedStateVersion: 1,
        });
      }, appPool);

      // 2. Thread with dismissed suggestion
      const { contactId: c2, threadId: t2 } = await createContactAndThread(workspaceA, { lastMessageHoursAgo: 10 });
      const { suggestion: s2 } = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: `cooldown-dism-${crypto.randomUUID()}`,
          threadId: t2,
          contactId: c2,
          title: "Sugestão para dispensa",
          body: "Corpo",
        });
      }, appPool);
      await withTenantTransaction(workspaceA, async (client) => {
        return decideSuggestion(client, workspaceA, s2.id, {
          status: "dismissed",
          decidedByUserId: operatorA,
          expectedStateVersion: 1,
        });
      }, appPool);

      // Query candidates: neither t1 nor t2 should appear
      const candidates = await withTenantTransaction(workspaceA, async (client) => {
        return listIntegrationCandidates(client, workspaceA, { minHoursSinceLastMessage: 1 });
      }, appPool);

      expect(candidates.items.some((c) => c.threadId === t1)).toBe(false);
      expect(candidates.items.some((c) => c.threadId === t2)).toBe(false);
    });

    it("blocks candidates, creation, and decision when module is disabled", async () => {
      // Disable radar in Workspace A
      await ownerPool.query(`UPDATE workspaces SET radar_enabled = false WHERE id = $1;`, [workspaceA]);

      // 1. List candidates -> returns empty
      const cand = await withTenantTransaction(workspaceA, async (client) => {
        return listIntegrationCandidates(client, workspaceA);
      }, appPool);
      expect(cand.items.length).toBe(0);

      // 2. Create suggestion -> throws MODULE_DISABLED
      await expect(
        withTenantTransaction(workspaceA, async (client) => {
          return createIntegrationSuggestion(client, workspaceA, {
            idempotencyKey: `disabled-ws-${crypto.randomUUID()}`,
            title: "Não deve criar",
            body: "Corpo",
          });
        }, appPool)
      ).rejects.toThrowError(/MODULE_DISABLED|desabilitado/);

      // Re-enable radar
      await ownerPool.query(`UPDATE workspaces SET radar_enabled = true WHERE id = $1;`, [workspaceA]);
    });

    it("deterministically tie-breaks messages by ID when created_at is identical", async () => {
      const { threadId } = await createContactAndThread(workspaceA, {
        lastMessageHoursAgo: 10,
        withMessage: false,
      });

      const sameTime = new Date(Date.now() - 3600_000 * 5);
      const prefix = crypto.randomUUID().slice(0, 34);
      const id1 = `${prefix}01`;
      const id2 = `${prefix}02`;

      // Insert two messages with identical created_at
      await ownerPool.query(`
        INSERT INTO messages (id, workspace_id, channel_instance_id, thread_id, provider, direction, sender_e164, recipient_e164, content_type, body, created_at)
        VALUES 
          ($1, $3, $4, $5, 'meta_waba', 'inbound', '+5549999990001', '+5549999990000', 'text', 'Msg 1', $6),
          ($2, $3, $4, $5, 'meta_waba', 'inbound', '+5549999990001', '+5549999990000', 'text', 'Msg 2', $6);
      `, [id1, id2, workspaceA, channelInstanceId, threadId, sameTime]);

      await ownerPool.query(`UPDATE commercial_threads SET last_message_at = $1 WHERE id = $2;`, [sameTime, threadId]);

      // Lateral in candidate query must pick id2 because id2 > id1
      const candidates = await withTenantTransaction(workspaceA, async (client) => {
        return listIntegrationCandidates(client, workspaceA, { minHoursSinceLastMessage: 0 });
      }, appPool);

      const target = candidates.items.find((c) => c.threadId === threadId);
      expect(target).toBeDefined();
      expect(target?.evidence.lastMessageId).toBe(id2);
      expect(target?.evidence.lastMessageBody).toBe("Msg 2");
    });

    it("paginates stably using cursor without skipping or duplicating items", async () => {
      await createContactAndThread(workspaceA, { lastMessageHoursAgo: 15 });
      await createContactAndThread(workspaceA, { lastMessageHoursAgo: 20 });

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

  describe("6. Outbound Invariant & Multi-Tenant Isolation", () => {
    it("guarantees valid acceptance generates ZERO outbound messages or commands", async () => {
      const { contactId, threadId } = await createContactAndThread(workspaceA, { lastMessageHoursAgo: 2 });
      const { suggestion } = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: `zero-outbound-${crypto.randomUUID()}`,
          threadId,
          contactId,
          title: "Aceite limpo",
          body: "Corpo",
          draftMessage: "Rascunho de teste",
        });
      }, appPool);

      // Count outbound records before
      const outBefore = await ownerPool.query(`SELECT COUNT(*)::text as count FROM outbound_commands WHERE workspace_id = $1;`, [workspaceA]);

      // Decide accepted
      const res = await withTenantTransaction(workspaceA, async (client) => {
        return decideSuggestion(client, workspaceA, suggestion.id, {
          status: "accepted",
          decidedByUserId: operatorA,
          expectedStateVersion: 1,
        });
      }, appPool);

      expect(res.ok).toBe(true);

      // Count outbound records after -> MUST NOT INCREASE
      const outAfter = await ownerPool.query(`SELECT COUNT(*)::text as count FROM outbound_commands WHERE workspace_id = $1;`, [workspaceA]);
      expect(outAfter.rows[0].count).toBe(outBefore.rows[0].count);
    });

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
