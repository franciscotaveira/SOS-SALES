import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { createTestDatabasePools } from "@sos-sales/database";
import { SignJWT } from "@sos-sales/auth";
import { buildApp } from "../index";
import type { FastifyInstance } from "fastify";

describe("Outbound Messages Routes Integration (CH-11)", () => {
  const jwtSecret = "test_jwt_secret_key_minimum_32_characters_long_2026!";
  const testIssuer = "sos-sales-test";
  const testAudience = "sos-sales-api-test";

  const { appPool, ownerPool, workerPool } = createTestDatabasePools();

  let app: FastifyInstance;

  let workspaceAId: string;
  let workspaceBId: string;
  let orgId: string;

  let channelAId: string;
  let channelBId: string;
  let channelInactiveId: string;

  const userOperatorId = crypto.randomUUID();
  const userAnalystId = crypto.randomUUID();

  let operatorToken: string;
  let analystToken: string;

  beforeAll(async () => {
    // 1. Build Fastify app instance
    app = await buildApp({
      providerType: "local-jwt",
      jwtSecret,
      issuer: testIssuer,
      audience: testAudience,
    });

    // 2. Provision Organizations and Workspaces
    const orgRes = await ownerPool.query(`
      INSERT INTO organizations (name, slug)
      VALUES ('API Route Test Org', $1)
      RETURNING id;
    `, [`org-api-${Date.now()}`]);
    orgId = orgRes.rows[0].id;

    const wsARes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'Workspace Alpha', $2)
      RETURNING id;
    `, [orgId, `ws-alpha-${Date.now()}`]);
    workspaceAId = wsARes.rows[0].id;

    const wsBRes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'Workspace Beta', $2)
      RETURNING id;
    `, [orgId, `ws-beta-${Date.now()}`]);
    workspaceBId = wsBRes.rows[0].id;

    // 3. Provision Users and Memberships
    await ownerPool.query(`
      INSERT INTO users (id, email, name)
      VALUES 
        ($1, $3, 'Operator User'),
        ($2, $4, 'Analyst User')
      ON CONFLICT (id) DO NOTHING;
    `, [
      userOperatorId,
      userAnalystId,
      `op-${Date.now()}@mct.br`,
      `an-${Date.now()}@mct.br`,
    ]);

    await ownerPool.query(`
      INSERT INTO workspace_memberships (workspace_id, user_id, role)
      VALUES 
        ($1, $2, 'operator'),
        ($1, $3, 'analyst')
      ON CONFLICT DO NOTHING;
    `, [workspaceAId, userOperatorId, userAnalystId]);

    // 4. Provision Channel Instances:
    // Channel A (Active, in Workspace A)
    const tokenHashA = crypto.createHash("sha256").update(`token-a-${Date.now()}`).digest("hex");
    const chanARes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164,
        endpoint_token_hash, is_active
      ) VALUES ($1, 'meta_waba', 'Alpha Line', '+5511999991111', $2, true)
      RETURNING id;
    `, [workspaceAId, tokenHashA]);
    channelAId = chanARes.rows[0].id;

    // Channel B (Active, in Workspace B - Cross Tenant)
    const tokenHashB = crypto.createHash("sha256").update(`token-b-${Date.now()}`).digest("hex");
    const chanBRes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164,
        endpoint_token_hash, is_active
      ) VALUES ($1, 'meta_waba', 'Beta Line', '+5511999992222', $2, true)
      RETURNING id;
    `, [workspaceBId, tokenHashB]);
    channelBId = chanBRes.rows[0].id;

    // Channel Inactive (Inactive, in Workspace A)
    const tokenHashInact = crypto.createHash("sha256").update(`token-inact-${Date.now()}`).digest("hex");
    const chanInactRes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164,
        endpoint_token_hash, is_active
      ) VALUES ($1, 'meta_waba', 'Inactive Line', '+5511999993333', $2, false)
      RETURNING id;
    `, [workspaceAId, tokenHashInact]);
    channelInactiveId = chanInactRes.rows[0].id;

    // 5. Generate Signed JWTs
    const secretKey = new TextEncoder().encode(jwtSecret);

    operatorToken = await new SignJWT({
      email: "operator@mct.br",
      role: "operator",
      workspaceId: workspaceAId,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userOperatorId)
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .setExpirationTime("1h")
      .sign(secretKey);

    analystToken = await new SignJWT({
      email: "analyst@mct.br",
      role: "analyst",
      workspaceId: workspaceAId,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userAnalystId)
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .setExpirationTime("1h")
      .sign(secretKey);
  });

  afterAll(async () => {
    await app.close();
    await ownerPool.end();
    await appPool.end();
    await workerPool.end();
  });

  describe("1. Successful Outbound Creation and Replay (HTTP 201 and 200)", () => {
    it("should return HTTP 201 Created on new outbound request", async () => {
      const idempotencyKey = `http-create-${Date.now()}`;
      const payload = {
        recipientPhoneE164: "+5511999994444",
        contentType: "text",
        body: "Hello from HTTP test",
        idempotencyKey,
      };

      const response = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelAId}/messages`,
        headers: {
          authorization: `Bearer ${operatorToken}`,
          "x-workspace-id": workspaceAId,
        },
        payload,
      });

      expect(response.statusCode).toBe(201);
      const data = response.json();
      expect(data.commandId).toBeDefined();
      expect(data.messageId).toBeDefined();
      expect(data.threadId).toBeDefined();
      expect(data.contactId).toBeDefined();
      expect(data.isIdempotentReplay).toBe(false);
      expect(data.status).toBe("pending");
      expect(data.deliveryStatus).toBe("queued");
    });

    it("should return HTTP 200 OK on identical replay with same idempotencyKey", async () => {
      const idempotencyKey = `http-replay-${Date.now()}`;
      const payload = {
        recipientPhoneE164: "+5511999995555",
        contentType: "text",
        body: "Identical replay body",
        idempotencyKey,
      };

      // 1. First invocation (201)
      const res1 = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelAId}/messages`,
        headers: {
          authorization: `Bearer ${operatorToken}`,
          "x-workspace-id": workspaceAId,
        },
        payload,
      });
      expect(res1.statusCode).toBe(201);
      const first = res1.json();

      // 2. Second invocation (200)
      const res2 = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelAId}/messages`,
        headers: {
          authorization: `Bearer ${operatorToken}`,
          "x-workspace-id": workspaceAId,
        },
        payload,
      });
      expect(res2.statusCode).toBe(200);
      const replay = res2.json();

      expect(replay.isIdempotentReplay).toBe(true);
      expect(replay.commandId).toBe(first.commandId);
      expect(replay.messageId).toBe(first.messageId);
      expect(replay.contactId).toBe(first.contactId);
      expect(replay.threadId).toBe(first.threadId);
    });

    it("should return HTTP 409 Conflict when reusing idempotencyKey with different body", async () => {
      const idempotencyKey = `http-conflict-${Date.now()}`;

      // 1. First invocation
      await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelAId}/messages`,
        headers: {
          authorization: `Bearer ${operatorToken}`,
          "x-workspace-id": workspaceAId,
        },
        payload: {
          recipientPhoneE164: "+5511999996666",
          contentType: "text",
          body: "Original body",
          idempotencyKey,
        },
      });

      // 2. Second invocation with different body
      const resConflict = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelAId}/messages`,
        headers: {
          authorization: `Bearer ${operatorToken}`,
          "x-workspace-id": workspaceAId,
        },
        payload: {
          recipientPhoneE164: "+5511999996666",
          contentType: "text",
          body: "Modified conflicting body",
          idempotencyKey,
        },
      });

      expect(resConflict.statusCode).toBe(409);
      const errorBody = resConflict.json();
      expect(errorBody.title).toBe("Conflict");
      expect(errorBody.detail).toMatch(/Idempotency key/);
    });
  });

  describe("2. Security Boundary & Strict Schema", () => {
    it("should return HTTP 400 Bad Request if injected authority fields are in the body (.strict())", async () => {
      const payloadWithInjectedAuthority = {
        recipientPhoneE164: "+5511999997777",
        contentType: "text",
        body: "Malicious injection attempt",
        idempotencyKey: `exploit-${Date.now()}`,
        workspaceId: crypto.randomUUID(), // Unauthorized authority field!
        role: "owner",                   // Unauthorized authority field!
        actorId: crypto.randomUUID(),    // Unauthorized authority field!
      };

      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelAId}/messages`,
        headers: {
          authorization: `Bearer ${operatorToken}`,
          "x-workspace-id": workspaceAId,
        },
        payload: payloadWithInjectedAuthority,
      });

      expect(res.statusCode).toBe(400);
      const errorBody = res.json();
      expect(errorBody.title).toBe("Bad Request");
      expect(errorBody.detail).toMatch(/unrecognized/i);
    });

    it("should return HTTP 400 Bad Request on SSRF mediaUrl attempt", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelAId}/messages`,
        headers: {
          authorization: `Bearer ${operatorToken}`,
          "x-workspace-id": workspaceAId,
        },
        payload: {
          recipientPhoneE164: "+5511999998888",
          contentType: "image",
          body: "SSRF image",
          mediaUrl: "https://192.168.1.1/exploit.jpg",
          idempotencyKey: `ssrf-${Date.now()}`,
        },
      });

      expect(res.statusCode).toBe(400);
      const errorBody = res.json();
      expect(errorBody.title).toBe("Bad Request");
      expect(errorBody.detail).toMatch(/SSRF protection rejected mediaUrl/);
    });

    it("should return HTTP 403 Forbidden for analyst role lacking cockpit:send_message", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelAId}/messages`,
        headers: {
          authorization: `Bearer ${analystToken}`,
          "x-workspace-id": workspaceAId,
        },
        payload: {
          recipientPhoneE164: "+5511999999999",
          contentType: "text",
          body: "Analyst attempt",
          idempotencyKey: `analyst-${Date.now()}`,
        },
      });

      expect(res.statusCode).toBe(403);
      const errorBody = res.json();
      expect(errorBody.title).toBe("Forbidden");
      expect(errorBody.detail).toMatch(/does not possess required permission 'cockpit:send_message'/);
    });

    it("should return HTTP 404 Not Found indistinguishable for cross-tenant channelInstanceId", async () => {
      // Channel B belongs to Workspace B, but operator is sending under Workspace A
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelBId}/messages`,
        headers: {
          authorization: `Bearer ${operatorToken}`,
          "x-workspace-id": workspaceAId,
        },
        payload: {
          recipientPhoneE164: "+5511999990000",
          contentType: "text",
          body: "Cross-tenant probe",
          idempotencyKey: `xtenant-${Date.now()}`,
        },
      });

      expect(res.statusCode).toBe(404);
      const errorBody = res.json();
      expect(errorBody.title).toBe("Not Found");
      expect(errorBody.detail).toMatch(/not found/i);
    });

    it("should return HTTP 422 Unprocessable Entity for inactive channel", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelInactiveId}/messages`,
        headers: {
          authorization: `Bearer ${operatorToken}`,
          "x-workspace-id": workspaceAId,
        },
        payload: {
          recipientPhoneE164: "+5511999990001",
          contentType: "text",
          body: "Inactive channel test",
          idempotencyKey: `inact-${Date.now()}`,
        },
      });

      expect(res.statusCode).toBe(422);
      const errorBody = res.json();
      expect(errorBody.title).toBe("Unprocessable Entity");
      expect(errorBody.detail).toMatch(/is marked as inactive/);
    });
  });
});
