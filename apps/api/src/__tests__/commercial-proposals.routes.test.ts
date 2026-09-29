import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { createTestDatabasePools } from "@sos-sales/database";
import { SignJWT } from "@sos-sales/auth";
import { buildApp } from "../index";

describe("Commercial Proposals API Routes Suite (M6)", () => {
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
  let productId: string;

  beforeAll(async () => {
    // 0. Ensure migration 021 is applied
    const migrationPath = path.resolve(__dirname, "../../../../packages/database/migrations/021_commercial_proposals.sql");
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
      VALUES ('Proposals API Org', $1)
      RETURNING id;
    `, [`prop-org-${crypto.randomUUID()}`]);
    const orgId = orgRes.rows[0].id;

    const wsARes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'Workspace Proposals Alpha', $2)
      RETURNING id;
    `, [orgId, `prop-ws-a-${crypto.randomUUID()}`]);
    workspaceAId = wsARes.rows[0].id;

    const wsBRes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'Workspace Proposals Beta', $2)
      RETURNING id;
    `, [orgId, `prop-ws-b-${crypto.randomUUID()}`]);
    workspaceBId = wsBRes.rows[0].id;

    // 2. Users
    userAId = crypto.randomUUID();
    userBId = crypto.randomUUID();

    await ownerPool.query(`
      INSERT INTO users (id, email, name)
      VALUES 
        ($1, $2, 'Operador A'),
        ($3, $4, 'Operador B');
    `, [userAId, `op-prop-a-${userAId}@mct.br`, userBId, `op-prop-b-${userBId}@mct.br`]);

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
        role: "authenticated",
        app_metadata: { role: "authenticated" },
        user_metadata: { workspaceId: wsId },
      })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setSubject(userId)
        .setIssuer(testIssuer)
        .setAudience(testAudience)
        .setExpirationTime("2h")
        .sign(secret);
    };

    tokenA = await sign(userAId, workspaceAId, `op-prop-a-${userAId}@mct.br`);
    tokenB = await sign(userBId, workspaceBId, `op-prop-b-${userBId}@mct.br`);

    // 4. Ingress Entities for Workspace A
    channelAId = crypto.randomUUID();
    contactAId = crypto.randomUUID();
    threadAId = crypto.randomUUID();

    await ownerPool.query(`
      INSERT INTO channel_instances (id, workspace_id, provider, display_name, endpoint_token_hash)
      VALUES ($1, $2, 'meta_waba', 'Canal WABA Propostas', $3);
    `, [channelAId, workspaceAId, crypto.createHash("sha256").update(channelAId).digest("hex")]);

    await ownerPool.query(`
      INSERT INTO contacts (id, workspace_id, phone_e164, name)
      VALUES ($1, $2, '+5549999990099', 'Cliente Proposta API');
    `, [contactAId, workspaceAId]);

    await ownerPool.query(`
      INSERT INTO commercial_threads (id, workspace_id, channel_instance_id, contact_id, status)
      VALUES ($1, $2, $3, $4, 'active');
    `, [threadAId, workspaceAId, channelAId, contactAId]);

    // 5. Product
    const prodRes = await ownerPool.query(`
      INSERT INTO products (
        workspace_id, retailer_id, title, description, price_cents, category, image_url
      ) VALUES (
        $1, 'SKU-PROP-API', 'Plano Enterprise API', 'Descrição', 100000, 'Planos', 'https://mct.br/img.png'
      ) RETURNING id;
    `, [workspaceAId]);
    productId = prodRes.rows[0].id;
  });

  afterAll(async () => {
    await app.close();
    await appPool.end();
    await ownerPool.end();
  });

  it("POST /v1/workspaces/:ws/threads/:thread/proposals - creates proposal with immutable snapshot items (201)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceAId}/threads/${threadAId}/proposals`,
      headers: {
        authorization: `Bearer ${tokenA}`,
      },
      payload: {
        contactId: contactAId,
        title: "Proposta Comercial Inicial",
        items: [
          { productId, quantity: 1 },
          { title: "Serviço Adicional Customizado", unitPriceCents: 25000, quantity: 2 },
        ],
        conditions: "Pagamento em 2 parcelas",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBeDefined();
    expect(body.title).toBe("Proposta Comercial Inicial");
    expect(body.status).toBe("draft");
    expect(body.items.length).toBe(2);
    expect(body.items[0].title).toBe("Plano Enterprise API");
    expect(body.items[0].unitPriceCents).toBe(100000);
    expect(body.items[1].title).toBe("Serviço Adicional Customizado");
    expect(body.items[1].unitPriceCents).toBe(25000);
    // Total: 100000 + (25000 * 2) = 150000
    expect(body.totalCents).toBe(150000);
  });

  it("GET /v1/workspaces/:ws/threads/:thread/proposals - lists proposals under tenant scope (200)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}/threads/${threadAId}/proposals`,
      headers: {
        authorization: `Bearer ${tokenA}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items).toBeDefined();
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.items[0].threadId).toBe(threadAId);
  });

  it("PATCH /v1/workspaces/:ws/proposals/:id/status - transitions status through lifecycle (200)", async () => {
    // 1. Create a proposal
    const createRes = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceAId}/threads/${threadAId}/proposals`,
      headers: {
        authorization: `Bearer ${tokenA}`,
      },
      payload: {
        contactId: contactAId,
        title: "Proposta para Envio e Aceite",
        items: [{ title: "Item A", unitPriceCents: 10000, quantity: 1 }],
      },
    });
    const proposalId = JSON.parse(createRes.body).id;

    // 2. Transition draft -> sent
    const sendRes = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceAId}/proposals/${proposalId}/status`,
      headers: {
        authorization: `Bearer ${tokenA}`,
      },
      payload: { status: "sent", expectedVersion: 1 },
    });
    expect(sendRes.statusCode).toBe(200);
    expect(JSON.parse(sendRes.body).status).toBe("sent");

    // 3. Transition sent -> accepted
    const acceptRes = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceAId}/proposals/${proposalId}/status`,
      headers: {
        authorization: `Bearer ${tokenA}`,
      },
      payload: { status: "accepted", expectedVersion: 2 },
    });
    expect(acceptRes.statusCode).toBe(200);
    expect(JSON.parse(acceptRes.body).status).toBe("accepted");

    // 4. Attempt invalid backwards transition -> 409 Conflict
    const invalidRes = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceAId}/proposals/${proposalId}/status`,
      headers: {
        authorization: `Bearer ${tokenA}`,
      },
      payload: { status: "draft", expectedVersion: 3 },
    });
    expect(invalidRes.statusCode).toBe(409);
  });

  it("Cross-Tenant Isolation: Workspace B cannot see or modify Workspace A proposal (404/empty)", async () => {
    // Create proposal in Workspace A
    const createRes = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceAId}/threads/${threadAId}/proposals`,
      headers: {
        authorization: `Bearer ${tokenA}`,
      },
      payload: {
        contactId: contactAId,
        title: "Proposta Confidencial Alpha",
        items: [{ title: "Item Seguro", unitPriceCents: 1000, quantity: 1 }],
      },
    });
    const proposalId = JSON.parse(createRes.body).id;

    // Workspace B queries Workspace A's proposal
    const getRes = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceBId}/proposals/${proposalId}`,
      headers: {
        authorization: `Bearer ${tokenB}`,
      },
    });
    expect(getRes.statusCode).toBe(404);
  });
});
