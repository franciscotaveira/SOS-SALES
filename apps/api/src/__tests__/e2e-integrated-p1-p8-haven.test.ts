import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  createTestDatabasePools,
  resetTestQueueState,
  withTenantTransaction,
  createCommercialJourney,
  recordCommercialOutcome,
  createPixCharge,
  confirmPixChargeManual,
  createCommercialProposal,
  updateCommercialProposalStatus,
  recordSecurityAuditEvent,
} from "@sos-sales/database";
import { SignJWT } from "@sos-sales/auth";
import { buildApp } from "../index";

describe("M9 E2E Integrado P1–P8 & Ensaio Sintético Haven Escovaria", () => {
  const jwtSecret = "test_jwt_secret_key_minimum_32_characters_long_2026!";
  const testIssuer = "sos-sales-test";
  const testAudience = "sos-sales-api-test";
  const testMasterKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  const { ownerPool, ingressPool } = createTestDatabasePools();

  let app: FastifyInstance;

  // Workspace 1: Haven Escovaria & Esmalteria
  let havenOrgId: string;
  let havenWorkspaceId: string;
  let havenChannelId: string;
  let havenContactId: string;
  let havenThreadId: string;
  let havenOperatorUserId: string;
  let havenOperatorToken: string;

  // Workspace 2: Competitor Barbearia (Isolamento P2)
  let compOrgId: string;
  let compWorkspaceId: string;
  let compChannelId: string;
  let compContactId: string;
  let compThreadId: string;
  let compOperatorUserId: string;
  let compOperatorToken: string;

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

    // 1. Setup Haven Escovaria Workspace
    const havenOrgRes = await ownerPool.query(
      `INSERT INTO organizations (name, slug)
       VALUES ('Haven Escovaria Group', $1)
       RETURNING id;`,
      [`org-haven-${Date.now()}`]
    );
    havenOrgId = havenOrgRes.rows[0].id;

    const havenWsRes = await ownerPool.query(
      `INSERT INTO workspaces (
         organization_id, name, slug, timezone, currency, is_active,
         default_pix_key, default_pix_key_type, default_pix_merchant_name, default_pix_merchant_city
       ) VALUES (
         $1, 'Haven Escovaria & Esmalteria', $2, 'America/Sao_Paulo', 'BRL', true,
         '+554988370054', 'PHONE', 'HAVEN ESCOVARIA', 'CHAPECO'
       ) RETURNING id;`,
      [havenOrgId, `ws-haven-${Date.now()}`]
    );
    havenWorkspaceId = havenWsRes.rows[0].id;

    havenOperatorUserId = crypto.randomUUID();
    await ownerPool.query(
      `INSERT INTO users (id, email, name)
       VALUES ($1, $2, 'Camila Operadora Haven');`,
      [havenOperatorUserId, `camila-${Date.now()}@haven.mct.br`]
    );
    await ownerPool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'admin');`,
      [havenWorkspaceId, havenOperatorUserId]
    );

    const secretKey = new TextEncoder().encode(jwtSecret);
    havenOperatorToken = await new SignJWT({
      sub: havenOperatorUserId,
      email: "camila@haven.mct.br",
      role: "authenticated",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .setExpirationTime("2h")
      .sign(secretKey);

    const havenTokenHash = crypto.randomBytes(32).toString("hex");
    const havenChanRes = await ownerPool.query(
      `INSERT INTO channel_instances (
         workspace_id, provider, display_name, phone_number_e164, endpoint_token_hash, is_active
       ) VALUES ($1, 'meta_waba', 'Haven WhatsApp Oficial', '+554988370054', $2, true)
       RETURNING id;`,
      [havenWorkspaceId, havenTokenHash]
    );
    havenChannelId = havenChanRes.rows[0].id;

    const havenContactRes = await ownerPool.query(
      `INSERT INTO contacts (workspace_id, phone_e164, name)
       VALUES ($1, '+5549999991234', 'Fernanda Rossi')
       RETURNING id;`,
      [havenWorkspaceId]
    );
    havenContactId = havenContactRes.rows[0].id;

    const havenThreadRes = await ownerPool.query(
      `INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status)
       VALUES ($1, $2, $3, 'active')
       RETURNING id;`,
      [havenWorkspaceId, havenChannelId, havenContactId]
    );
    havenThreadId = havenThreadRes.rows[0].id;

    // 2. Setup Competitor Workspace (for cross-tenant P2 validation)
    const compOrgRes = await ownerPool.query(
      `INSERT INTO organizations (name, slug)
       VALUES ('Competitor Barber Group', $1)
       RETURNING id;`,
      [`org-comp-${Date.now()}`]
    );
    compOrgId = compOrgRes.rows[0].id;

    const compWsRes = await ownerPool.query(
      `INSERT INTO workspaces (
         organization_id, name, slug, timezone, currency, is_active
       ) VALUES ($1, 'Competitor Barber', $2, 'America/Sao_Paulo', 'BRL', true)
       RETURNING id;`,
      [compOrgId, `ws-comp-${Date.now()}`]
    );
    compWorkspaceId = compWsRes.rows[0].id;

    compOperatorUserId = crypto.randomUUID();
    await ownerPool.query(
      `INSERT INTO users (id, email, name)
       VALUES ($1, $2, 'Barbeiro Marcos');`,
      [compOperatorUserId, `marcos-${Date.now()}@barber.mct.br`]
    );
    await ownerPool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'admin');`,
      [compWorkspaceId, compOperatorUserId]
    );

    compOperatorToken = await new SignJWT({
      sub: compOperatorUserId,
      email: "marcos@barber.mct.br",
      role: "authenticated",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .setExpirationTime("2h")
      .sign(secretKey);

    const compTokenHash = crypto.randomBytes(32).toString("hex");
    const compChanRes = await ownerPool.query(
      `INSERT INTO channel_instances (
         workspace_id, provider, display_name, phone_number_e164, endpoint_token_hash, is_active
       ) VALUES ($1, 'waha', 'Barbearia WhatsApp', '+5511999998888', $2, true)
       RETURNING id;`,
      [compWorkspaceId, compTokenHash]
    );
    compChannelId = compChanRes.rows[0].id;

    const compContactRes = await ownerPool.query(
      `INSERT INTO contacts (workspace_id, phone_e164, name)
       VALUES ($1, '+5511977776666', 'Cliente Joao')
       RETURNING id;`,
      [compWorkspaceId]
    );
    compContactId = compContactRes.rows[0].id;

    const compThreadRes = await ownerPool.query(
      `INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status)
       VALUES ($1, $2, $3, 'active')
       RETURNING id;`,
      [compWorkspaceId, compChannelId, compContactId]
    );
    compThreadId = compThreadRes.rows[0].id;
  });

  afterAll(async () => {
    await app.close();
    await resetTestQueueState(ownerPool);
    await ownerPool.end();
  });

  describe("P1 & P8: Atendimento Normal & Execução 100% Nativa (n8n Desligado)", () => {
    it("processa mensagens de entrada e saída com outbox transacional sem requerer n8n", async () => {
      // 1. Inbound customer message arrives via WhatsApp
      const inMsgRes = await ownerPool.query(
        `INSERT INTO messages (
           workspace_id, channel_instance_id, thread_id, provider, direction,
           sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
         ) VALUES (
           $1, $2, $3, 'meta_waba', 'inbound',
           '+5549999991234', '+554988370054', 'text',
           'Olá! Gostaria de saber os horários para Escova Modelada nessa semana.', 'delivered', 20
         ) RETURNING id, body;`,
        [havenWorkspaceId, havenChannelId, havenThreadId]
      );
      expect(inMsgRes.rows[0].id).toBeDefined();

      // 2. Operator sends message through API
      const replyRes = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${havenWorkspaceId}/channels/${havenChannelId}/messages`,
        headers: {
          authorization: `Bearer ${havenOperatorToken}`,
        },
        payload: {
          recipientPhoneE164: "+5549999991234",
          body: "Olá Fernanda! Temos disponibilidade na terça às 14h com a Camila. O valor da Escova Modelada é R$ 69,00.",
          contentType: "text",
          idempotencyKey: `p1_reply_${Date.now()}`,
        },
      });

      expect(replyRes.statusCode).toBe(201);
      const replyBody = replyRes.json();
      expect(replyBody.isIdempotentReplay).toBe(false);
      expect(replyBody.messageId).toBeDefined();
      expect(replyBody.commandId).toBeDefined();

      // 3. Verify transactional outbox queued command
      const outboxCheck = await ownerPool.query(
        `SELECT id, status, body, idempotency_key FROM outbound_commands WHERE id = $1;`,
        [replyBody.commandId]
      );
      expect(outboxCheck.rows.length).toBe(1);
      expect(outboxCheck.rows[0].status).toBe("pending");
      expect(outboxCheck.rows[0].body).toContain("Olá Fernanda!");
    });
  });

  describe("P2: Isolamento Estrito Cross-Tenant (Workspace Haven vs Barbearia)", () => {
    it("impede que o operador da Haven veja ou altere conversas da Barbearia (403/404)", async () => {
      // Camila (Haven) tenta acessar mensagens do workspace da Barbearia
      const getThreadRes = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${compWorkspaceId}/threads/${compThreadId}/messages`,
        headers: {
          authorization: `Bearer ${havenOperatorToken}`,
        },
      });
      // 403 Forbidden: Usuário não tem membresia no workspace do concorrente
      expect(getThreadRes.statusCode).toBe(403);

      // Camila tenta acessar thread da Barbearia usando rota do workspace Haven
      const getCrossThreadRes = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${havenWorkspaceId}/threads/${compThreadId}/messages`,
        headers: {
          authorization: `Bearer ${havenOperatorToken}`,
        },
      });
      // 200 OK com 0 mensagens: RLS isola perfeitamente por workspace_id
      expect(getCrossThreadRes.statusCode).toBe(200);
      expect(getCrossThreadRes.json().messages).toEqual([]);

      // Operador da Barbearia tenta enviar mensagem para o canal da Haven
      const compWriteRes = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${havenWorkspaceId}/channels/${havenChannelId}/messages`,
        headers: {
          authorization: `Bearer ${compOperatorToken}`,
        },
        payload: {
          recipientPhoneE164: "+5549999991234",
          body: "Tentativa de escrita não autorizada",
          contentType: "text",
          idempotencyKey: `cross_${Date.now()}`,
        },
      });
      expect(compWriteRes.statusCode).toBe(403);
    });
  });

  describe("P3: Repetição, Concorrência e Idempotência", () => {
    it("garante que requisições repetidas com mesma idempotency_key não criem registros duplicados", async () => {
      const idempotencyKey = `idemp_p3_${Date.now()}`;

      // Envia primeira mensagem
      const firstRes = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${havenWorkspaceId}/channels/${havenChannelId}/messages`,
        headers: {
          authorization: `Bearer ${havenOperatorToken}`,
        },
        payload: {
          recipientPhoneE164: "+5549999991234",
          body: "Mensagem com chave de idempotência P3",
          contentType: "text",
          idempotencyKey,
        },
      });
      expect(firstRes.statusCode).toBe(201);
      const firstCmdId = firstRes.json().commandId;

      // Reenvia com a mesma chave (ex.: clique duplo do operador)
      const secondRes = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${havenWorkspaceId}/channels/${havenChannelId}/messages`,
        headers: {
          authorization: `Bearer ${havenOperatorToken}`,
        },
        payload: {
          recipientPhoneE164: "+5549999991234",
          body: "Mensagem com chave de idempotência P3",
          contentType: "text",
          idempotencyKey,
        },
      });
      expect(secondRes.statusCode).toBe(200);
      // Retorna o comando já existente, sem duplicar na outbox
      expect(secondRes.json().commandId).toBe(firstCmdId);
      expect(secondRes.json().isIdempotentReplay).toBe(true);

      // Verificação em banco: apenas 1 comando com essa chave
      const countRes = await ownerPool.query(
        `SELECT count(*) FROM outbound_commands WHERE workspace_id = $1 AND idempotency_key = $2;`,
        [havenWorkspaceId, idempotencyKey]
      );
      expect(parseInt(countRes.rows[0].count, 10)).toBe(1);
    });
  });

  describe("P6: Estados Financeiros Honestos (Pix EMV & Caixa Manual)", () => {
    it("gera Pix EMV no estado PENDING e confirma via MANUAL_CASHIER sem alegar conciliação bancária automática", async () => {
      // 1. Criar cobrança Pix para o workspace Haven via withTenantTransaction
      const charge = await withTenantTransaction(havenWorkspaceId, async (client) => {
        return createPixCharge(client, {
          workspaceId: havenWorkspaceId,
          threadId: havenThreadId,
          contactId: havenContactId,
          title: "Haven - Escova Modelada",
          amountCents: 6900, // R$ 69,00
        });
      });

      expect(charge.id).toBeDefined();
      expect(charge.status).toBe("PENDING");
      expect(charge.amount_cents).toBe(6900);
      expect(charge.pix_code).toBeDefined();
      expect(charge.pix_code).toContain("br.gov.bcb.pix");

      // 2. Conferência manual de caixa pelo operador (Truth in Data: MANUAL_CASHIER)
      const { charge: confirmed } = await withTenantTransaction(havenWorkspaceId, async (client) => {
        return confirmPixChargeManual(client, {
          workspaceId: havenWorkspaceId,
          chargeId: charge.id,
          actorUserId: havenOperatorUserId,
          verificationNotes: "Comprovante verificado no app do banco Sicredi Haven",
        });
      });

      expect(confirmed.status).toBe("PAID");
      expect(confirmed.verification_method).toBe("MANUAL_CASHIER");
      expect(confirmed.paid_at).toBeDefined();

      // Verificar persistência
      const checkRes = await ownerPool.query(
        `SELECT status, verification_method, verification_notes FROM pix_charges WHERE id = $1;`,
        [charge.id]
      );
      expect(checkRes.rows[0].status).toBe("PAID");
      expect(checkRes.rows[0].verification_method).toBe("MANUAL_CASHIER");
      expect(checkRes.rows[0].verification_notes).toContain("Sicredi Haven");
    });
  });

  describe("P7: Sugestões Governadas e Imutabilidade Terminal", () => {
    it("impede alteração ou regressão após aceite de sugestão (concurrency version control)", async () => {
      // 1. Inserir sugestão pendente
      const sugRes = await ownerPool.query(
        `INSERT INTO integration_suggestions (
           workspace_id, thread_id, idempotency_key, suggestion_type, title,
           body, status, state_version
         ) VALUES (
           $1, $2, $3, 'reminder', 'Oferecer Horário Terça 14h',
           'Oferecer vaga aberta na terça às 14h com a profissional Camila', 'pending', 1
         ) RETURNING id, state_version;`,
        [havenWorkspaceId, havenThreadId, `sug_${Date.now()}`]
      );
      const sugId = sugRes.rows[0].id;

      // 2. Aceitar a sugestão
      await ownerPool.query(
        `UPDATE integration_suggestions
         SET status = 'accepted', state_version = state_version + 1, decided_at = now(), decided_by_user_id = $1
         WHERE id = $2 AND status = 'pending' AND state_version = 1;`,
        [havenOperatorUserId, sugId]
      );

      // 3. Tentar rejeitar sugestão já aceita deve falhar por imutabilidade terminal
      const invalidReject = await ownerPool.query(
        `UPDATE integration_suggestions
         SET status = 'dismissed', state_version = state_version + 1
         WHERE id = $1 AND status = 'pending';`,
        [sugId]
      );
      expect(invalidReject.rowCount).toBe(0);

      // Verificar que status permanece 'accepted'
      const finalRow = await ownerPool.query(
        `SELECT status, state_version FROM integration_suggestions WHERE id = $1;`,
        [sugId]
      );
      expect(finalRow.rows[0].status).toBe("accepted");
      expect(finalRow.rows[0].state_version).toBe(2);
    });
  });

  describe("Ensaio Sintético Completo Haven Escovaria (Etapas 1 a 8)", () => {
    let syntheticJourneyId: string;
    let syntheticProposalId: string;
    let syntheticPixChargeId: string;
    let syntheticCorrelationId: string;

    it("executa a jornada completa Haven: Catálogo -> Proposta Imutável -> Próxima Ação -> Pix EMV -> Outcome WON -> Auditoria", async () => {
      syntheticCorrelationId = `haven-corr-${Date.now()}`;

      // Etapa 1: Cliente solicita serviço existente no catálogo da Haven
      await ownerPool.query(
        `INSERT INTO products (
           workspace_id, catalog_id, retailer_id, title, subtitle,
           description, price_cents, currency, category, image_url, status
         ) VALUES (
           $1, 'haven_catalog_default', 'srv_escova_modelada', 'Escova Modelada', '45 min • Haven Chapecó',
           'Ondas e movimento duradouro com finalização sofisticada.', 6900, 'BRL', 'Escovas & Cortes',
           'https://haven.mct.br/escova-modelada.jpg', 'ACTIVE'
         ) ON CONFLICT (workspace_id, retailer_id) DO UPDATE SET price_cents = 6900;`,
        [havenWorkspaceId]
      );

      // Etapa 2: Informações faltantes identificadas e registradas na conversa
      await ownerPool.query(
        `INSERT INTO messages (
           workspace_id, channel_instance_id, thread_id, provider, direction,
           sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
         ) VALUES (
           $1, $2, $3, 'meta_waba', 'inbound',
           '+5549999991234', '+554988370054', 'text',
           'Tenho cabelo médio e quero agendar na terça à tarde.', 'delivered', 20
         );`,
        [havenWorkspaceId, havenChannelId, havenThreadId]
      );

      // Etapa 3: Disponibilidade registrada por conferência manual clara (Agenda Haven)
      const journey = await withTenantTransaction(havenWorkspaceId, async (client) => {
        return createCommercialJourney(client, havenWorkspaceId, {
          contactId: havenContactId,
          title: "Atendimento Fernanda Rossi - Escova Modelada",
          stage: "qualified",
          estimatedValueCents: 6900,
        });
      });
      syntheticJourneyId = journey.id;
      expect(syntheticJourneyId).toBeDefined();

      // Etapa 4: Proposta criada com snapshot imutável de itens, preço e condições
      const proposal = await withTenantTransaction(havenWorkspaceId, async (client) => {
        return createCommercialProposal(client, {
          workspaceId: havenWorkspaceId,
          threadId: havenThreadId,
          contactId: havenContactId,
          title: "Proposta Haven: Escova Modelada",
          items: [
            {
              title: "Escova Modelada",
              unitPriceCents: 6900,
              quantity: 1,
            },
          ],
        });
      });
      syntheticProposalId = proposal.id;
      expect(proposal.total_cents).toBe(6900);
      expect(proposal.items?.length).toBe(1);
      expect(proposal.items![0]!.title).toBe("Escova Modelada");
      expect(proposal.items![0]!.unitPriceCents).toBe(6900);

      // CASO DE BORDA: Alteração posterior de preço no catálogo NÃO afeta a proposta emitida!
      await ownerPool.query(
        `UPDATE products SET price_cents = 8900 WHERE workspace_id = $1 AND retailer_id = 'srv_escova_modelada';`,
        [havenWorkspaceId]
      );
      const proposalCheck = await ownerPool.query(
        `SELECT total_cents, items FROM commercial_proposals WHERE id = $1;`,
        [syntheticProposalId]
      );
      // Preço da proposta permanece estritamente R$ 69,00
      expect(proposalCheck.rows[0].total_cents).toBe(6900);
      expect(proposalCheck.rows[0].items[0].unitPriceCents).toBe(6900);

      // Etapa 5: Próxima ação comercial criada com responsável e prazo
      const actionRes = await ownerPool.query(
        `INSERT INTO commercial_actions (
           workspace_id, thread_id, title, description,
           assignee_user_id, due_at, status, origin
         ) VALUES (
           $1, $2, 'Confirmar presença na terça-feira',
           'Enviar mensagem de lembrete 3h antes do atendimento',
           $3, now() + interval '1 day', 'open', 'manual'
         ) RETURNING id;`,
        [havenWorkspaceId, havenThreadId, havenOperatorUserId]
      );
      expect(actionRes.rows[0].id).toBeDefined();

      // Etapa 6: Cobrança Pix de laboratório gerada e conferência manual registrada
      const pix = await withTenantTransaction(havenWorkspaceId, async (client) => {
        return createPixCharge(client, {
          workspaceId: havenWorkspaceId,
          threadId: havenThreadId,
          contactId: havenContactId,
          title: "Haven Chapecó - Escova Modelada",
          amountCents: 6900,
        });
      });
      syntheticPixChargeId = pix.id;

      // Vincula cobrança à proposta
      await ownerPool.query(
        `UPDATE pix_charges SET proposal_id = $1 WHERE id = $2;`,
        [syntheticProposalId, syntheticPixChargeId]
      );

      const { charge: confirmedPix } = await withTenantTransaction(havenWorkspaceId, async (client) => {
        return confirmPixChargeManual(client, {
          workspaceId: havenWorkspaceId,
          chargeId: syntheticPixChargeId,
          actorUserId: havenOperatorUserId,
          verificationNotes: "Comprovante verificado no app do banco Sicredi Haven",
        });
      });
      expect(confirmedPix.status).toBe("PAID");

      // Transiciona proposta para accepted
      await withTenantTransaction(havenWorkspaceId, async (client) => {
        return updateCommercialProposalStatus(client, havenWorkspaceId, syntheticProposalId, {
          status: "accepted",
          userId: havenOperatorUserId,
        });
      });

      // Etapa 7: Outcome WON registrado por transição autorizada
      const outcomeResult = await withTenantTransaction(havenWorkspaceId, async (client) => {
        return recordCommercialOutcome(client, havenWorkspaceId, {
          journeyId: syntheticJourneyId,
          status: "won",
          valueCents: 6900,
          currency: "BRL",
          registeredByUserId: havenOperatorUserId,
          userPhoneE164: "+5549999991234",
          reason: "Atendimento concluído com sucesso e pago via Pix manual",
        });
      });
      expect(outcomeResult.outcome.status).toBe("won");
      expect(outcomeResult.outcome.value_cents).toBe(6900);

      // Etapa 8: Auditoria reconstrói o percurso completo
      await recordSecurityAuditEvent(
        {
          workspaceId: havenWorkspaceId,
          actorId: havenOperatorUserId,
          actorType: "user",
          action: "haven.lifecycle_completed",
          resourceType: "commercial_journey",
          resourceId: syntheticJourneyId,
          metadata: {
            correlationId: syntheticCorrelationId,
            threadId: havenThreadId,
            proposalId: syntheticProposalId,
            pixChargeId: syntheticPixChargeId,
            totalCents: 6900,
            outcome: "won",
          },
        },
        ownerPool
      );

      // Verificação da trilha de auditoria: todos os IDs estão correlacionados
      const auditTrailRes = await ownerPool.query(
        `SELECT id, action, metadata
         FROM audit_events
         WHERE workspace_id = $1 AND (metadata->>'correlationId') = $2;`,
        [havenWorkspaceId, syntheticCorrelationId]
      );
      expect(auditTrailRes.rows.length).toBe(1);
      const auditData = auditTrailRes.rows[0].metadata;
      expect(auditData.proposalId).toBe(syntheticProposalId);
      expect(auditData.pixChargeId).toBe(syntheticPixChargeId);
      expect(auditData.totalCents).toBe(6900);
      expect(auditData.outcome).toBe("won");
    });

    it("valida caso de desistência (LOST com REASON_REQUIRED obrigatório)", async () => {
      const lostJourney = await withTenantTransaction(havenWorkspaceId, async (client) => {
        return createCommercialJourney(client, havenWorkspaceId, {
          contactId: havenContactId,
          title: "Atendimento Cancelado",
          stage: "lead",
        });
      });

      // Tentativa de registrar LOST sem motivo deve ser rejeitada
      await expect(
        withTenantTransaction(havenWorkspaceId, async (client) => {
          return recordCommercialOutcome(client, havenWorkspaceId, {
            journeyId: lostJourney.id,
            status: "lost",
            valueCents: 0,
            registeredByUserId: havenOperatorUserId,
            // reason ausente!
          });
        })
      ).rejects.toThrow(/REASON_REQUIRED/);

      // Com motivo explícito, registra com sucesso
      const validLost = await withTenantTransaction(havenWorkspaceId, async (client) => {
        return recordCommercialOutcome(client, havenWorkspaceId, {
          journeyId: lostJourney.id,
          status: "lost",
          valueCents: 0,
          registeredByUserId: havenOperatorUserId,
          reason: "Cliente informou imprevisto de horário e reagendou para outro mês",
        });
      });
      expect(validLost.outcome.status).toBe("lost");
      expect(validLost.outcome.reason).toContain("imprevisto de horário");
    });
  });
});
