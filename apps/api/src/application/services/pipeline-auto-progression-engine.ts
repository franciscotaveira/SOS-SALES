/**
 * TX COMMERCIAL CORE — PIPELINE AUTO-PROGRESSION ENGINE
 *
 * Motor autônomo de evolução de etapas no Funil Comercial (Kanban).
 * Analisa as mensagens da jornada em tempo real via Cognitive Analyzer
 * e avança monotonicamente o estágio do lead (1 a 4):
 *   1. NEW / LEAD (Novos Leads)
 *   2. QUALIFIED (Qualificados)
 *   3. PROPOSAL (Proposta Enviada)
 *   4. NEGOTIATION (Em Negociação)
 *
 * NOTA DE GOVERNANÇA (Truth in Data):
 * O estágio 5 (WON / GANHO) NUNCA é promovido de forma puramente inferencial.
 * Ele permanece restrito à confirmação real de pagamento (Webhook Cakto / Pix)
 * ou fechamento auditado pelo operador.
 */

import { analyzeConversationDossier, MessageLike } from './cognitive-analyzer.js';

export const STAGE_RANK: Record<string, number> = {
  NEW: 1,
  CONTACTED: 1,
  LEAD: 1,
  LEAD_INICIAL: 1,
  QUALIFIED: 2,
  QUALIFICADO: 2,
  APPROACHED: 2,
  ENGAGED: 2,
  PROPOSAL: 3,
  PROPOSTA: 3,
  OFERTA: 3,
  NEGOTIATION: 4,
  NEGOCIACAO: 4,
  FOLLOW_UP: 4,
  WON: 5,
  GANHO: 5,
  CLOSED: 5,
};

export const DB_STAGE_CANONICAL: Record<string, 'NEW' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION'> = {
  LEAD: 'NEW',
  NEW: 'NEW',
  QUALIFICADO: 'QUALIFIED',
  QUALIFIED: 'QUALIFIED',
  PROPOSTA: 'PROPOSAL',
  PROPOSAL: 'PROPOSAL',
  NEGOCIACAO: 'NEGOTIATION',
  NEGOTIATION: 'NEGOTIATION',
};

export interface PipelineAutoProgressionResult {
  evaluated: boolean;
  advanced: boolean;
  fromStage: string;
  toStage: string;
  reason?: string;
}

export type DbQueryFn = (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;

export class PipelineAutoProgressionEngine {
  /**
   * Avalia o histórico de conversas da jornada e avança a etapa do funil
   * de forma estritamente progressiva (sem regressão involuntária).
   */
  public static async evaluateAndProgress(
    query: DbQueryFn,
    workspaceId: string,
    journeyId: string,
  ): Promise<PipelineAutoProgressionResult> {
    if (!workspaceId || !journeyId) {
      return { evaluated: false, advanced: false, fromStage: 'NEW', toStage: 'NEW', reason: 'invalid_identifiers' };
    }

    // 1. Carrega dados da jornada e contato
    const journeyRes = await query(
      `SELECT j.id, j.workspace_id, j.status, j.pipeline_stage, j.primary_service_or_product,
              c.name AS contact_name
       FROM public.commercial_journeys j
       LEFT JOIN public.contacts c ON c.id = j.contact_id
       WHERE j.id = $1 AND j.workspace_id = $2
       LIMIT 1`,
      [journeyId, workspaceId],
    );

    if (journeyRes.rows.length === 0) {
      return { evaluated: false, advanced: false, fromStage: 'NEW', toStage: 'NEW', reason: 'journey_not_found' };
    }

    const journey = journeyRes.rows[0];
    if (journey.status !== 'OPEN') {
      // Jornadas já encerradas (ganho/perdido) não sofrem auto-evolução
      return { evaluated: false, advanced: false, fromStage: journey.pipeline_stage || 'NEW', toStage: journey.pipeline_stage || 'NEW', reason: 'journey_not_open' };
    }

    const currentStage = String(journey.pipeline_stage || 'NEW').toUpperCase().trim();
    const currentRank = STAGE_RANK[currentStage] || 1;

    // Se já estiver em negociação (rank 4) ou ganho (rank 5), auto-evolução não promove além
    if (currentRank >= 4) {
      return { evaluated: true, advanced: false, fromStage: currentStage, toStage: currentStage, reason: 'already_at_max_autonomous_stage' };
    }

    // 2. Busca histórico recente de mensagens da jornada
    const messagesRes = await query(
      `SELECT direction, sender_type, text_content, sent_at
       FROM public.conversation_messages
       WHERE workspace_id = $1 AND journey_id = $2 AND text_content IS NOT NULL AND text_content <> ''
       ORDER BY sent_at ASC
       LIMIT 50`,
      [workspaceId, journeyId],
    );

    const rows = messagesRes.rows;
    if (!rows || rows.length === 0) {
      return { evaluated: true, advanced: false, fromStage: currentStage, toStage: currentStage, reason: 'no_messages_to_analyze' };
    }

    const messagesForAnalysis: MessageLike[] = rows.map((r: any) => ({
      direction: String(r.direction || '').toLowerCase() as any,
      senderType: String(r.sender_type || '').toUpperCase() as any,
      textContent: String(r.text_content || ''),
      sentAt: r.sent_at,
    }));

    // 3. Análise semântica cognitiva da conversa
    const dossier = analyzeConversationDossier(messagesForAnalysis, journey.contact_name);
    const suggested = dossier.suggestedStage;

    // Mapeia para os estágios canônicos permitidos pelo banco de dados
    let targetDbStage: 'NEW' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' = 'NEW';
    if (suggested === 'GANHO' || suggested === 'NEGOCIACAO') {
      // Cap em NEGOTIATION (Rank 4) - GANHO exige confirmação real de pagamento
      targetDbStage = 'NEGOTIATION';
    } else if (suggested === 'PROPOSTA') {
      targetDbStage = 'PROPOSAL';
    } else if (suggested === 'QUALIFICADO') {
      targetDbStage = 'QUALIFIED';
    } else {
      targetDbStage = 'NEW';
    }

    const targetRank = STAGE_RANK[targetDbStage] || 1;

    // 4. Se o alvo for superior ao estágio atual, efetua a transição e a
    // auditoria na mesma instrução SQL. O snapshot `FOR UPDATE` impede que
    // duas mensagens concorrentes avancem a mesma jornada ou deixem a etapa
    // persistida sem o evento correspondente.
    if (targetRank > currentRank && targetRank <= 4) {
      const detectedService = dossier.primaryServiceOrProduct && dossier.primaryServiceOrProduct !== 'Interesse Geral / Atendimento Comercial'
        ? dossier.primaryServiceOrProduct
        : null;

      const idempotencyKey = `auto_${workspaceId}_${journeyId}_${targetDbStage}`;
      const transitionResult = await query(
        `WITH current_journey AS MATERIALIZED (
           SELECT j.id,
                  j.workspace_id,
                  COALESCE(NULLIF(UPPER(BTRIM(j.pipeline_stage)), ''), 'NEW') AS from_stage
           FROM public.commercial_journeys j
           WHERE j.id = $5 AND j.workspace_id = $6 AND j.status = 'OPEN'
           FOR UPDATE
         ),
         eligible AS MATERIALIZED (
           SELECT current.id, current.workspace_id, current.from_stage
           FROM current_journey current
           WHERE CASE current.from_stage
             WHEN 'NEW' THEN 1
             WHEN 'CONTACTED' THEN 1
             WHEN 'QUALIFIED' THEN 2
             WHEN 'PROPOSAL' THEN 3
             WHEN 'NEGOTIATION' THEN 4
             ELSE 1
           END < $2
         ),
         transitioned AS (
           UPDATE public.commercial_journeys j
           SET pipeline_stage = $1,
               primary_service_or_product = COALESCE(NULLIF(j.primary_service_or_product, ''), $4),
               updated_at = NOW()
           FROM eligible current
           WHERE j.id = current.id
           RETURNING j.id, j.workspace_id, j.pipeline_stage AS to_stage
         ),
         audit AS (
           INSERT INTO public.pipeline_stage_events (
             id, workspace_id, journey_id, from_stage, to_stage, reason, actor_user_id, idempotency_key, created_at
           )
           SELECT gen_random_uuid(),
                  t.workspace_id,
                  t.id,
                  current.from_stage,
                  t.to_stage,
                  $7,
                  '00000000-0000-0000-0000-000000000000',
                  $8,
                  NOW()
           FROM transitioned t
           JOIN eligible current ON current.id = t.id
           ON CONFLICT (workspace_id, journey_id, idempotency_key) DO NOTHING
           RETURNING journey_id
         )
         SELECT
           COALESCE((SELECT from_stage FROM eligible LIMIT 1), (SELECT from_stage FROM current_journey LIMIT 1), $3) AS from_stage,
           COALESCE((SELECT to_stage FROM transitioned LIMIT 1), (SELECT from_stage FROM current_journey LIMIT 1), $1) AS to_stage,
           EXISTS (SELECT 1 FROM transitioned) AS advanced,
           (
             EXISTS (SELECT 1 FROM audit)
             OR EXISTS (
               SELECT 1
               FROM public.pipeline_stage_events e
               WHERE e.workspace_id = $6 AND e.journey_id = $5 AND e.idempotency_key = $8
             )
           ) AS audited`,
        [
          targetDbStage,
          targetRank,
          currentStage,
          detectedService,
          journeyId,
          workspaceId,
          dossier.stageReason || 'Evolução autônoma via IA (Cognitive Analysis)',
          idempotencyKey,
        ],
      );

      const transition = transitionResult.rows[0] as {
        from_stage?: string;
        to_stage?: string;
        advanced?: boolean;
        audited?: boolean;
      } | undefined;
      const fromStage = String(transition?.from_stage || currentStage);
      const toStage = String(transition?.to_stage || currentStage);
      const advanced = transition?.advanced === true;
      if (!advanced) {
        return {
          evaluated: true,
          advanced: false,
          fromStage,
          toStage,
          reason: 'concurrent_transition_or_target_not_higher',
        };
      }
      if (transition?.audited !== true) {
        throw new Error('Pipeline transition committed without an audit event');
      }

      console.info(`[PipelineAutoProgressionEngine] Journey ${journeyId} automatically advanced from ${currentStage} to ${targetDbStage} (${dossier.stageReason})`);

      return {
        evaluated: true,
        advanced: true,
        fromStage,
        toStage,
        reason: dossier.stageReason,
      };
    }

    return {
      evaluated: true,
      advanced: false,
      fromStage: currentStage,
      toStage: targetDbStage,
      reason: 'target_rank_not_higher',
    };
  }
}
