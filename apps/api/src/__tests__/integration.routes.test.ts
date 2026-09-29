import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  createTestDatabasePools,
  resetTestQueueState,
} from "@sos-sales/database";
import { SignJWT } from "@sos-sales/auth";
import { buildApp } from "../index";

describe("Integration Routes (F1 Radar & RBAC Validation)", () => {
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
      VALUES ('F1 Radar Route Org', $1)
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
      INSERT INTO contacts (workspace_id, phone_e164, name)
      VALUES ($1, '+5549988880002', 'Contato Radar Lead')
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
        'Olá, quero contratar', now() - interval '3 hours'
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

  describe("1. integration_service Permissions & Isolation", () => {
    it("allows integration_service to read candidate snapshot", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceAId}/integrations/candidates`,
        headers: {
          authorization: `Bearer ${tokenIntegrationService}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items).toBeDefined();
      expect(body.total).toBeGreaterThanOrEqual(1);
    });

    it("allows integration_service to create a suggestion idempotently", async () => {
      const idempotencyKey = `route-test-${crypto.randomUUID()}`;

      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: {
          authorization: `Bearer ${tokenIntegrationService}`,
        },
        payload: {
          idempotencyKey,
          source: "n8n",
          threadId: threadAId,
          contactId: contactAId,
          suggestionType: "follow_up",
          title: "Follow-up Sugerido",
          body: "Cliente parou no meio da negociação.",
          draftMessage: "Olá! Vamos retomar o alinhamento da proposta?",
          priority: "high",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBeDefined();
      expect(body.created).toBe(true);

      // Repeat with same key -> 200 with existing row
      const repeatRes = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: {
          authorization: `Bearer ${tokenIntegrationService}`,
        },
        payload: {
          idempotencyKey,
          title: "Ignored title",
          body: "Ignored body",
        },
      });

      expect(repeatRes.statusCode).toBe(200);
      const repeatBody = repeatRes.json();
      expect(repeatBody.created).toBe(false);
      expect(repeatBody.id).toBe(body.id);
    });

    it("DENIES integration_service from sending outbound messages (cockpit:send_message revoked)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelAId}/messages`,
        headers: {
          authorization: `Bearer ${tokenIntegrationService}`,
        },
        payload: {
          recipientE164: "+5549988880002",
          body: "Tentativa de envio direto não autorizada pelo n8n",
          idempotencyKey: `deny-send-${crypto.randomUUID()}`,
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it("DENIES integration_service from deciding suggestions (only operators/admins can decide)", async () => {
      // First create a suggestion
      const createRes = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: {
          authorization: `Bearer ${tokenIntegrationService}`,
        },
        payload: {
          idempotencyKey: `decide-deny-${crypto.randomUUID()}`,
          title: "Sugestão para teste de negação",
          body: "Corpo do teste",
        },
      });
      const suggestionId = createRes.json().id;

      // integration_service tries to PATCH decision
      const patchRes = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions/${suggestionId}`,
        headers: {
          authorization: `Bearer ${tokenIntegrationService}`,
        },
        payload: {
          status: "accepted",
          stateVersion: 1,
        },
      });

      expect(patchRes.statusCode).toBe(403);
    });

    it("DENIES integration_service from registering commercial outcomes (outcome:register revoked)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/threads/${threadAId}/outcomes`,
        headers: {
          authorization: `Bearer ${tokenIntegrationService}`,
        },
        payload: {
          status: "won",
          valueCents: 50000,
          currency: "BRL",
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it("DENIES integration_service from creating pix charges (cockpit:send_message revoked)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/threads/${threadAId}/pix-charges`,
        headers: {
          authorization: `Bearer ${tokenIntegrationService}`,
        },
        payload: {
          contactId: contactAId,
          title: "Tentativa Pix via n8n",
          amountCents: 5000,
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it("DENIES integration_service from confirming pix payments (outcome:register revoked)", async () => {
      const dummyChargeId = crypto.randomUUID();
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/pix-charges/${dummyChargeId}/confirm-payment`,
        headers: {
          authorization: `Bearer ${tokenIntegrationService}`,
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it("REJECTS pix charge creation when workspace has no default_pix_key configured (HTTP 422)", async () => {
      // workspaceAId has no default_pix_key configured yet
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/threads/${threadAId}/pix-charges`,
        headers: {
          authorization: `Bearer ${tokenOperatorA}`,
        },
        payload: {
          contactId: contactAId,
          title: "Cobrança Pix Teste",
          amountCents: 5000,
        },
      });

      expect(res.statusCode).toBe(422);
      expect(res.json().title).toBe("Chave Pix Não Configurada");
    });
  });

  describe("2. Operator Workflow (List, Count, Decide)", () => {
    it("allows operator to get pending count and list suggestions", async () => {
      const countRes = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions/count`,
        headers: {
          authorization: `Bearer ${tokenOperatorA}`,
        },
      });

      expect(countRes.statusCode).toBe(200);
      expect(countRes.json().pendingCount).toBeGreaterThanOrEqual(1);

      const listRes = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: {
          authorization: `Bearer ${tokenOperatorA}`,
        },
      });

      expect(listRes.statusCode).toBe(200);
      expect(listRes.json().items.length).toBeGreaterThanOrEqual(1);
    });

    it("allows operator to accept a suggestion and pre-fill draft", async () => {
      // Create suggestion
      const createRes = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: {
          authorization: `Bearer ${tokenIntegrationService}`,
        },
        payload: {
          idempotencyKey: `op-accept-${crypto.randomUUID()}`,
          title: "Sugestão para operador aceitar",
          body: "Corpo aceito",
          draftMessage: "Texto pré-formatado para composer",
        },
      });
      const suggestion = createRes.json();

      // Operator accepts
      const patchRes = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions/${suggestion.id}`,
        headers: {
          authorization: `Bearer ${tokenOperatorA}`,
        },
        payload: {
          status: "accepted",
          stateVersion: suggestion.stateVersion,
        },
      });

      expect(patchRes.statusCode).toBe(200);
      const body = patchRes.json();
      expect(body.status).toBe("accepted");
      expect(body.draftMessage).toBe("Texto pré-formatado para composer");
    });
  });

  describe("3. Multi-Tenant Cross-Access Prevention", () => {
    it("DENIES operator of Workspace B from accessing Workspace A suggestions", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: {
          authorization: `Bearer ${tokenOperatorB}`,
        },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe("4. Commercial Journey & Outcome RBAC Lockdown (E1.1)", () => {
    it("DENIES integration_service from creating a commercial journey directly (POST /journeys -> 403)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/journeys`,
        headers: {
          authorization: `Bearer ${tokenIntegrationService}`,
        },
        payload: {
          contactId: contactAId,
          threadId: threadAId,
          title: "Tentativa Não Autorizada de Criar Jornada",
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().title).toBe("Forbidden");
    });

    it("DENIES integration_service from recording commercial outcome (POST /journeys/:id/outcomes -> 403)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/journeys/${crypto.randomUUID()}/outcomes`,
        headers: {
          authorization: `Bearer ${tokenIntegrationService}`,
        },
        payload: {
          status: "won",
          valueCents: 10000,
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().title).toBe("Forbidden");
    });

    it("ALLOWS human operator to create a commercial journey (POST /journeys -> 201)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/journeys`,
        headers: {
          authorization: `Bearer ${tokenOperatorA}`,
        },
        payload: {
          contactId: contactAId,
          threadId: threadAId,
          title: "Jornada Criada pelo Operador Humano",
          stage: "proposal",
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().title).toBe("Jornada Criada pelo Operador Humano");
    });
  });
});
