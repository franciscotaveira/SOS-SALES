import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { createTestDatabasePools, insertMessage, createOrGetContact, getOrCreateCommercialThread } from "@sos-sales/database";
import { SignJWT } from "@sos-sales/auth";
import { buildApp } from "../index";
import type { FastifyInstance } from "fastify";

describe("Threads and Channels Routes Integration (Fastify + RLS)", () => {
  const jwtSecret = "test_jwt_secret_key_minimum_32_characters_long_2026!";
  const testIssuer = "sos-sales-test";
  const testAudience = "sos-sales-api-test";

  const { appPool, ownerPool } = createTestDatabasePools();

  let app: FastifyInstance;
  let workspaceAId: string;
  let workspaceBId: string;
  let orgId: string;

  let channelAId: string;
  let contactAId: string;
  let threadAId: string;

  const userOperatorId = crypto.randomUUID();
  let operatorToken: string;

  beforeAll(async () => {
    app = await buildApp({
      providerType: "local-jwt",
      jwtSecret,
      issuer: testIssuer,
      audience: testAudience,
    });

    // 1. Provision Org & Workspaces
    const orgRes = await ownerPool.query(
      `INSERT INTO organizations (name, slug)
       VALUES ('Threads Test Org', $1)
       RETURNING id;`,
      [`org-threads-${Date.now()}`]
    );
    orgId = orgRes.rows[0].id;

    const wsARes = await ownerPool.query(
      `INSERT INTO workspaces (organization_id, name, slug)
       VALUES ($1, 'Workspace A', $2)
       RETURNING id;`,
      [orgId, `ws-a-${Date.now()}`]
    );
    workspaceAId = wsARes.rows[0].id;

    const wsBRes = await ownerPool.query(
      `INSERT INTO workspaces (organization_id, name, slug)
       VALUES ($1, 'Workspace B', $2)
       RETURNING id;`,
      [orgId, `ws-b-${Date.now()}`]
    );
    workspaceBId = wsBRes.rows[0].id;

    // 2. User & Memberships
    await ownerPool.query(
      `INSERT INTO users (id, email, name)
       VALUES ($1, $2, 'Operator Alice');`,
      [userOperatorId, `operator-${Date.now()}@example.com`]
    );

    await ownerPool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'operator');`,
      [workspaceAId, userOperatorId]
    );

    // 3. Generate JWT
    const secretKey = new TextEncoder().encode(jwtSecret);
    operatorToken = await new SignJWT({
      sub: userOperatorId,
      email: "operator@example.com",
      role: "authenticated",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .setExpirationTime("1h")
      .sign(secretKey);

    // 4. Provision Channel, Contact and Thread in Workspace A
    const channelTokenHash = crypto.randomBytes(32).toString("hex");
    const channelRes = await ownerPool.query(
      `INSERT INTO channel_instances (
         workspace_id, provider, display_name, phone_number_e164, endpoint_token_hash, is_active
       ) VALUES ($1, 'waha', 'Suporte WhatsApp', '+5511999990001', $2, true)
       RETURNING id;`,
      [workspaceAId, channelTokenHash]
    );
    channelAId = channelRes.rows[0].id;

    const contact = await createOrGetContact(ownerPool, {
      workspaceId: workspaceAId,
      phoneE164: "+5511988887777",
      name: "Lead João Silva",
    });
    contactAId = contact.id;

    const thread = await getOrCreateCommercialThread(ownerPool, {
      workspaceId: workspaceAId,
      channelInstanceId: channelAId,
      contactId: contactAId,
      status: "active",
    });
    threadAId = thread.id;

    // Insert an inbound message
    await insertMessage(ownerPool, {
      workspaceId: workspaceAId,
      channelInstanceId: channelAId,
      threadId: threadAId,
      provider: "waha",
      direction: "inbound",
      senderE164: "+5511988887777",
      recipientE164: "+5511999990001",
      contentType: "text",
      body: "Olá, tenho interesse no produto!",
      deliveryStatus: "delivered",
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    await appPool.end();
    await ownerPool.end();
  });

  it("lists active channels for the workspace", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}/channels`,
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.channels).toBeDefined();
    expect(body.channels.length).toBeGreaterThanOrEqual(1);
    expect(body.channels[0].id).toBe(channelAId);
    expect(body.channels[0].provider).toBe("waha");
    expect(body.channels[0].displayName).toBe("Suporte WhatsApp");
  });

  it("lists commercial threads with contact and last message projection", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}/threads`,
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.threads).toBeDefined();
    expect(body.threads.length).toBe(1);

    const t = body.threads[0];
    expect(t.id).toBe(threadAId);
    expect(t.contactName).toBe("Lead João Silva");
    expect(t.contactPhone).toBe("+5511988887777");
    expect(t.lastMessage).toBeDefined();
    expect(t.lastMessage.body).toBe("Olá, tenho interesse no produto!");
    expect(t.lastMessage.direction).toBe("inbound");
  });

  it("lists messages for a specific commercial thread", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}/threads/${threadAId}/messages`,
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.messages).toBeDefined();
    expect(body.messages.length).toBe(1);
    expect(body.messages[0].body).toBe("Olá, tenho interesse no produto!");
    expect(body.messages[0].direction).toBe("inbound");
  });

  it("updates thread status to waiting_human", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceAId}/threads/${threadAId}`,
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
      payload: {
        status: "waiting_human",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.thread.status).toBe("waiting_human");
  });

  it("blocks cross-tenant access to another workspace threads (fail-closed)", async () => {
    // Operator is member of Workspace A only; querying Workspace B must fail with 403 Forbidden
    const res = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceBId}/threads`,
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it("records a commercial outcome (won) for a thread and enqueues Meta CAPI conversion", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceAId}/threads/${threadAId}/outcomes`,
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
      payload: {
        status: "won",
        valueCents: 150000,
        currency: "BRL",
        reason: "Fechamento acelerado via Cockpit",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.outcome).toBeDefined();
    expect(body.outcome.status).toBe("won");
    expect(body.outcome.valueCents).toBe(150000);
    expect(body.outcome.currency).toBe("BRL");

    expect(body.conversionEvent).toBeDefined();
    expect(body.conversionEvent.eventName).toBe("PurchaseCompleted");
    expect(body.conversionEvent.status).toBe("QUEUED");

    // Verify journey query for this thread
    const journeyRes = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}/threads/${threadAId}/journey`,
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });

    expect(journeyRes.statusCode).toBe(200);
    const journeyBody = journeyRes.json();
    expect(journeyBody.journey).toBeDefined();
    expect(journeyBody.journey.stage).toBe("won");
    expect(journeyBody.latestOutcome).toBeDefined();
    expect(journeyBody.latestOutcome.status).toBe("won");
    expect(journeyBody.latestOutcome.valueCents).toBe(150000);

    // Verify conversions listing
    const convRes = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}/conversions`,
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });

    expect(convRes.statusCode).toBe(200);
    const convBody = convRes.json();
    expect(convBody.items.length).toBeGreaterThanOrEqual(1);
    expect(convBody.items[0].eventName).toBe("PurchaseCompleted");
  });
});

