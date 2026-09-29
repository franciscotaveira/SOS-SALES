import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  createTestDatabasePools,
  withTenantTransaction,
  createCommercialAction,
  getOpenCommercialAction,
  getCommercialActionById,
  listCommercialActionsForThread,
  rescheduleCommercialAction,
  assignCommercialAction,
  completeCommercialAction,
  cancelCommercialAction,
  getCommercialActionHistory,
  decideSuggestion,
  createIntegrationSuggestion,
  listIntegrationCandidates,
} from "../index";

describe("SOS Sales V3 — Commercial Actions (E2) Database Suite", () => {
  const { ownerPool, appPool } = createTestDatabasePools();

  let workspaceAId: string;
  let workspaceBId: string;
  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  let contactAId: string;
  let channelInstanceAId: string;
  let threadAId: string;
  let threadBId: string;

  beforeAll(async () => {
    // 0. Ensure migration 020 is applied to the test database
    const migrationPath = path.resolve(__dirname, "../../migrations/020_commercial_actions.sql");
    if (fs.existsSync(migrationPath)) {
      const sql = fs.readFileSync(migrationPath, "utf-8");
      await ownerPool.query(sql);
    }

    // 1. Seed Org and Workspaces
    const orgRes = await ownerPool.query(
      `INSERT INTO public.organizations (name, slug)
       VALUES ('Org Actions', $1) RETURNING id;`,
      [`org-actions-${Date.now()}`]
    );
    const orgId = orgRes.rows[0].id;

    const wsARes = await ownerPool.query(
      `INSERT INTO public.workspaces (organization_id, name, slug, is_active, radar_enabled, radar_rule_version)
       VALUES ($1, 'Workspace Actions A', $2, true, true, 'v1.0') RETURNING id;`,
      [orgId, `ws-actions-a-${Date.now()}`]
    );
    workspaceAId = wsARes.rows[0].id;

    const wsBRes = await ownerPool.query(
      `INSERT INTO public.workspaces (organization_id, name, slug, is_active, radar_enabled, radar_rule_version)
       VALUES ($1, 'Workspace Actions B', $2, true, true, 'v1.0') RETURNING id;`,
      [orgId, `ws-actions-b-${Date.now()}`]
    );
    workspaceBId = wsBRes.rows[0].id;

    // 2. Seed Users & Memberships
    await ownerPool.query(
      `INSERT INTO public.users (id, email, name)
       VALUES ($1, $2, 'Operador A'), ($3, $4, 'Operador B')
       ON CONFLICT (id) DO NOTHING;`,
      [userAId, `op-a-${Date.now()}@mct.br`, userBId, `op-b-${Date.now()}@mct.br`]
    );

    await ownerPool.query(
      `INSERT INTO public.workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'operator'), ($3, $4, 'operator')
       ON CONFLICT DO NOTHING;`,
      [workspaceAId, userAId, workspaceBId, userBId]
    );

    // 3. Seed Channels & Contacts in A
    const tokenA = crypto.createHash("sha256").update(`token-a-${crypto.randomUUID()}`).digest("hex");
    const chanARes = await ownerPool.query(
      `INSERT INTO public.channel_instances (workspace_id, provider, display_name, endpoint_token_hash)
       VALUES ($1, 'waha', 'WAHA Channel A', $2) RETURNING id;`,
      [workspaceAId, tokenA]
    );
    channelInstanceAId = chanARes.rows[0].id;

    const contARes = await ownerPool.query(
      `INSERT INTO public.contacts (workspace_id, phone_e164, name)
       VALUES ($1, '+5549999990001', 'Lead Alfa') RETURNING id;`,
      [workspaceAId]
    );
    contactAId = contARes.rows[0].id;

    const threadARes = await ownerPool.query(
      `INSERT INTO public.commercial_threads (workspace_id, channel_instance_id, contact_id, status, last_message_at)
       VALUES ($1, $2, $3, 'active', now()) RETURNING id;`,
      [workspaceAId, channelInstanceAId, contactAId]
    );
    threadAId = threadARes.rows[0].id;

    // 4. Seed Channel, Contact & Thread in B
    const tokenB = crypto.createHash("sha256").update(`token-b-${crypto.randomUUID()}`).digest("hex");
    const chanBRes = await ownerPool.query(
      `INSERT INTO public.channel_instances (workspace_id, provider, display_name, endpoint_token_hash)
       VALUES ($1, 'waha', 'WAHA Channel B', $2) RETURNING id;`,
      [workspaceBId, tokenB]
    );
    const contBRes = await ownerPool.query(
      `INSERT INTO public.contacts (workspace_id, phone_e164, name)
       VALUES ($1, '+5549999990002', 'Lead Beta') RETURNING id;`,
      [workspaceBId]
    );
    const threadBRes = await ownerPool.query(
      `INSERT INTO public.commercial_threads (workspace_id, channel_instance_id, contact_id, status, last_message_at)
       VALUES ($1, $2, $3, 'active', now()) RETURNING id;`,
      [workspaceBId, chanBRes.rows[0].id, contBRes.rows[0].id]
    );
    threadBId = threadBRes.rows[0].id;
  });

  afterAll(async () => {
    await ownerPool.end();
    await appPool.end();
  });

  it("CA-01: should create an open commercial action and record creation history", async () => {
    const dueAt = new Date(Date.now() + 24 * 3600 * 1000);

    const result = await withTenantTransaction(workspaceAId, async (client) => {
      return createCommercialAction(client, {
        workspaceId: workspaceAId,
        threadId: threadAId,
        title: "Enviar proposta comercial atualizada",
        description: "Cliente solicitou desconto para pagamento via Pix à vista.",
        dueAt,
        assigneeUserId: userAId,
        createdByUserId: userAId,
        origin: "manual",
      });
    });

    expect(result.created).toBe(true);
    expect(result.action.id).toBeDefined();
    expect(result.action.status).toBe("open");
    expect(result.action.title).toBe("Enviar proposta comercial atualizada");
    expect(result.action.postponed_count).toBe(0);

    // Verify history record
    const history = await withTenantTransaction(workspaceAId, async (client) => {
      return getCommercialActionHistory(client, workspaceAId, result.action.id);
    });

    expect(history.length).toBe(1);
    expect(history[0]!.action_type).toBe("created");
    expect(history[0]!.new_assignee_id).toBe(userAId);
  });

  it("CA-02: should enforce single open action per thread (idempotent creation returns existing)", async () => {
    const result2 = await withTenantTransaction(workspaceAId, async (client) => {
      return createCommercialAction(client, {
        workspaceId: workspaceAId,
        threadId: threadAId,
        title: "Segunda tentativa de criar ação aberta",
        dueAt: new Date(),
        origin: "manual",
      });
    });

    // Should NOT create duplicate; returns existing open action
    expect(result2.created).toBe(false);
    expect(result2.action.title).toBe("Enviar proposta comercial atualizada");

    // Total actions for thread must be 1
    const list = await withTenantTransaction(workspaceAId, async (client) => {
      return listCommercialActionsForThread(client, workspaceAId, threadAId);
    });
    expect(list.length).toBe(1);
  });

  it("CA-03: should reschedule an action, incrementing postponed_count and recording audit log", async () => {
    const openAction = await withTenantTransaction(workspaceAId, async (client) => {
      return getOpenCommercialAction(client, workspaceAId, threadAId);
    });
    expect(openAction).not.toBeNull();

    const newDue = new Date(Date.now() + 48 * 3600 * 1000);
    const updated = await withTenantTransaction(workspaceAId, async (client) => {
      return rescheduleCommercialAction(client, workspaceAId, openAction!.id, {
        newDueAt: newDue,
        reason: "Cliente em viagem até quinta-feira.",
        userId: userAId,
      });
    });

    expect(updated.postponed_count).toBe(1);
    expect(updated.postponed_reason).toBe("Cliente em viagem até quinta-feira.");
    expect(new Date(updated.due_at).getTime()).toBe(newDue.getTime());

    // Verify history audit
    const history = await withTenantTransaction(workspaceAId, async (client) => {
      return getCommercialActionHistory(client, workspaceAId, openAction!.id);
    });

    expect(history.length).toBe(2);
    expect(history[1]!.action_type).toBe("rescheduled");
    expect(history[1]!.reason).toBe("Cliente em viagem até quinta-feira.");
  });

  it("CA-04: should assign action to another user with audit trail", async () => {
    const openAction = await withTenantTransaction(workspaceAId, async (client) => {
      return getOpenCommercialAction(client, workspaceAId, threadAId);
    });

    const updated = await withTenantTransaction(workspaceAId, async (client) => {
      return assignCommercialAction(client, workspaceAId, openAction!.id, {
        assigneeUserId: null,
        userId: userAId,
      });
    });

    expect(updated.assignee_user_id).toBeNull();

    const history = await withTenantTransaction(workspaceAId, async (client) => {
      return getCommercialActionHistory(client, workspaceAId, openAction!.id);
    });
    expect(history.length).toBe(3);
    expect(history[2]!.action_type).toBe("assigned");
  });

  it("CA-05: should complete commercial action idempotently", async () => {
    const openAction = await withTenantTransaction(workspaceAId, async (client) => {
      return getOpenCommercialAction(client, workspaceAId, threadAId);
    });

    const completed = await withTenantTransaction(workspaceAId, async (client) => {
      return completeCommercialAction(client, workspaceAId, openAction!.id, {
        userId: userAId,
      });
    });

    expect(completed.status).toBe("completed");
    expect(completed.completed_at).toBeDefined();
    expect(completed.completed_by_user_id).toBe(userAId);

    // Calling again returns completed without error
    const completedAgain = await withTenantTransaction(workspaceAId, async (client) => {
      return completeCommercialAction(client, workspaceAId, openAction!.id, {
        userId: userAId,
      });
    });
    expect(completedAgain.status).toBe("completed");

    // Thread now has no open action
    const currentOpen = await withTenantTransaction(workspaceAId, async (client) => {
      return getOpenCommercialAction(client, workspaceAId, threadAId);
    });
    expect(currentOpen).toBeNull();
  });

  it("CA-06: should allow creating a new open action once prior action is completed", async () => {
    const result = await withTenantTransaction(workspaceAId, async (client) => {
      return createCommercialAction(client, {
        workspaceId: workspaceAId,
        threadId: threadAId,
        title: "Acompanhar confirmação do recebimento da proposta",
        dueAt: new Date(Date.now() + 12 * 3600 * 1000),
        origin: "manual",
      });
    });

    expect(result.created).toBe(true);
    expect(result.action.status).toBe("open");

    const all = await withTenantTransaction(workspaceAId, async (client) => {
      return listCommercialActionsForThread(client, workspaceAId, threadAId);
    });
    expect(all.length).toBe(2);
  });

  it("CA-07: should cancel commercial action idempotently and refuse completion of cancelled action", async () => {
    const openAction = await withTenantTransaction(workspaceAId, async (client) => {
      return getOpenCommercialAction(client, workspaceAId, threadAId);
    });

    const cancelled = await withTenantTransaction(workspaceAId, async (client) => {
      return cancelCommercialAction(client, workspaceAId, openAction!.id, {
        reason: "Lead desistiu da contratação",
        userId: userAId,
      });
    });

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelled_at).toBeDefined();

    // Idempotent cancellation
    const cancelledAgain = await withTenantTransaction(workspaceAId, async (client) => {
      return cancelCommercialAction(client, workspaceAId, openAction!.id, {
        userId: userAId,
      });
    });
    expect(cancelledAgain.status).toBe("cancelled");

    // Attempting to complete cancelled action throws
    await expect(
      withTenantTransaction(workspaceAId, async (client) => {
        return completeCommercialAction(client, workspaceAId, openAction!.id, {
          userId: userAId,
        });
      })
    ).rejects.toThrow("cancelada");
  });

  it("CA-08: should enforce strict RLS isolation between workspaces", async () => {
    // Action created in Workspace B
    const actionB = await withTenantTransaction(workspaceBId, async (client) => {
      return createCommercialAction(client, {
        workspaceId: workspaceBId,
        threadId: threadBId,
        title: "Ação Secreta Workspace B",
        dueAt: new Date(),
      });
    });

    // Querying action B from Workspace A context must return null (fail-closed)
    const crossQuery = await withTenantTransaction(workspaceAId, async (client) => {
      return getCommercialActionById(client, workspaceAId, actionB.action.id);
    });
    expect(crossQuery).toBeNull();

    // Querying from Workspace B must succeed
    const queryB = await withTenantTransaction(workspaceBId, async (client) => {
      return getCommercialActionById(client, workspaceBId, actionB.action.id);
    });
    expect(queryB).not.toBeNull();
    expect(queryB!.title).toBe("Ação Secreta Workspace B");
  });

  it("CA-09: should atomically link and create commercial action when Radar suggestion is accepted", async () => {
    // 1. Create a fresh thread and message for Radar suggestion
    const contRes = await ownerPool.query(
      `INSERT INTO public.contacts (workspace_id, phone_e164, name)
       VALUES ($1, '+5549999990099', 'Lead Radar Atomic') RETURNING id;`,
      [workspaceAId]
    );
    const newContactId = contRes.rows[0].id;

    const threadRes = await ownerPool.query(
      `INSERT INTO public.commercial_threads (workspace_id, channel_instance_id, contact_id, status, last_message_at)
       VALUES ($1, $2, $3, 'active', now()) RETURNING id;`,
      [workspaceAId, channelInstanceAId, newContactId]
    );
    const newThreadId = threadRes.rows[0].id;

    const msgRes = await ownerPool.query(
      `INSERT INTO public.messages (
         workspace_id, channel_instance_id, thread_id, provider, direction,
         sender_e164, recipient_e164, content_type, body, created_at
       ) VALUES (
         $1, $2, $3, 'waha', 'inbound',
         '+5549999990099', '+5549888880000', 'text', 'Gostaria de saber mais sobre o plano anual', now()
       ) RETURNING id, created_at;`,
      [workspaceAId, channelInstanceAId, newThreadId]
    );
    const msgId = msgRes.rows[0].id;
    const msgTime = new Date(msgRes.rows[0].created_at).toISOString();

    // 2. Fetch candidate and create Radar suggestion
    const candidates = await withTenantTransaction(workspaceAId, async (client) => {
      return listIntegrationCandidates(client, workspaceAId, { minHoursSinceLastMessage: 0 });
    });
    const cand = candidates.items.find((c) => c.threadId === newThreadId);
    expect(cand).toBeDefined();

    const sug = await withTenantTransaction(workspaceAId, async (client) => {
      return createIntegrationSuggestion(client, workspaceAId, {
        idempotencyKey: "radar-atomic-test-1",
        threadId: newThreadId,
        contactId: newContactId,
        candidateRevision: cand!.candidateRevision,
        title: "Apresentar plano anual com desconto",
        body: "Lead manifestou interesse claro no plano anual",
        draftMessage: "Olá! Temos uma condição especial para o plano anual com 20% off.",
        priority: "high",
        evidence: {
          threadId: newThreadId,
          contactId: newContactId,
          lastMessageId: msgId,
          lastMessageAt: msgTime,
          threadStatus: "active",
          contactOptOut: false,
          ruleVersion: "v1.0",
          moduleKey: "radar_m01",
        },
      });
    });

    expect(sug.created).toBe(true);

    // 3. Accept Radar suggestion
    const decision = await withTenantTransaction(workspaceAId, async (client) => {
      return decideSuggestion(client, workspaceAId, sug.suggestion.id, {
        status: "accepted",
        decidedByUserId: userAId,
        expectedStateVersion: 1,
      });
    });

    expect(decision.ok).toBe(true);
    expect(decision.action).toBeDefined();
    expect(decision.action!.title).toBe("Apresentar plano anual com desconto");
    expect(decision.action!.origin).toBe("radar_suggestion");
    expect(decision.action!.status).toBe("open");

    // 4. Concurrently or repeatedly deciding already-decided suggestion returns the same action
    const decisionRetry = await withTenantTransaction(workspaceAId, async (client) => {
      return decideSuggestion(client, workspaceAId, sug.suggestion.id, {
        status: "accepted",
        decidedByUserId: userAId,
        expectedStateVersion: 1,
      });
    });

    expect(decisionRetry.ok).toBe(false);
    if (!decisionRetry.ok) {
      expect(decisionRetry.code).toBe("ALREADY_DECIDED");
      expect(decisionRetry.action).toBeDefined();
      expect(decisionRetry.action!.id).toBe(decision.action!.id);
    }
  });
});
