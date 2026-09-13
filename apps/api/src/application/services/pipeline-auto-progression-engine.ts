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

    // 4. Se o alvo for superior ao estágio atual, efetua a transição atômica
    if (targetRank > currentRank && targetRank <= 4) {
      const detectedService = dossier.primaryServiceOrProduct && dossier.primaryServiceOrProduct !== 'Interesse Geral / Atendimento Comercial'
        ? dossier.primaryServiceOrProduct
        : null;

      await query(
        `UPDATE public.commercial_journeys
         SET pipeline_stage = $1,
             primary_service_or_product = COALESCE(NULLIF(primary_service_or_product, ''), $2),
             updated_at = NOW()
         WHERE id = $3 AND workspace_id = $4`,
        [targetDbStage, detectedService, journeyId, workspaceId],
      );

      // Registra evento de auditoria no histórico de transições
      const idempotencyKey = `auto_${journeyId.slice(0, 8)}_${targetDbStage.toLowerCase()}_${Date.now()}`;
      try {
        await query(
          `INSERT INTO public.pipeline_stage_events (
             id, workspace_id, journey_id, from_stage, to_stage, reason, actor_user_id, idempotency_key, created_at
           ) VALUES (
             gen_random_uuid(), $1, $2, $3, $4, $5, '00000000-0000-0000-0000-000000000000', $6, NOW()
           ) ON CONFLICT (workspace_id, journey_id, idempotency_key) DO NOTHING`,
          [
            workspaceId,
            journeyId,
            currentStage,
            targetDbStage,
            dossier.stageReason || 'Evolução autônoma via IA (Cognitive Analysis)',
            idempotencyKey,
          ],
        );
      } catch (eventErr) {
        console.warn('[PipelineAutoProgressionEngine] Failed to write stage event log:', eventErr);
      }

      console.info(`[PipelineAutoProgressionEngine] Journey ${journeyId} automatically advanced from ${currentStage} to ${targetDbStage} (${dossier.stageReason})`);

      return {
        evaluated: true,
        advanced: true,
        fromStage: currentStage,
        toStage: targetDbStage,
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
