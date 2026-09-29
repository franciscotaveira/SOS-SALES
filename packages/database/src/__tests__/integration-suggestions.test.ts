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
} from "../index";

describe("Integration Suggestions Repository (F1 Radar)", () => {
  const { ownerPool, appPool } = createTestDatabasePools();

  let workspaceA: string;
  let workspaceB: string;
  const operatorA = crypto.randomUUID();
  let contactAId: string;
  let threadAId: string;

  beforeAll(async () => {
    // 1. Provision Organization and Workspaces
    const orgRes = await ownerPool.query(`
      INSERT INTO organizations (name, slug)
      VALUES ('F1 Radar Test Org', $1)
      RETURNING id;
    `, [`org-radar-${Date.now()}`]);
    const orgId = orgRes.rows[0].id;

    const wsARes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'F1 Radar WS A', $2)
      RETURNING id;
    `, [orgId, `ws-a-${Date.now()}`]);
    workspaceA = wsARes.rows[0].id;

    const wsBRes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'F1 Radar WS B', $2)
      RETURNING id;
    `, [orgId, `ws-b-${Date.now()}`]);
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

    // 3. Provision Channel Instance & Contact & Commercial Thread for Workspace A
    const tokenHash = crypto.createHash("sha256").update(`token-radar-${Date.now()}`).digest("hex");
    const chanRes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164,
        endpoint_token_hash, is_active
      ) VALUES ($1, 'meta_waba', 'Radar Line', '+5549999990000', $2, true)
      RETURNING id;
    `, [workspaceA, tokenHash]);
    const channelInstanceId = chanRes.rows[0].id;

    const contactRes = await ownerPool.query(`
      INSERT INTO contacts (workspace_id, phone_e164, name)
      VALUES ($1, '+5549999990001', 'Cliente Contabilidade Teste')
      RETURNING id;
    `, [workspaceA]);
    contactAId = contactRes.rows[0].id;

    const threadRes = await ownerPool.query(`
      INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status, last_message_at)
      VALUES ($1, $2, $3, 'active', now() - interval '5 hours')
      RETURNING id;
    `, [workspaceA, channelInstanceId, contactAId]);
    threadAId = threadRes.rows[0].id;

    // Add a message so candidate query has last message details
    await ownerPool.query(`
      INSERT INTO messages (
        workspace_id, channel_instance_id, thread_id, provider, direction,
        sender_e164, recipient_e164, content_type, body, created_at
      ) VALUES (
        $1, $2, $3, 'meta_waba', 'inbound',
        '+5549999990001', '+5549999990000', 'text',
        'Gostaria de proposta para BPO Financeiro', now() - interval '5 hours'
      );
    `, [workspaceA, channelInstanceId, threadAId]);
  });

  afterAll(async () => {
    await appPool.end();
    await ownerPool.end();
  });

  describe("1. Idempotency & Creation", () => {
    it("should create a suggestion idempotently", async () => {
      const idempotencyKey = `radar-test-${crypto.randomUUID()}`;

      // First call: creates
      const first = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey,
          source: "n8n",
          threadId: threadAId,
          contactId: contactAId,
          suggestionType: "follow_up",
          title: "Follow-up BPO Financeiro",
          body: "Cliente parou após pedir proposta de BPO. Sugerir agendamento.",
          draftMessage: "Olá! Posso te apresentar nosso plano de BPO Financeiro amanhã?",
          priority: "high",
        });
      }, appPool);

      expect(first.created).toBe(true);
      expect(first.suggestion.id).toBeDefined();
      expect(first.suggestion.title).toBe("Follow-up BPO Financeiro");
      expect(first.suggestion.status).toBe("pending");
      expect(first.suggestion.state_version).toBe(1);

      // Second call with same idempotency_key: returns existing row
      const second = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey,
          title: "Different title ignored",
          body: "Different body ignored",
        });
      }, appPool);

      expect(second.created).toBe(false);
      expect(second.suggestion.id).toBe(first.suggestion.id);
      expect(second.suggestion.title).toBe("Follow-up BPO Financeiro");
    });
  });

  describe("2. Tenant Isolation (RLS)", () => {
    it("should isolate suggestions between workspace A and workspace B", async () => {
      const keyA = `radar-wsA-${crypto.randomUUID()}`;
      const keyB = `radar-wsB-${crypto.randomUUID()}`;

      // Insert into WS A
      await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: keyA,
          title: "Sugestão Tenant A",
          body: "Dados do Tenant A",
        });
      }, appPool);

      // Insert into WS B
      await withTenantTransaction(workspaceB, async (client) => {
        return createIntegrationSuggestion(client, workspaceB, {
          idempotencyKey: keyB,
          title: "Sugestão Tenant B",
          body: "Dados do Tenant B",
        });
      }, appPool);

      // Query from WS A: must see ONLY Tenant A suggestions
      const listA = await withTenantTransaction(workspaceA, async (client) => {
        return listIntegrationSuggestions(client, workspaceA);
      }, appPool);

      expect(listA.items.every((s) => s.workspace_id === workspaceA)).toBe(true);
      expect(listA.items.some((s) => s.idempotency_key === keyA)).toBe(true);
      expect(listA.items.some((s) => s.idempotency_key === keyB)).toBe(false);

      // Query count from WS B: must see ONLY Tenant B suggestions
      const countB = await withTenantTransaction(workspaceB, async (client) => {
        return countPendingSuggestions(client, workspaceB);
      }, appPool);
      expect(countB).toBeGreaterThanOrEqual(1);
    });
  });

  describe("3. Optimistic Concurrency State Transitions", () => {
    it("should accept a suggestion and increment state_version", async () => {
      const key = `radar-decide-${crypto.randomUUID()}`;
      const { suggestion } = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: key,
          title: "Decisão Test",
          body: "Corpo do teste",
          draftMessage: "Rascunho aceito",
        });
      }, appPool);

      // Operator accepts with state_version = 1
      const accepted = await withTenantTransaction(workspaceA, async (client) => {
        return decideSuggestion(client, workspaceA, suggestion.id, {
          status: "accepted",
          decidedByUserId: operatorA,
          expectedStateVersion: 1,
        });
      }, appPool);

      expect(accepted).not.toBeNull();
      expect(accepted!.status).toBe("accepted");
      expect(accepted!.state_version).toBe(2);
      expect(accepted!.decided_by_user_id).toBe(operatorA);
      expect(accepted!.decided_at).not.toBeNull();

      // Subsequent attempt with stale version 1 must return null (optimistic concurrency)
      const staleAttempt = await withTenantTransaction(workspaceA, async (client) => {
        return decideSuggestion(client, workspaceA, suggestion.id, {
          status: "dismissed",
          decidedByUserId: operatorA,
          expectedStateVersion: 1,
        });
      }, appPool);

      expect(staleAttempt).toBeNull();
    });

    it("should dismiss a suggestion cleanly", async () => {
      const key = `radar-dismiss-${crypto.randomUUID()}`;
      const { suggestion } = await withTenantTransaction(workspaceA, async (client) => {
        return createIntegrationSuggestion(client, workspaceA, {
          idempotencyKey: key,
          title: "Sugestão a ser dispensada",
          body: "Corpo a ser dispensado",
        });
      }, appPool);

      const dismissed = await withTenantTransaction(workspaceA, async (client) => {
        return decideSuggestion(client, workspaceA, suggestion.id, {
          status: "dismissed",
          decidedByUserId: operatorA,
          expectedStateVersion: 1,
        });
      }, appPool);

      expect(dismissed).not.toBeNull();
      expect(dismissed!.status).toBe("dismissed");
      expect(dismissed!.state_version).toBe(2);
    });
  });

  describe("4. Candidate Query (Snapshot of eligible threads)", () => {
    it("should return eligible candidates with real waiting facts", async () => {
      const candidates = await withTenantTransaction(workspaceA, async (client) => {
        return listIntegrationCandidates(client, workspaceA, { minHoursSinceLastMessage: 1 });
      }, appPool);

      expect(candidates.total).toBeGreaterThanOrEqual(1);
      const cand = candidates.items.find((c) => c.thread_id === threadAId);
      expect(cand).toBeDefined();
      expect(cand!.contact_name).toBe("Cliente Contabilidade Teste");
      expect(cand!.contact_phone).toBe("+5549999990001");
      expect(cand!.hours_since_last_message).toBeGreaterThanOrEqual(4);
      expect(cand!.last_message_direction).toBe("inbound");
    });
  });
});
