import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { createTestDatabasePools, createOrGetContact } from "@sos-sales/database";
import { SignJWT } from "@sos-sales/auth";
import { buildApp } from "../index";
import type { FastifyInstance } from "fastify";

describe("Contacts Routes Integration (Fastify + RLS)", () => {
  const jwtSecret = "test_jwt_secret_key_minimum_32_characters_long_2026!";
  const testIssuer = "sos-sales-test";
  const testAudience = "sos-sales-api-test";

  const { appPool, ownerPool } = createTestDatabasePools();

  let app: FastifyInstance;
  let workspaceAId: string;
  let workspaceBId: string;
  let orgId: string;

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
       VALUES ('Contacts Test Org', $1)
       RETURNING id;`,
      [`org-contacts-${Date.now()}`]
    );
    orgId = orgRes.rows[0].id;

    const wsARes = await ownerPool.query(
      `INSERT INTO workspaces (organization_id, name, slug)
       VALUES ($1, 'Workspace Contacts A', $2)
       RETURNING id;`,
      [orgId, `ws-contacts-a-${Date.now()}`]
    );
    workspaceAId = wsARes.rows[0].id;

    const wsBRes = await ownerPool.query(
      `INSERT INTO workspaces (organization_id, name, slug)
       VALUES ($1, 'Workspace Contacts B', $2)
       RETURNING id;`,
      [orgId, `ws-contacts-b-${Date.now()}`]
    );
    workspaceBId = wsBRes.rows[0].id;

    // 2. User & Memberships
    await ownerPool.query(
      `INSERT INTO users (id, email, name)
       VALUES ($1, $2, 'Operator Contacts');`,
      [userOperatorId, `op-contacts-${Date.now()}@example.com`]
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

    // 4. Provision Contacts in Workspace A and B
    await createOrGetContact(ownerPool, {
      workspaceId: workspaceAId,
      phoneE164: "+5511999990001",
      name: "Lead Alice",
    });

    await createOrGetContact(ownerPool, {
      workspaceId: workspaceAId,
      phoneE164: "+5511999990002",
      name: "Lead Bob",
    });

    await createOrGetContact(ownerPool, {
      workspaceId: workspaceBId,
      phoneE164: "+5511999999999",
      name: "Secret Lead Workspace B",
    });
  });

  afterAll(async () => {
    await app.close();
    await appPool.end();
    await ownerPool.end();
  });

  it("lists contacts for Workspace A under RLS", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}/contacts`,
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.contacts).toBeDefined();
    expect(body.contacts.length).toBe(2);
    const phones = body.contacts.map((c: any) => c.phoneE164);
    expect(phones).toContain("+5511999990001");
    expect(phones).toContain("+5511999990002");
    expect(phones).not.toContain("+5511999999999");
  });

  it("filters contacts by search query", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}/contacts?search=Alice`,
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.contacts.length).toBe(1);
    expect(body.contacts[0].name).toBe("Lead Alice");
  });

  it("creates a new contact in Workspace A under RLS", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceAId}/contacts`,
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
      payload: {
        phoneE164: "+5511988881234",
        name: "Lead Carlos",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.contact).toBeDefined();
    expect(body.contact.phoneE164).toBe("+5511988881234");
    expect(body.contact.name).toBe("Lead Carlos");
  });

  it("blocks cross-tenant access to Workspace B contacts (fail-closed RLS)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceBId}/contacts`,
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });

    expect(res.statusCode).toBe(403);
  });
});
