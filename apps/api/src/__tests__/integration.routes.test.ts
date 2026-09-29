import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  createTestDatabasePools,
  resetTestQueueState,
} from "@sos-sales/database";
import { SignJWT } from "@sos-sales/auth";
import { buildApp } from "../index";

describe("Integration Routes (F1.1 Radar Hardening & Security Gates)", () => {
  const jwtSecret = "test_jwt_secret_key_minimum_32_characters_long_2026!";
  const testIssuer = "sos-sales-test";
  const testAudience = "sos-sales-api-test";
  const testMasterKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  const { ownerPool, ingressPool } = createTestDatabasePools();

  let app: FastifyInstance;
  let workspaceAId: string;
  let workspaceBId: string;
  let operatorAId: string;
  let integrationUserId: string;

  let tokenOperatorA: string;
  let tokenIntegrationService: string;
  let tokenOperatorB: string;

  let contactAId: string;
  let channelAId: string;
  let threadAId: string;

  beforeAll(async () => {
    await resetTestQueueState(ownerPool);

    app = await buildApp({
      providerType: "local-jwt",
      jwtSecret,
      issuer: testIssuer,
      audience: testAudience,
      masterKeyHex: testMasterKey,
      ingressPool,
    });

    // 1. Provision Organization and Workspaces
    const orgRes = await ownerPool.query(`
      INSERT INTO organizations (name, slug)
      VALUES ('F1.1 Radar Route Org', $1)
      RETURNING id;
    `, [`radar-route-org-${crypto.randomUUID()}`]);
    const orgId = orgRes.rows[0].id;

    const wsARes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'Workspace Radar Alpha', $2)
      RETURNING id;
    `, [orgId, `radar-ws-a-${crypto.randomUUID()}`]);
    workspaceAId = wsARes.rows[0].id;

    const wsBRes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'Workspace Radar Beta', $2)
      RETURNING id;
    `, [orgId, `radar-ws-b-${crypto.randomUUID()}`]);
    workspaceBId = wsBRes.rows[0].id;

    // 2. Provision Users & Memberships
    operatorAId = crypto.randomUUID();
    integrationUserId = crypto.randomUUID();
    const operatorBId = crypto.randomUUID();

    await ownerPool.query(`
      INSERT INTO users (id, email, name)
      VALUES 
        ($1, $4, 'Radar Operator A'),
        ($2, $5, 'n8n Integration Service'),
        ($3, $6, 'Radar Operator B');
    `, [
      operatorAId,
      integrationUserId,
      operatorBId,
      `op-a-${crypto.randomUUID()}@mct.br`,
      `n8n-svc-${crypto.randomUUID()}@mct.br`,
      `op-b-${crypto.randomUUID()}@mct.br`,
    ]);

    await ownerPool.query(`
      INSERT INTO workspace_memberships (workspace_id, user_id, role)
      VALUES 
        ($1, $2, 'operator'),
        ($1, $3, 'integration_service'),
        ($4, $5, 'operator');
    `, [workspaceAId, operatorAId, integrationUserId, workspaceBId, operatorBId]);

    // 3. Provision Channel & Contact & Thread
    const chanRes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164, endpoint_token_hash, is_active
      ) VALUES (
        $1, 'meta_waba', 'Canal Radar WABA', '+5549988880001',
        $2, true
      ) RETURNING id;
    `, [workspaceAId, crypto.createHash("sha256").update(crypto.randomUUID()).digest("hex")]);
    channelAId = chanRes.rows[0].id;

    const contactRes = await ownerPool.query(`
      INSERT INTO contacts (workspace_id, phone_e164, name, opt_out)
      VALUES ($1, '+5549988880002', 'Contato Radar Lead', false)
      RETURNING id;
    `, [workspaceAId]);
    contactAId = contactRes.rows[0].id;

    const threadRes = await ownerPool.query(`
      INSERT INTO commercial_threads (
        workspace_id, channel_instance_id, contact_id, status, last_message_at
      ) VALUES ($1, $2, $3, 'active', now() - interval '3 hours')
      RETURNING id;
    `, [workspaceAId, channelAId, contactAId]);
    threadAId = threadRes.rows[0].id;

    // Add a message
    await ownerPool.query(`
      INSERT INTO messages (
        workspace_id, channel_instance_id, thread_id, provider, direction,
        sender_e164, recipient_e164, content_type, body, created_at
      ) VALUES (
        $1, $2, $3, 'meta_waba', 'inbound',
        '+5549988880002', '+5549988880001', 'text',
        'Olá, quero proposta para consultoria', now() - interval '3 hours'
      );
    `, [workspaceAId, channelAId, threadAId]);

    // 4. Issue JWTs
    tokenOperatorA = await new SignJWT({
      sub: operatorAId,
      workspace_id: workspaceAId,
      role: "operator",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .setExpirationTime("2h")
      .sign(new TextEncoder().encode(jwtSecret));

    tokenIntegrationService = await new SignJWT({
      sub: integrationUserId,
      workspace_id: workspaceAId,
      role: "integration_service",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .setExpirationTime("2h")
      .sign(new TextEncoder().encode(jwtSecret));

    tokenOperatorB = await new SignJWT({
      sub: operatorBId,
      workspace_id: workspaceBId,
      role: "operator",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .setExpirationTime("2h")
      .sign(new TextEncoder().encode(jwtSecret));
  });

  afterAll(async () => {
    await app.close();
    await ownerPool.end();
  });

  describe("1. Semantic Idempotency (200 Replay vs 409 Conflict)", () => {
    it("returns 200/201 with existing record for same key and identical payload", async () => {
      const idempotencyKey = `route-idem-${crypto.randomUUID()}`;

      const res1 = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: {
          idempotencyKey,
          source: "n8n",
          threadId: threadAId,
          contactId: contactAId,
          suggestionType: "follow_up",
          title: "Follow-up Semântico",
          body: "Cliente parou no meio da negociação.",
          draftMessage: "Olá! Vamos retomar?",
          priority: "high",
        },
      });

      expect(res1.statusCode).toBe(201);
      const body1 = res1.json();
      expect(body1.created).toBe(true);

      // Repeat with same payload
      const res2 = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: {
          idempotencyKey,
          source: "n8n",
          threadId: threadAId,
          contactId: contactAId,
          suggestionType: "follow_up",
          title: "Follow-up Semântico",
          body: "Cliente parou no meio da negociação.",
          draftMessage: "Olá! Vamos retomar?",
          priority: "high",
        },
      });

      expect(res2.statusCode).toBe(200);
      const body2 = res2.json();
      expect(body2.created).toBe(false);
      expect(body2.id).toBe(body1.id);
    });

    it("returns 409 Conflict when same idempotencyKey is used with different logical payload", async () => {
      const idempotencyKey = `route-conflict-${crypto.randomUUID()}`;

      await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: {
          idempotencyKey,
          title: "Título A",
          body: "Corpo A",
        },
      });

      // Different body with same key -> 409
      const resConflict = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: {
          idempotencyKey,
          title: "Título B Modificado",
          body: "Corpo B Modificado",
        },
      });

      expect(resConflict.statusCode).toBe(409);
      expect(resConflict.json().title).toBe("Idempotency Conflict");
    });
  });

  describe("2. Comprehensive Negative Authorization Matrix for integration_service (All 403 Forbidden)", () => {
    it("DENIES outbound message dispatch (POST /messages -> 403)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelAId}/messages`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: {
          recipientE164: "+5549988880002",
          body: "Tentativa de envio direto não autorizada pelo n8n",
          idempotencyKey: `deny-send-${crypto.randomUUID()}`,
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it("DENIES commercial journey creation (POST /journeys -> 403)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/journeys`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: {
          contactId: contactAId,
          threadId: threadAId,
          title: "Tentativa de Criar Jornada",
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it("DENIES commercial outcome registration (POST /journeys/:id/outcomes -> 403)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/journeys/${crypto.randomUUID()}/outcomes`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: { status: "won", valueCents: 50000 },
      });
      expect(res.statusCode).toBe(403);
    });

    it("DENIES thread direct outcome registration (POST /threads/:id/outcomes -> 403)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/threads/${threadAId}/outcomes`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: { status: "won", valueCents: 50000, currency: "BRL" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("DENIES pix charge creation (POST /threads/:id/pix-charges -> 403)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/threads/${threadAId}/pix-charges`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: { contactId: contactAId, title: "Tentativa Pix", amountCents: 5000 },
      });
      expect(res.statusCode).toBe(403);
    });

    it("DENIES pix manual payment confirmation (POST /pix-charges/:id/confirm-payment -> 403)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/pix-charges/${crypto.randomUUID()}/confirm-payment`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("DENIES conversion events audit/dispatch (GET /conversions -> 403)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceAId}/conversions`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("DENIES suggestion decision (PATCH /suggestions/:id -> 403)", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: { idempotencyKey: `decide-deny-${crypto.randomUUID()}`, title: "Para teste", body: "Corpo" },
      });
      const sugId = createRes.json().id;

      const res = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions/${sugId}`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: { status: "accepted", stateVersion: 1 },
      });
      expect(res.statusCode).toBe(403);
    });

    it("DENIES workspace details view (GET /workspaces/:id -> 403)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceAId}`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("DENIES workspace settings update (PATCH /workspaces/:id -> 403)", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceAId}`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: { name: "Tentativa de renomear" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("DENIES commercial threads list and update (GET/PATCH /threads -> 403)", async () => {
      const resList = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceAId}/threads`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
      });
      expect(resList.statusCode).toBe(403);

      const resPatch = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceAId}/threads/${threadAId}`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: { status: "closed" },
      });
      expect(resPatch.statusCode).toBe(403);
    });
  });

  describe("3. Query Parameters Validation (RFC 7807 400 Bad Request)", () => {
    it("returns 400 Bad Request when candidates query parameters violate schema", async () => {
      // Invalid minHoursSinceLastMessage (negative or non-numeric)
      const res = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceAId}/integrations/candidates?minHoursSinceLastMessage=-5`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().title).toBe("Bad Request");
    });

    it("returns 400 Bad Request when limit exceeds maximum limit (100)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceAId}/integrations/candidates?limit=500`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().title).toBe("Bad Request");
    });
  });

  describe("4. Transactional Origin Revalidation on Decision", () => {
    it("returns 409 Conflict when a new message arrived after snapshot", async () => {
      // Create new contact and thread
      const cRes = await ownerPool.query(`
        INSERT INTO contacts (workspace_id, phone_e164, name, opt_out)
        VALUES ($1, '+5549988880099', 'Lead Stale', false)
        RETURNING id;
      `, [workspaceAId]);
      const newContactId = cRes.rows[0].id;

      const tRes = await ownerPool.query(`
        INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status, last_message_at)
        VALUES ($1, $2, $3, 'active', now() - interval '2 hours')
        RETURNING id;
      `, [workspaceAId, channelAId, newContactId]);
      const newThreadId = tRes.rows[0].id;

      const mRes = await ownerPool.query(`
        INSERT INTO messages (workspace_id, channel_instance_id, thread_id, provider, direction, sender_e164, recipient_e164, content_type, body, created_at)
        VALUES ($1, $2, $3, 'meta_waba', 'inbound', '+5549988880099', '+5549988880001', 'text', 'Mensagem 1', now() - interval '2 hours')
        RETURNING id, created_at;
      `, [workspaceAId, channelAId, newThreadId]);
      const baseMsg = mRes.rows[0];

      // Create suggestion
      const createRes = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: {
          idempotencyKey: `stale-api-${crypto.randomUUID()}`,
          threadId: newThreadId,
          contactId: newContactId,
          title: "Sugestão com snapshot",
          body: "Corpo",
          draftMessage: "Rascunho",
          originSnapshot: {
            threadId: newThreadId,
            lastMessageAt: baseMsg.created_at.toISOString(),
            lastMessageId: baseMsg.id,
            threadStatus: "active",
          },
        },
      });
      const suggestionId = createRes.json().id;

      // Customer sends a new message!
      await ownerPool.query(`
        INSERT INTO messages (workspace_id, channel_instance_id, thread_id, provider, direction, sender_e164, recipient_e164, content_type, body, created_at)
        VALUES ($1, $2, $3, 'meta_waba', 'inbound', '+5549988880099', '+5549988880001', 'text', 'Nova mensagem superveniente', now());
      `, [workspaceAId, channelAId, newThreadId]);

      await ownerPool.query(`
        UPDATE commercial_threads SET last_message_at = now() WHERE id = $1;
      `, [newThreadId]);

      // Operator attempts to accept -> must return 409 Conflict
      const decideRes = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions/${suggestionId}`,
        headers: { authorization: `Bearer ${tokenOperatorA}` },
        payload: { status: "accepted", stateVersion: 1 },
      });

      expect(decideRes.statusCode).toBe(409);
      expect(decideRes.json().code).toBe("ORIGIN_STALE_NEW_MESSAGE");
    });

    it("returns 409 Conflict when suggestion has expired", async () => {
      const expiredPastTime = new Date(Date.now() - 60_000).toISOString();

      const createRes = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: {
          idempotencyKey: `expired-api-${crypto.randomUUID()}`,
          title: "Sugestão Vencida",
          body: "Corpo",
          expiresAt: expiredPastTime,
        },
      });
      const suggestionId = createRes.json().id;

      const decideRes = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions/${suggestionId}`,
        headers: { authorization: `Bearer ${tokenOperatorA}` },
        payload: { status: "accepted", stateVersion: 1 },
      });

      expect(decideRes.statusCode).toBe(409);
      expect(decideRes.json().code).toBe("SUGGESTION_EXPIRED");
    });
  });

  describe("5. Invariant: Accepting a suggestion PRE-FILLS composer draft only, NEVER dispatches", () => {
    it("returns draftMessage on accept and inserts ZERO outbound messages in queue", async () => {
      // Create fresh valid thread
      const cRes = await ownerPool.query(`
        INSERT INTO contacts (workspace_id, phone_e164, name, opt_out)
        VALUES ($1, '+5549988880055', 'Lead Draft Invariant', false)
        RETURNING id;
      `, [workspaceAId]);
      const contactId = cRes.rows[0].id;

      const tRes = await ownerPool.query(`
        INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status, last_message_at)
        VALUES ($1, $2, $3, 'active', now() - interval '1 hour')
        RETURNING id;
      `, [workspaceAId, channelAId, contactId]);
      const threadId = tRes.rows[0].id;

      const mRes = await ownerPool.query(`
        INSERT INTO messages (workspace_id, channel_instance_id, thread_id, provider, direction, sender_e164, recipient_e164, content_type, body, created_at)
        VALUES ($1, $2, $3, 'meta_waba', 'inbound', '+5549988880055', '+5549988880001', 'text', 'Oi', now() - interval '1 hour')
        RETURNING id, created_at;
      `, [workspaceAId, channelAId, threadId]);

      const createRes = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: {
          idempotencyKey: `draft-inv-${crypto.randomUUID()}`,
          threadId,
          contactId,
          title: "Sugestão Draft Only",
          body: "Corpo",
          draftMessage: "Mensagem pronta para composer humano",
          originSnapshot: {
            threadId,
            lastMessageAt: mRes.rows[0].created_at.toISOString(),
            lastMessageId: mRes.rows[0].id,
            threadStatus: "active",
          },
        },
      });
      const suggestionId = createRes.json().id;

      // Operator accepts
      const patchRes = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions/${suggestionId}`,
        headers: { authorization: `Bearer ${tokenOperatorA}` },
        payload: { status: "accepted", stateVersion: 1 },
      });

      expect(patchRes.statusCode).toBe(200);
      const data = patchRes.json();
      expect(data.status).toBe("accepted");
      expect(data.draftMessage).toBe("Mensagem pronta para composer humano");

      // Verify that NO outbound commands were generated
      const outboxCheck = await ownerPool.query(`
        SELECT COUNT(*) as count FROM outbound_commands WHERE workspace_id = $1;
      `, [workspaceAId]);
      expect(parseInt(outboxCheck.rows[0].count, 10)).toBe(0);
    });
  });

  describe("6. Multi-Tenant Cross-Access Prevention", () => {
    it("DENIES operator of Workspace B from accessing Workspace A suggestions", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: { authorization: `Bearer ${tokenOperatorB}` },
      });

      expect(res.statusCode).toBe(403);
    });
  });
});
