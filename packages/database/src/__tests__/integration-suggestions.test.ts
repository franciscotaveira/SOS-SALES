import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import {
  createTestDatabasePools,
  withTenantTransaction,
  createIntegrationSuggestion,
  listIntegrationSuggestions,
  decideSuggestion,
  listIntegrationCandidates,
  SuggestionIdempotencyConflictError,
  SuggestionDecisionRejectionError,
  InvalidCursorError,
  decodeCursor,
} from "../index";

describe("Integration Suggestions Repository (F1.1-C Radar Hardening & Final Governance)", () => {
  const { ownerPool, appPool } = createTestDatabasePools();

  let workspaceA: string;
  let workspaceB: string;
  const operatorA = crypto.randomUUID();
  let channelInstanceId: string;

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

  async function getCandidateRevision(wsId: string, threadId: string): Promise<string> {
    const candidates = await withTenantTransaction(wsId, async (client) => {
      return listIntegrationCandidates(client, wsId, { minHoursSinceLastMessage: 0, limit: 100 });
    }, appPool);
    const cand = candidates.items.find((c) => c.threadId === threadId);
    if (!cand) {
      throw new Error(`Candidate not found for thread ${threadId}`);
    }
    return cand.candidateRevision;
  }

  beforeAll(async () => {
    // 1. Provision Organization and Workspaces (explicitly enable radar for tests)
    const orgRes = await ownerPool.query(`
      INSERT INTO organizations (name, slug)
      VALUES ('F1.1-C Radar Test Org', $1)
      RETURNING id;
    `, [`org-radar-f11c-${Date.now()}`]);
    const orgId = orgRes.rows[0].id;

    const wsARes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug, radar_enabled, radar_cooldown_seconds, radar_rule_version)
      VALUES ($1, 'F1.1-C Radar WS A', $2, true, 86400, '1.0.0')
      RETURNING id;
    `, [orgId, `ws-a-f11c-${Date.now()}`]);
    workspaceA = wsARes.rows[0].id;

    const wsBRes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug, radar_enabled, radar_cooldown_seconds, radar_rule_version)
      VALUES ($1, 'F1.1-C Radar WS B', $2, true, 86400, '1.0.0')
      RETURNING id;
    `, [orgId, `ws-b-f11c-${Date.now()}`]);
    workspaceB = wsBRes.rows[0].id;

    // 2. Provision Operator for Workspace A
    await ownerPool.query(`
      INSERT INTO users (id, email, name)
      VALUES ($1, $2, 'Radar Operator A')
      ON CONFLICT (id) DO NOTHING;
    `, [operatorA, `operator-radar-c-${Date.now()}@mct.br`]);

    await ownerPool.query(`
      INSERT INTO workspace_memberships (workspace_id, user_id, role)
      VALUES ($1, $2, 'operator')
      ON CONFLICT DO NOTHING;
    `, [workspaceA, operatorA]);

    // 3. Provision Channel Instance
    const tokenHash = crypto.createHash("sha256").update(`token-radar-c-${Date.now()}`).digest("hex");
    const chanRes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164,
        endpoint_token_hash, is_active
      ) VALUES ($1, 'meta_waba', 'Radar Line C', '+5549999990000', $2, true)
      RETURNING id;
    `, [workspaceA, tokenHash]);
    channelInstanceId = chanRes.rows[0].id;
  });

  afterAll(async () => {
    await appPool.end();
    await ownerPool.end();
  });

  describe("1. Candidate-Suggestion Link & Server-Owned Snapshot", () => {
    it("reads candidate, detects new message arrival, rejects creation with CANDIDATE_STALE and inserts ZERO rows", async () => {
      const { contactId, threadId } = await createContactAndThread(workspaceA, { lastMessageHoursAgo: 3 });

      // Step 1: Read candidate and get candidateRevision
      const staleRevision = await getCandidateRevision(workspaceA, threadId);
      expect(staleRevision).toBeDefined();

      // Step 2: New message arrives from customer before n8n POSTs
      await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, created_at
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'inbound',
          '+5549999990001', '+5549999990000', 'text',
          'Intervenção rápida do cliente', now()
        );
      `, [workspaceA, channelInstanceId, threadId]);

      await ownerPool.query(`UPDATE commercial_threads SET last_message_at = now() WHERE id = $1;`, [threadId]);

      // Step 3: Client attempts to POST suggestion using the stale revision
      const idempotencyKey = `candidate-stale-${crypto.randomUUID()}`;
      let capturedError: any = null;

      try {
        await withTenantTransaction(workspaceA, async (client) => {
          return createIntegrationSuggestion(client, workspaceA, {
            idempotencyKey,
            threadId,
            contactId,
            candidateRevision: staleRevision,
            title: "Follow-up",
            body: "Corpo",
          });
        }, appPool);
      } catch (err: any) {
        capturedError = err;
      }

      expect(capturedError).toBeInstanceOf(SuggestionDecisionRejectionError);
      expect(capturedError.code).toBe("CANDIDATE_STALE");

      // Step 4: Verify that ZERO rows were inserted into the database
      const countRes = await ownerPool.query(
        `SELECT COUNT(*)::text as count FROM integration_suggestions WHERE workspace_id = $1 AND thread_id = $2;`,
        [workspaceA, threadId]
      );
      expect(countRes.rows[0].count).toBe("0");
    });

    it("creates suggestion when candidateRevision matches current server facts", async () => {
      const { contactId, threadId } = await createContactAndThread(workspaceA, { lastMessageHoursAgo: 4 });
      const currentRev = await getCandidateRevision(workspaceA, threadId);

      const idempotencyKey = `candidate-valid-${crypto.randomUUID()}`;
      const { suggestion, created } = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey,
          threadId,
          contactId,
          candidateRevision: currentRev,
          title: "Sugestão Válida com Link",
          body: "Corpo válido",
          draftMessage: "Rascunho",
        });
      }, appPool);

      expect(created).toBe(true);
      expect(suggestion.module_key).toBe("radar_m01");
      expect(suggestion.rule_version).toBe("1.0.0");
      expect(suggestion.origin_snapshot.candidateRevision).toBe(currentRev);
      expect(suggestion.origin_snapshot.snapshotRevision).toBe(currentRev);
    });
  });

  describe("2. Semantic Idempotency & Canonical Serialization", () => {
    it("replays idempotently when evidence has keys in different order (canonical recursive stringify)", async () => {
      const { contactId, threadId } = await createContactAndThread(workspaceA, { lastMessageHoursAgo: 3 });
      const currentRev = await getCandidateRevision(workspaceA, threadId);
      const idempotencyKey = `canonical-idem-${crypto.randomUUID()}`;

      // Creation with evidence keys in order: hoursWithoutResponse, lastMessageSnippet
      const first = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey,
          threadId,
          contactId,
          candidateRevision: currentRev,
          title: "Follow-up BPO Financeiro",
          body: "Cliente parou após pedir proposta de BPO.",
          evidence: {
            hoursWithoutResponse: 24,
            lastMessageSnippet: "Olá proposta",
          },
        });
      }, appPool);

      expect(first.created).toBe(true);

      // Replay with reversed evidence keys: lastMessageSnippet, hoursWithoutResponse
      const second = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey,
          threadId,
          contactId,
          candidateRevision: currentRev,
          title: "Follow-up BPO Financeiro",
          body: "Cliente parou após pedir proposta de BPO.",
          evidence: {
            lastMessageSnippet: "Olá proposta",
            hoursWithoutResponse: 24,
          },
        });
      }, appPool);

      expect(second.created).toBe(false);
      expect(second.suggestion.id).toBe(first.suggestion.id);
      expect(second.suggestion.payload_fingerprint).toBe(first.suggestion.payload_fingerprint);
    });

    it("throws SuggestionIdempotencyConflictError (409) for same key with different logical payload", async () => {
      const { contactId, threadId } = await createContactAndThread(workspaceA, { lastMessageHoursAgo: 3 });
      const currentRev = await getCandidateRevision(workspaceA, threadId);
      const idempotencyKey = `conflict-key-${crypto.randomUUID()}`;

      // First creation
      await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey,
          threadId,
          contactId,
          candidateRevision: currentRev,
          title: "Título Original",
          body: "Corpo Original",
        });
      }, appPool);

      // Conflict: different title
      await expect(
        withTenantTransaction(workspaceA, async (client) => {
          return createIntegrationSuggestion(client, workspaceA, {
            idempotencyKey,
            threadId,
            contactId,
            candidateRevision: currentRev,
            title: "Título Alterado",
            body: "Corpo Original",
          });
        }, appPool)
      ).rejects.toThrow(SuggestionIdempotencyConflictError);
    });

    it("rejects replay of legacy row with empty fingerprint (fail-closed safe policy)", async () => {
      const legacyKey = `legacy-empty-fp-${crypto.randomUUID()}`;

      await ownerPool.query(`
        INSERT INTO integration_suggestions (
          workspace_id, idempotency_key, payload_fingerprint, source,
          title, body, status
        ) VALUES (
          $1, $2, '', 'n8n',
          'Sugestão Legada Sem Hash', 'Corpo Legado', 'pending'
        );
      `, [workspaceA, legacyKey]);

      const { contactId, threadId } = await createContactAndThread(workspaceA, { lastMessageHoursAgo: 3 });
      const currentRev = await getCandidateRevision(workspaceA, threadId);

      await expect(
        withTenantTransaction(workspaceA, async (client) => {
          return createIntegrationSuggestion(client, workspaceA, {
            idempotencyKey: legacyKey,
            threadId,
            contactId,
            candidateRevision: currentRev,
            title: "Sugestão Legada Sem Hash",
            body: "Corpo Legado",
          });
        }, appPool)
      ).rejects.toThrow(SuggestionIdempotencyConflictError);
    });
  });

  describe("3. Governance Revalidation on Decision (Kill-Switch, Workspace Inactive & Rule Version)", () => {
    it("persists invalidated state with WORKSPACE_INACTIVE when workspace becomes inactive", async () => {
      const { contactId, threadId } = await createContactAndThread(workspaceA, { lastMessageHoursAgo: 2 });
      const currentRev = await getCandidateRevision(workspaceA, threadId);

      const { suggestion } = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: `ws-inactive-${crypto.randomUUID()}`,
          threadId,
          contactId,
          candidateRevision: currentRev,
          title: "Sugestão WS Inativo",
          body: "Corpo",
        });
      }, appPool);

      // Deactivate workspace
      await ownerPool.query(`UPDATE workspaces SET is_active = false WHERE id = $1;`, [workspaceA]);

      const res = await withTenantTransaction(workspaceA, async (client) => {
        return decideSuggestion(client, workspaceA, suggestion.id, {
          status: "accepted",
          decidedByUserId: operatorA,
          expectedStateVersion: 1,
        });
      }, appPool);

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("WORKSPACE_INACTIVE");
      }

      // Verify persisted state in DB
      const check = await ownerPool.query(`SELECT status, state_version, metadata FROM integration_suggestions WHERE id = $1;`, [suggestion.id]);
      expect(check.rows[0].status).toBe("invalidated");
      expect(check.rows[0].state_version).toBe(2);
      expect(check.rows[0].metadata.rejection_code).toBe("WORKSPACE_INACTIVE");
      expect(check.rows[0].metadata.rejection_reason).toContain("inativo");

      // Reactivate workspace
      await ownerPool.query(`UPDATE workspaces SET is_active = true WHERE id = $1;`, [workspaceA]);
    });

    it("persists invalidated state with MODULE_DISABLED when radar is turned off", async () => {
      const { contactId, threadId } = await createContactAndThread(workspaceA, { lastMessageHoursAgo: 2 });
      const currentRev = await getCandidateRevision(workspaceA, threadId);

      const { suggestion } = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: `module-off-${crypto.randomUUID()}`,
          threadId,
          contactId,
          candidateRevision: currentRev,
          title: "Sugestão Módulo Desligado",
          body: "Corpo",
        });
      }, appPool);

      // Disable radar in workspace
      await ownerPool.query(`UPDATE workspaces SET radar_enabled = false WHERE id = $1;`, [workspaceA]);

      const res = await withTenantTransaction(workspaceA, async (client) => {
        return decideSuggestion(client, workspaceA, suggestion.id, {
          status: "accepted",
          decidedByUserId: operatorA,
          expectedStateVersion: 1,
        });
      }, appPool);

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("MODULE_DISABLED");
      }

      // Verify row is invalidated and cannot be revived even if re-enabled later
      const check = await ownerPool.query(`SELECT status, state_version, metadata FROM integration_suggestions WHERE id = $1;`, [suggestion.id]);
      expect(check.rows[0].status).toBe("invalidated");
      expect(check.rows[0].state_version).toBe(2);
      expect(check.rows[0].metadata.rejection_code).toBe("MODULE_DISABLED");

      // Re-enable radar
      await ownerPool.query(`UPDATE workspaces SET radar_enabled = true WHERE id = $1;`, [workspaceA]);

      // Attempting to decide again must return ALREADY_DECIDED (never returns to pending)
      const resAfter = await withTenantTransaction(workspaceA, async (client) => {
        return decideSuggestion(client, workspaceA, suggestion.id, {
          status: "accepted",
          decidedByUserId: operatorA,
          expectedStateVersion: 2,
        });
      }, appPool);
      expect(resAfter.ok).toBe(false);
      if (!resAfter.ok) {
        expect(resAfter.code).toBe("ALREADY_DECIDED");
      }
    });

    it("persists invalidated state with RULE_VERSION_STALE when workspace rule version is bumped", async () => {
      const { contactId, threadId } = await createContactAndThread(workspaceA, { lastMessageHoursAgo: 2 });
      const currentRev = await getCandidateRevision(workspaceA, threadId);

      const { suggestion } = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: `rule-stale-${crypto.randomUUID()}`,
          threadId,
          contactId,
          candidateRevision: currentRev,
          title: "Sugestão Regra Antiga",
          body: "Corpo",
        });
      }, appPool);

      // Bump workspace rule version
      await ownerPool.query(`UPDATE workspaces SET radar_rule_version = '2.0.0' WHERE id = $1;`, [workspaceA]);

      const res = await withTenantTransaction(workspaceA, async (client) => {
        return decideSuggestion(client, workspaceA, suggestion.id, {
          status: "accepted",
          decidedByUserId: operatorA,
          expectedStateVersion: 1,
        });
      }, appPool);

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("RULE_VERSION_STALE");
      }

      const check = await ownerPool.query(`SELECT status, state_version, metadata FROM integration_suggestions WHERE id = $1;`, [suggestion.id]);
      expect(check.rows[0].status).toBe("invalidated");
      expect(check.rows[0].state_version).toBe(2);
      expect(check.rows[0].metadata.rejection_code).toBe("RULE_VERSION_STALE");

      // Restore rule version
      await ownerPool.query(`UPDATE workspaces SET radar_rule_version = '1.0.0' WHERE id = $1;`, [workspaceA]);
    });
  });

  describe("4. Origin State Revalidation & Safe Persistence on Decision", () => {
    it("persists invalidated state with ORIGIN_STALE_NEW_MESSAGE when customer sends message after suggestion", async () => {
      const { contactId, threadId } = await createContactAndThread(workspaceA, { lastMessageHoursAgo: 3 });
      const currentRev = await getCandidateRevision(workspaceA, threadId);

      const { suggestion } = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: `stale-msg-${crypto.randomUUID()}`,
          threadId,
          contactId,
          candidateRevision: currentRev,
          title: "Sugestão Ativa",
          body: "Corpo",
        });
      }, appPool);

      // Customer sends message
      await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, created_at
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'inbound',
          '+5549999990001', '+5549999990000', 'text',
          'Mensagem superveniente', now()
        );
      `, [workspaceA, channelInstanceId, threadId]);
      await ownerPool.query(`UPDATE commercial_threads SET last_message_at = now() WHERE id = $1;`, [threadId]);

      const res = await withTenantTransaction(workspaceA, async (client) => {
        return decideSuggestion(client, workspaceA, suggestion.id, {
          status: "accepted",
          decidedByUserId: operatorA,
          expectedStateVersion: 1,
        });
      }, appPool);

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("ORIGIN_STALE_NEW_MESSAGE");
      }

      const check = await ownerPool.query(`SELECT status, state_version, metadata FROM integration_suggestions WHERE id = $1;`, [suggestion.id]);
      expect(check.rows[0].status).toBe("invalidated");
      expect(check.rows[0].state_version).toBe(2);
      expect(check.rows[0].metadata.rejection_code).toBe("ORIGIN_STALE_NEW_MESSAGE");
      expect(check.rows[0].metadata.rejection_reason).toContain("nova mensagem");
    });

    it("persists invalidated state when origin thread is closed", async () => {
      const { contactId, threadId } = await createContactAndThread(workspaceA, { lastMessageHoursAgo: 2 });
      const currentRev = await getCandidateRevision(workspaceA, threadId);

      const { suggestion } = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: `closed-th-${crypto.randomUUID()}`,
          threadId,
          contactId,
          candidateRevision: currentRev,
          title: "Sugestão Thread",
          body: "Corpo",
        });
      }, appPool);

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

      const check = await ownerPool.query(`SELECT status, state_version, metadata FROM integration_suggestions WHERE id = $1;`, [suggestion.id]);
      expect(check.rows[0].status).toBe("invalidated");
      expect(check.rows[0].metadata.rejection_code).toBe("ORIGIN_THREAD_CLOSED");
    });

    it("persists invalidated state when thread enters handoff (waiting_human)", async () => {
      const { contactId, threadId } = await createContactAndThread(workspaceA, { lastMessageHoursAgo: 2 });
      const currentRev = await getCandidateRevision(workspaceA, threadId);

      const { suggestion } = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: `handoff-th-${crypto.randomUUID()}`,
          threadId,
          contactId,
          candidateRevision: currentRev,
          title: "Sugestão Ativa",
          body: "Corpo",
        });
      }, appPool);

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
      expect(check.rows[0].metadata.rejection_code).toBe("ORIGIN_THREAD_HANDOFF");
    });

    it("persists invalidated state when contact opts out", async () => {
      const { contactId, threadId } = await createContactAndThread(workspaceA, { lastMessageHoursAgo: 2 });
      const currentRev = await getCandidateRevision(workspaceA, threadId);

      const { suggestion } = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: `optout-th-${crypto.randomUUID()}`,
          threadId,
          contactId,
          candidateRevision: currentRev,
          title: "Sugestão Ativa",
          body: "Corpo",
        });
      }, appPool);

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
      expect(check.rows[0].metadata.rejection_code).toBe("ORIGIN_CONTACT_OPT_OUT");
    });

    it("persists expired state using database clock when suggestion expired", async () => {
      const { contactId, threadId } = await createContactAndThread(workspaceA, { lastMessageHoursAgo: 2 });
      const currentRev = await getCandidateRevision(workspaceA, threadId);
      const expiredPastTime = new Date(Date.now() - 60_000).toISOString();

      const { suggestion } = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: `expired-th-${crypto.randomUUID()}`,
          threadId,
          contactId,
          candidateRevision: currentRev,
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
      expect(check.rows[0].metadata.rejection_code).toBe("SUGGESTION_EXPIRED");
    });
  });

  describe("5. Defaults, Constraints & Bounded Cooldown", () => {
    it("ensures newly created workspaces have radar_enabled = false by default", async () => {
      const newWsRes = await ownerPool.query(`
        INSERT INTO workspaces (organization_id, name, slug)
        VALUES ((SELECT id FROM organizations LIMIT 1), 'Default Disabled WS', $1)
        RETURNING radar_enabled;
      `, [`def-ws-${Date.now()}`]);

      expect(newWsRes.rows[0].radar_enabled).toBe(false);
    });

    it("respects cooldown = 0 as zero seconds without fallback to 86400", async () => {
      // Set cooldown to 0 on Workspace A
      await ownerPool.query(`UPDATE workspaces SET radar_cooldown_seconds = 0 WHERE id = $1;`, [workspaceA]);

      const { contactId, threadId } = await createContactAndThread(workspaceA, { lastMessageHoursAgo: 2 });
      const currentRev = await getCandidateRevision(workspaceA, threadId);

      // Create suggestion
      const { suggestion } = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: `cooldown-zero-${crypto.randomUUID()}`,
          threadId,
          contactId,
          candidateRevision: currentRev,
          title: "Sugestão Cooldown Zero",
          body: "Corpo",
        });
      }, appPool);

      // Dismiss suggestion
      await withTenantTransaction(workspaceA, async (client) => {
        return decideSuggestion(client, workspaceA, suggestion.id, {
          status: "dismissed",
          decidedByUserId: operatorA,
          expectedStateVersion: 1,
        });
      }, appPool);

      // With cooldown = 0, thread MUST immediately remain eligible in candidates list
      const candidates = await withTenantTransaction(workspaceA, async (client) => {
        return listIntegrationCandidates(client, workspaceA, { minHoursSinceLastMessage: 0 });
      }, appPool);

      const found = candidates.items.some((c) => c.threadId === threadId);
      expect(found).toBe(true);

      // Restore cooldown to 86400
      await ownerPool.query(`UPDATE workspaces SET radar_cooldown_seconds = 86400 WHERE id = $1;`, [workspaceA]);
    });

    it("enforces check constraints on radar_cooldown_seconds and radar_rule_version", async () => {
      // Negative cooldown -> violates constraint
      await expect(
        ownerPool.query(`UPDATE workspaces SET radar_cooldown_seconds = -1 WHERE id = $1;`, [workspaceA])
      ).rejects.toThrowError(/chk_workspaces_radar_cooldown/);

      // Excessive cooldown (> 30 days) -> violates constraint
      await expect(
        ownerPool.query(`UPDATE workspaces SET radar_cooldown_seconds = 3000000 WHERE id = $1;`, [workspaceA])
      ).rejects.toThrowError(/chk_workspaces_radar_cooldown/);

      // Empty rule version -> violates constraint
      await expect(
        ownerPool.query(`UPDATE workspaces SET radar_rule_version = '  ' WHERE id = $1;`, [workspaceA])
      ).rejects.toThrowError(/chk_workspaces_radar_rule_version/);
    });
  });

  describe("6. Optimistic Concurrency, Cursor Pagination & Invariants", () => {
    it("guarantees a single decision wins when two operators decide simultaneously", async () => {
      const { contactId, threadId } = await createContactAndThread(workspaceA, { lastMessageHoursAgo: 2 });
      const currentRev = await getCandidateRevision(workspaceA, threadId);

      const key = `concur-decide-${crypto.randomUUID()}`;
      const { suggestion } = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: key,
          threadId,
          contactId,
          candidateRevision: currentRev,
          title: "Decisão Concorrente",
          body: "Corpo",
        });
      }, appPool);

      const op1Promise = withTenantTransaction(workspaceA, async (client) => {
        return decideSuggestion(client, workspaceA, suggestion.id, {
          status: "accepted",
          decidedByUserId: operatorA,
          expectedStateVersion: 1,
        });
      }, appPool);

      const op2Promise = withTenantTransaction(workspaceA, async (client) => {
        return decideSuggestion(client, workspaceA, suggestion.id, {
          status: "dismissed",
          decidedByUserId: operatorA,
          expectedStateVersion: 1,
        });
      }, appPool);

      const [res1, res2] = await Promise.all([op1Promise, op2Promise]);
      const successful = [res1, res2].filter((r) => r.ok);
      const rejected = [res1, res2].find((r) => !r.ok);

      expect(successful.length).toBe(1);
      expect(rejected).toBeDefined();
      if (rejected && !rejected.ok) {
        expect(rejected.code).toMatch(/ALREADY_DECIDED|VERSION_MISMATCH/);
      }
    });

    it("fails with InvalidCursorError when cursor is malformed", () => {
      expect(() => decodeCursor("invalid-base64-not-json")).toThrow(InvalidCursorError);
      expect(() => decodeCursor(Buffer.from(JSON.stringify({ lastMessageAt: "invalid-date", id: "123" })).toString("base64url"))).toThrow(InvalidCursorError);
    });

    it("guarantees valid acceptance generates ZERO outbound messages or commands", async () => {
      const { contactId, threadId } = await createContactAndThread(workspaceA, { lastMessageHoursAgo: 2 });
      const currentRev = await getCandidateRevision(workspaceA, threadId);

      const { suggestion } = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: `zero-outbound-${crypto.randomUUID()}`,
          threadId,
          contactId,
          candidateRevision: currentRev,
          title: "Aceite limpo",
          body: "Corpo",
          draftMessage: "Rascunho de teste",
        });
      }, appPool);

      const outBefore = await ownerPool.query(`SELECT COUNT(*)::text as count FROM outbound_commands WHERE workspace_id = $1;`, [workspaceA]);

      const res = await withTenantTransaction(workspaceA, async (client) => {
        return decideSuggestion(client, workspaceA, suggestion.id, {
          status: "accepted",
          decidedByUserId: operatorA,
          expectedStateVersion: 1,
        });
      }, appPool);

      expect(res.ok).toBe(true);

      const outAfter = await ownerPool.query(`SELECT COUNT(*)::text as count FROM outbound_commands WHERE workspace_id = $1;`, [workspaceA]);
      expect(outAfter.rows[0].count).toBe(outBefore.rows[0].count);
    });

    it("ensures Workspace A suggestions are completely invisible to Workspace B", async () => {
      const { contactId, threadId } = await createContactAndThread(workspaceA, { lastMessageHoursAgo: 2 });
      const currentRev = await getCandidateRevision(workspaceA, threadId);

      const keyA = `rls-wsA-${crypto.randomUUID()}`;
      await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: keyA,
          threadId,
          contactId,
          candidateRevision: currentRev,
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
