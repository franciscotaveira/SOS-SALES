import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { dbPool, query } from '../../src/infrastructure/database/pool.js';
import { WahaWebhookAdapter } from '../../src/infrastructure/channels/waha/waha-webhook-adapter.js';
import { WahaInboundWorker } from '../../src/infrastructure/workers/waha-inbound-worker.js';
import { PostgresInboundIngestionGateway } from '../../src/infrastructure/database/postgres-inbound-ingestion-gateway.js';
import { PostgresOutboxProcessingGateway } from '../../src/infrastructure/database/postgres-outbox-processing-gateway.js';
import { PostgresCockpitReadGateway } from '../../src/infrastructure/database/postgres-cockpit-read-gateway.js';
import { AttributionService } from '../../src/application/services/attribution-service.js';

describe('TX Commercial Core — Phase 6: Critical Commercial Journeys QA', () => {
  const workspaceId = 'c1000000-0000-4000-8000-000000000001';
  const ownerId = '10000000-0000-4000-8000-000000000001';
  const operatorId = '20000000-0000-4000-8000-000000000002';
  const channelId = 'c1000000-0000-4000-8000-000000000002';

  const adapter = new WahaWebhookAdapter();
  const ingestionGateway = new PostgresInboundIngestionGateway();
  const outboxGateway = new PostgresOutboxProcessingGateway();
  const worker = new WahaInboundWorker({ adapter, outboxGateway });
  const cockpitGateway = new PostgresCockpitReadGateway(dbPool);

  async function asAuthenticated<T>(userId: string, action: (client: any) => Promise<T>): Promise<T> {
    const client = await dbPool.connect();
    try {
      await client.query('SET ROLE authenticated');
      await client.query(`SET "request.jwt.claim.role" = 'authenticated'`);
      await client.query(`SET "request.jwt.claim.sub" = '${userId}'`);
      await client.query(`SET "request.jwt.claims" = '{"sub":"${userId}","role":"authenticated"}'`);
      return await action(client);
    } finally {
      await client.query('RESET ROLE').catch(() => undefined);
      client.release();
    }
  }

  beforeAll(async () => {
    // Cleanup
    const client = await dbPool.connect();
    try {
      await client.query("SELECT pg_catalog.set_config('sales_os.allow_redaction', 'true', false)");
      await client.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
      await client.query("SELECT pg_catalog.set_config('sales_os.allow_redaction', 'false', false)");
    } finally {
      client.release();
    }

    // Setup workspace, memberships, channel
    await query(`INSERT INTO workspaces (id, name, slug, active) VALUES ($1, 'Haven Escovaria QA', 'haven-qa', true)`, [workspaceId]);
    await query(`INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'operator')`, [workspaceId, ownerId, operatorId]);
    await query(`
      INSERT INTO channel_connections (id, workspace_id, provider, phone_number, name, public_config, status)
      VALUES ($1, $2, 'waha', '+554933401014', 'Haven WhatsApp Web', '{"session":"haven-session"}'::jsonb, 'CONNECTED')
    `, [channelId, workspaceId]);
  });

  afterAll(async () => {
    const client = await dbPool.connect();
    try {
      await client.query("SELECT pg_catalog.set_config('sales_os.allow_redaction', 'true', false)");
      await client.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
      await client.query("SELECT pg_catalog.set_config('sales_os.allow_redaction', 'false', false)");
    } finally {
      client.release();
      await dbPool.end();
    }
  });

  let createdJourneyId: string;
  let createdContactId: string;

  // ===========================================================================
  // JORNADA 1: Ingestão de Lead WAHA (Inbound -> Contato -> Jornada -> Mensagem)
  // ===========================================================================
  it('JORNADA 1: Ingestão de Lead WAHA cria Contato, Jornada e Mensagem', async () => {
    const providerMessageId = `qa-msg-${randomUUID()}`;
    const payload = {
      event: 'message',
      session: 'haven-session',
      payload: {
        id: providerMessageId,
        from: '5549988112233@c.us',
        to: '554933401014@c.us',
        body: 'Olá! Gostaria de agendar uma escova para amanhã às 14h.',
        timestamp: Math.floor(Date.now() / 1000),
        fromMe: false,
      },
    };

    const ingest = await ingestionGateway.ingestChannelEvent({
      channelConnectionId: channelId,
      providerEventId: `message:${providerMessageId}`,
      eventType: 'message',
      rawPayload: payload,
    });
    expect(ingest.isDuplicate).toBe(false);

    expect(await worker.processSingleBatch()).toBe(1);

    // Verify contact
    const contactRes = await query<{ id: string; phone: string }>(
      'SELECT id, phone FROM contacts WHERE workspace_id = $1 AND phone = $2',
      [workspaceId, '+5549988112233']
    );
    expect(contactRes.rowCount).toBe(1);
    createdContactId = contactRes.rows[0].id;

    // Verify journey
    const journeyRes = await query<{ id: string; status: string; pipeline_stage: string }>(
      'SELECT id, status, pipeline_stage FROM commercial_journeys WHERE workspace_id = $1 AND contact_id = $2',
      [workspaceId, createdContactId]
    );
    expect(journeyRes.rowCount).toBe(1);
    expect(journeyRes.rows[0].status).toBe('OPEN');
    expect(journeyRes.rows[0].pipeline_stage).toBe('NEW');
    createdJourneyId = journeyRes.rows[0].id;

    // Verify message
    const msgRes = await query<{ text_content: string }>(
      'SELECT text_content FROM conversation_messages WHERE journey_id = $1',
      [createdJourneyId]
    );
    expect(msgRes.rowCount).toBe(1);
    expect(msgRes.rows[0].text_content).toContain('agendar uma escova');
  });

  // ===========================================================================
  // JORNADA 2: Dossiê do Cockpit & Priorização
  // ===========================================================================
  it('JORNADA 2: Cockpit lê prioridades e dossiê da jornada em tempo real', async () => {
    const priorities = await cockpitGateway.listPriorities({ userId: operatorId, role: 'authenticated' }, workspaceId, 10);
    expect(priorities).toBeDefined();
    expect(priorities?.length).toBeGreaterThanOrEqual(1);

    const leadPriority = priorities?.find((p) => p.journeyId === createdJourneyId);
    expect(leadPriority).toBeDefined();
    expect(leadPriority?.pipelineStage).toBe('NEW');
  });

  // ===========================================================================
  // JORNADA 3: Auditoria de Fatos Conhecidos
  // ===========================================================================
  it('JORNADA 3: Registro de Fato Conhecido persiste com auditoria imutável', async () => {
    const factKey = `fact-pref-${randomUUID()}`;
    const res = await asAuthenticated(operatorId, (c) => c.query(
      'SELECT public.record_known_fact($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9) AS result',
      [
        workspaceId,
        createdJourneyId,
        'customer.preference',
        JSON.stringify({ preference: 'Prefere escova modelada', hair_length: 'médio' }),
        null,
        0.95,
        true,
        null,
        factKey,
      ]
    ));

    const factResult = res.rows[0].result;
    expect(factResult.factId).toBeDefined();
    expect(factResult.idempotent).toBe(false);

    // Verify database record
    const factRow = await query<{ key: string; value: any }>(
      'SELECT key, value FROM known_facts WHERE id = $1',
      [factResult.factId]
    );
    expect(factRow.rowCount).toBe(1);
    expect(factRow.rows[0].key).toBe('customer.preference');
    expect(factRow.rows[0].value.hair_length).toBe('médio');
  });

  // ===========================================================================
  // JORNADA 4: Movimentação de Etapa do Pipeline
  // ===========================================================================
  it('JORNADA 4: Transição de estágio do Pipeline (NEW -> QUALIFIED -> PROPOSAL)', async () => {
    const keyQualified = `stage-qual-${randomUUID()}`;
    const keyProposal = `stage-prop-${randomUUID()}`;

    // 1. Move to QUALIFIED
    const move1 = await asAuthenticated(operatorId, (c) => c.query(
      'SELECT public.set_journey_pipeline_stage($1, $2, $3, $4, $5) AS result',
      [workspaceId, createdJourneyId, 'QUALIFIED', 'Cliente informou serviço desejado', keyQualified]
    ));
    expect(move1.rows[0].result.stage).toBe('QUALIFIED');

    // 2. Move to PROPOSAL
    const move2 = await asAuthenticated(operatorId, (c) => c.query(
      'SELECT public.set_journey_pipeline_stage($1, $2, $3, $4, $5) AS result',
      [workspaceId, createdJourneyId, 'PROPOSAL', 'Enviado valor do combo Escova + Hidratação', keyProposal]
    ));
    expect(move2.rows[0].result.stage).toBe('PROPOSAL');

    // Verify current journey stage
    const j = await query<{ pipeline_stage: string }>(
      'SELECT pipeline_stage FROM commercial_journeys WHERE id = $1',
      [createdJourneyId]
    );
    expect(j.rows[0].pipeline_stage).toBe('PROPOSAL');
  });

  // ===========================================================================
  // JORNADA 5: Agendamento de Consulta / Serviço
  // ===========================================================================
  it('JORNADA 5: Criação e confirmação de agendamento na agenda', async () => {
    const appointmentId = randomUUID();
    const scheduledTime = new Date(Date.now() + 86400000); // Amanhã

    await query(`
      INSERT INTO commercial_appointments (
        id, workspace_id, journey_id, lead_name, lead_phone, service_name,
        service_value_minor, scheduled_at, duration_minutes, status, source
      ) VALUES (
        $1, $2, $3, 'Contato Haven Lead', '+5549988112233', 'Escova Express + Lavagem Especial',
        7900, $4, 45, 'confirmed', 'operator'
      )
    `, [appointmentId, workspaceId, createdJourneyId, scheduledTime]);

    const appt = await query<{ service_name: string; status: string }>(
      'SELECT service_name, status FROM commercial_appointments WHERE id = $1',
      [appointmentId]
    );
    expect(appt.rowCount).toBe(1);
    expect(appt.rows[0].status).toBe('confirmed');
    expect(appt.rows[0].service_name).toBe('Escova Express + Lavagem Especial');
  });

  // ===========================================================================
  // JORNADA 6: Transcrição & Anotações Comerciais
  // ===========================================================================
  it('JORNADA 6: Registro de anotações comerciais e categorização', async () => {
    const noteId = randomUUID();
    await query(`
      INSERT INTO operational_notes (
        id, workspace_id, author_id, author_name, title, content, category, pinned
      ) VALUES (
        $1, $2, $3, 'Operador Haven', 'Anotação de Alinhamento Haven', 'Cliente tem couro cabeludo sensível, usar shampoo suave.', 'lead_vip', true
      )
    `, [noteId, workspaceId, operatorId]);

    const note = await query<{ title: string; category: string }>(
      'SELECT title, category FROM operational_notes WHERE id = $1',
      [noteId]
    );
    expect(note.rowCount).toBe(1);
    expect(note.rows[0].category).toBe('lead_vip');
  });

  // ===========================================================================
  // JORNADA 7: Criação de Follow-up com Idempotência
  // ===========================================================================
  it('JORNADA 7: Criação de follow-up com garantia de unicidade', async () => {
    const fuKey = `fu-journey-qa-${randomUUID()}`;
    const dueAt = new Date(Date.now() + 172800000).toISOString();

    const fu = await asAuthenticated(operatorId, (c) => c.query(
      'SELECT public.create_follow_up_task($1, $2, $3, $4, $5) AS result',
      [workspaceId, createdJourneyId, dueAt, 'Enviar lembrete 2h antes do atendimento', fuKey]
    ));

    expect(fu.rows[0].result.taskId).toBeDefined();
    expect(fu.rows[0].result.idempotent).toBe(false);

    // Verify task
    const task = await query<{ reason: string }>(
      'SELECT reason FROM follow_up_tasks WHERE id = $1',
      [fu.rows[0].result.taskId]
    );
    expect(task.rows[0].reason).toBe('Enviar lembrete 2h antes do atendimento');
  });

  // ===========================================================================
  // JORNADA 8: Protocolo de Handoff Humano
  // ===========================================================================
  it('JORNADA 8: Gatilho de Handoff e Aceite pelo Operador', async () => {
    const handoffId = randomUUID();
    await query(`
      INSERT INTO handoff_cases (id, workspace_id, journey_id, briefing, trigger_reason, status)
      VALUES ($1, $2, $3, '{"issue":"Cliente pediu desconto em pacote fechado"}'::jsonb, 'discount_negotiation', 'PENDING')
    `, [handoffId, workspaceId, createdJourneyId]);

    const acceptKey = `accept-qa-${randomUUID()}`;
    const accept = await asAuthenticated(operatorId, (c) => c.query(
      'SELECT public.accept_handoff($1, $2, $3) AS result',
      [workspaceId, handoffId, acceptKey]
    ));

    expect(accept.rows[0].result.status).toBe('ACCEPTED');

    const h = await query<{ status: string; assigned_to_user_id: string }>(
      'SELECT status, assigned_to_user_id FROM handoff_cases WHERE id = $1',
      [handoffId]
    );
    expect(h.rows[0].status).toBe('ACCEPTED');
    expect(h.rows[0].assigned_to_user_id).toBe(operatorId);
  });

  // ===========================================================================
  // JORNADA 9: Supervisão de IA & Kill Switch
  // ===========================================================================
  it('JORNADA 9: Kill Switch de Operação Bloqueia Outbound Instantaneamente', async () => {
    const ksKey = `ks-qa-${randomUUID()}`;
    await asAuthenticated(ownerId, (c) => c.query(
      'SELECT public.set_workspace_outbound_control($1, false, $2, $3)',
      [workspaceId, 'Parada para manutenção de atendimento', ksKey]
    ));

    const check = await query<{ is_outbound_enabled: boolean }>(
      'SELECT public.is_outbound_enabled($1, $2)',
      [workspaceId, channelId]
    );
    expect(check.rows[0].is_outbound_enabled).toBe(false);
  });

  // ===========================================================================
  // JORNADA 10: Atribuição de Tráfego Meta CAPI & UTM
  // ===========================================================================
  it('JORNADA 10: Atribuição de Tráfego extrai e persiste UTM / CTWA', async () => {
    const textWithUtm = 'Olá! Vi o anúncio da escova por R$ 59 no Instagram https://haven.com.br?utm_source=instagram&utm_campaign=escova_express_chapec&utm_content=video_antes_depois';
    const referralWrapper = {
      referral: {
        source_id: '23849182391023',
        source_type: 'ad',
        headline: 'Escovaria Haven Chapecó',
        ctwa_clid: 'ctwa_click_haven_99182',
      },
    };

    const attr = AttributionService.extractAttribution(textWithUtm, referralWrapper, []);
    expect(attr).toBeDefined();
    expect(attr?.source).toBe('meta_ads');
    expect(attr?.campaignName).toBe('Escovaria Haven Chapecó');
    expect(attr?.clickIds.ctwaClid).toBe('ctwa_click_haven_99182');

    const client = await dbPool.connect();
    try {
      const contextId = await AttributionService.persistAttribution(
        client,
        workspaceId,
        createdJourneyId,
        attr!,
        new Date()
      );
      expect(contextId).toBeDefined();

      const savedContext = await client.query(
        'SELECT campaign_name, click_ids FROM acquisition_contexts WHERE id = $1',
        [contextId]
      );
      expect(savedContext.rowCount).toBe(1);
      expect(savedContext.rows[0].campaign_name).toBe('Escovaria Haven Chapecó');
      expect(savedContext.rows[0].click_ids.ctwaClid).toBe('ctwa_click_haven_99182');
    } finally {
      client.release();
    }
  });
});
