import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { createTestDatabasePools } from "@sos-sales/database";
import { SignJWT } from "@sos-sales/auth";
import { buildApp } from "../index";

describe("Commercial Actions (E2) API Routes Suite", () => {
  const jwtSecret = "test_jwt_secret_key_minimum_32_characters_long_2026!";
  const testIssuer = "sos-sales-test";
  const testAudience = "sos-sales-api-test";
  const testMasterKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  const { ownerPool, appPool } = createTestDatabasePools();

  let app: FastifyInstance;
  let workspaceAId: string;
  let workspaceBId: string;
  let userAId: string;
  let userBId: string;
  let tokenA: string;
  let tokenB: string;

  let channelAId: string;
  let contactAId: string;
  let threadAId: string;

  beforeAll(async () => {
    // 0. Ensure migration 020 is applied
    const migrationPath = path.resolve(__dirname, "../../../../packages/database/migrations/020_commercial_actions.sql");
    if (fs.existsSync(migrationPath)) {
      const sql = fs.readFileSync(migrationPath, "utf-8");
      await ownerPool.query(sql);
    }

    app = await buildApp({
      providerType: "local-jwt",
      jwtSecret,
      issuer: testIssuer,
      audience: testAudience,
      masterKeyHex: testMasterKey,
    });

    // 1. Provision Organization and Workspaces
    const orgRes = await ownerPool.query(`
      INSERT INTO organizations (name, slug)
      VALUES ('Actions API Org', $1)
      RETURNING id;
    `, [`actions-org-${crypto.randomUUID()}`]);
    const orgId = orgRes.rows[0].id;

    const wsARes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'Workspace Actions Alpha', $2)
      RETURNING id;
    `, [orgId, `actions-ws-a-${crypto.randomUUID()}`]);
    workspaceAId = wsARes.rows[0].id;

    const wsBRes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'Workspace Actions Beta', $2)
      RETURNING id;
    `, [orgId, `actions-ws-b-${crypto.randomUUID()}`]);
    workspaceBId = wsBRes.rows[0].id;

    // 2. Users
    userAId = crypto.randomUUID();
    userBId = crypto.randomUUID();

    await ownerPool.query(`
      INSERT INTO users (id, email, name)
      VALUES 
        ($1, $2, 'Operador A'),
        ($3, $4, 'Operador B');
    `, [userAId, `op-a-${userAId}@mct.br`, userBId, `op-b-${userBId}@mct.br`]);

    await ownerPool.query(`
      INSERT INTO workspace_memberships (workspace_id, user_id, role)
      VALUES 
        ($1, $2, 'operator'),
        ($3, $4, 'operator');
    `, [workspaceAId, userAId, workspaceBId, userBId]);

    // 3. Tokens
    const sign = async (userId: string, wsId: string, email: string) => {
      const secret = new TextEncoder().encode(jwtSecret);
      return new SignJWT({
        email,
        role: "operator",
        workspaceId: wsId,
        permissions: ["cockpit:access", "operator"],
      })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(userId)
        .setIssuer(testIssuer)
        .setAudience(testAudience)
        .setExpirationTime("2h")
        .sign(secret);
    };

    tokenA = await sign(userAId, workspaceAId, `op-a-${userAId}@mct.br`);
    tokenB = await sign(userBId, workspaceBId, `op-b-${userBId}@mct.br`);

    // 4. Channel, Contact, Thread in A
    const tokenHashA = crypto.createHash("sha256").update(`tok-${Date.now()}`).digest("hex");
    const chanARes = await ownerPool.query(`
      INSERT INTO channel_instances (workspace_id, provider, display_name, endpoint_token_hash)
      VALUES ($1, 'waha', 'WhatsApp Vendas', $2)
      RETURNING id;
    `, [workspaceAId, tokenHashA]);
    channelAId = chanARes.rows[0].id;

    const contARes = await ownerPool.query(`
      INSERT INTO contacts (workspace_id, phone_e164, name)
      VALUES ($1, '+5549999991234', 'Cliente Teste')
      RETURNING id;
    `, [workspaceAId]);
    contactAId = contARes.rows[0].id;

    const threadARes = await ownerPool.query(`
      INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status, last_message_at)
      VALUES ($1, $2, $3, 'active', now())
      RETURNING id;
    `, [workspaceAId, channelAId, contactAId]);
    threadAId = threadARes.rows[0].id;
  });

  afterAll(async () => {
    if (app) await app.close();
    await ownerPool.end();
    await appPool.end();
  });

  let createdActionId: string;

  it("1. GET /v1/workspaces/:id/threads/:id/actions — rejects unauthenticated and cross-tenant requests", async () => {
    // No token
    const resNoAuth = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}/threads/${threadAId}/actions`,
    });
    expect(resNoAuth.statusCode).toBe(401);

    // Cross-tenant (Token B querying Workspace A)
    const resCross = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}/threads/${threadAId}/actions`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(resCross.statusCode).toBe(403);
  });

  it("2. GET /v1/workspaces/:id/threads/:id/actions — returns empty list and null openAction initially", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}/threads/${threadAId}/actions`,
      headers: { authorization: `Bearer ${tokenA}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.actions).toEqual([]);
    expect(body.openAction).toBeNull();
  });

  it("3. POST /v1/workspaces/:id/threads/:id/actions — validates input schema", async () => {
    // Missing title
    const res = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceAId}/threads/${threadAId}/actions`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        title: "",
        dueAt: new Date().toISOString(),
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("4. POST /v1/workspaces/:id/threads/:id/actions — creates commercial action (201)", async () => {
    const dueAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const res = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceAId}/threads/${threadAId}/actions`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        title: "Apresentar condições especiais de fechamento",
        description: "Oferecer 10% de desconto para pagamento hoje",
        dueAt,
        assigneeUserId: userAId,
        origin: "manual",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.created).toBe(true);
    expect(body.action.id).toBeDefined();
    expect(body.action.title).toBe("Apresentar condições especiais de fechamento");
    expect(body.action.status).toBe("open");
    expect(body.action.postponedCount).toBe(0);

    createdActionId = body.action.id;
  });

  it("5. POST /v1/workspaces/:id/threads/:id/actions — reuses existing open action idempotently (200)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceAId}/threads/${threadAId}/actions`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        title: "Tentativa concorrente de criar outra ação",
        dueAt: new Date().toISOString(),
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.created).toBe(false);
    expect(body.action.id).toBe(createdActionId);
    expect(body.action.title).toBe("Apresentar condições especiais de fechamento");
  });

  it("6. GET /v1/workspaces/:id/threads/:id/actions — reflects the open action", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}/threads/${threadAId}/actions`,
      headers: { authorization: `Bearer ${tokenA}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.actions.length).toBe(1);
    expect(body.openAction).not.toBeNull();
    expect(body.openAction.id).toBe(createdActionId);
  });

  it("7. PATCH /v1/workspaces/:id/actions/:id — reschedule requires reason and increments count", async () => {
    const newDue = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const res = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceAId}/actions/${createdActionId}`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        action: "reschedule",
        newDueAt: newDue,
        reason: "Lead pediu retorno amanhã à tarde",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.action.postponedCount).toBe(1);
    expect(body.action.postponedReason).toBe("Lead pediu retorno amanhã à tarde");
    expect(body.action.dueAt).toBe(newDue);
  });

  it("8. PATCH /v1/workspaces/:id/actions/:id — assign action to a user", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceAId}/actions/${createdActionId}`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        action: "assign",
        assigneeUserId: null,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.action.assigneeUserId).toBeNull();
  });

  it("9. GET /v1/workspaces/:id/actions/:id/history — returns audit log of events", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}/actions/${createdActionId}/history`,
      headers: { authorization: `Bearer ${tokenA}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.history.length).toBeGreaterThanOrEqual(3);
    const types = body.history.map((h: any) => h.actionType);
    expect(types).toContain("created");
    expect(types).toContain("rescheduled");
    expect(types).toContain("assigned");
  });

  it("10. PATCH /v1/workspaces/:id/actions/:id — complete action is idempotent", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceAId}/actions/${createdActionId}`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        action: "complete",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.action.status).toBe("completed");
    expect(body.action.completedAt).toBeDefined();

    // Re-call idempotent
    const res2 = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceAId}/actions/${createdActionId}`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        action: "complete",
      },
    });
    expect(res2.statusCode).toBe(200);
  });

  it("11. GET /v1/workspaces/:id/threads — returns nextAction and respects needsAttention filter", async () => {
    // Create a new contact and thread with overdue action
    const contRes = await ownerPool.query(`
      INSERT INTO contacts (workspace_id, phone_e164, name)
      VALUES ($1, '+5549999998888', 'Cliente Urgente')
      RETURNING id;
    `, [workspaceAId]);
    const urgentContactId = contRes.rows[0].id;

    const threadRes = await ownerPool.query(`
      INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status, last_message_at)
      VALUES ($1, $2, $3, 'active', now())
      RETURNING id;
    `, [workspaceAId, channelAId, urgentContactId]);
    const urgentThreadId = threadRes.rows[0].id;

    // Create action due in the past (overdue)
    const pastDue = new Date(Date.now() - 3600 * 1000).toISOString();
    await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceAId}/threads/${urgentThreadId}/actions`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        title: "Ação Urgente Vencida",
        dueAt: pastDue,
      },
    });

    // List all threads
    const resAll = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}/threads`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(resAll.statusCode).toBe(200);
    const allThreads = resAll.json().threads;
    expect(allThreads.length).toBeGreaterThanOrEqual(2);

    // List with needsAttention=true
    const resAttention = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}/threads?needsAttention=true`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(resAttention.statusCode).toBe(200);
    const attentionThreads = resAttention.json().threads;
    const foundUrgent = attentionThreads.find((t: any) => t.id === urgentThreadId);
    expect(foundUrgent).toBeDefined();
    expect(foundUrgent.nextAction).toBeDefined();
    expect(foundUrgent.nextAction.title).toBe("Ação Urgente Vencida");
  });
});
