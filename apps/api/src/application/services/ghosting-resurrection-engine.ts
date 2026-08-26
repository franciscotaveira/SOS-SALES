/**
 * SOS SALES - MOTOR DE REANIMAÇÃO PREDITIVA DE VÁCUO (Level 4)
 * Analisa leads em silêncio comercial (>3h) e sintetiza micro-quebras de objeção.
 */

import { OpenRouterEngine } from '../../infrastructure/ai/openrouter-engine.js';
import { dbPool } from '../../infrastructure/database/pool.js';
import { analyzeConversationDossier } from './cognitive-analyzer.js';

export interface GhostingAnalysis {
  journeyId: string;
  contactName: string;
  contactPhone: string;
  hoursSilent: number;
  archetype: 'POST_PRICE_FREEZE' | 'POST_AVAILABILITY_FREEZE' | 'COLD_INBOUND' | 'GENERAL_GHOST';
  primaryService: string;
  offerHook?: string;
  recommendedMessage: string;
  urgencyScore: number;
}

export class GhostingResurrectionEngine {
  private readonly aiEngine: OpenRouterEngine;

  constructor(aiEngine?: OpenRouterEngine) {
    this.aiEngine = aiEngine || new OpenRouterEngine();
  }

  /**
   * Avalia e gera a mensagem de reativação para uma jornada específica em vácuo.
   */
  async analyzeAndGenerate(workspaceId: string, journeyId: string): Promise<GhostingAnalysis | null> {
    const journeyRes = await dbPool.query(
      `SELECT j.id, j.pipeline_stage, j.status, j.last_interaction_at,
              c.name AS contact_name, c.phone AS contact_phone,
              ac.offer_hook, ac.campaign_name, ac.entry_message
       FROM public.commercial_journeys j
       JOIN public.contacts c ON c.id = j.contact_id
       LEFT JOIN public.acquisition_contexts ac ON ac.journey_id = j.id
       WHERE j.id = $1 AND j.workspace_id = $2
       LIMIT 1`,
      [journeyId, workspaceId]
    );

    if (journeyRes.rows.length === 0) return null;
    const row = journeyRes.rows[0];

    // Se a jornada já estiver encerrada (WON ou LOST), não ressuscitamos
    if (row.status === 'WON' || row.status === 'LOST') return null;

    // Buscar mensagens recentes
    const msgRes = await dbPool.query(
      `SELECT id, direction, sender_type, text_content, sent_at
       FROM public.conversation_messages
       WHERE journey_id = $1 AND workspace_id = $2
       ORDER BY sent_at DESC
       LIMIT 12`,
      [journeyId, workspaceId]
    );

    const messages = msgRes.rows.reverse();
    if (messages.length === 0) return null;

    const lastMessage = messages[messages.length - 1];
    const lastSentAt = new Date(lastMessage.sent_at).getTime();
    const hoursSilent = Math.max(0, (Date.now() - lastSentAt) / (1000 * 60 * 60));

    // Determinar arquétipo de vácuo
    const inferred = analyzeConversationDossier(messages, row.contact_name);
    let archetype: GhostingAnalysis['archetype'] = 'GENERAL_GHOST';

    const recentTexts = messages.slice(-3).map((m) => (m.text_content || '').toLowerCase()).join(' ');
    if (/r\$|valor|custa|preço|preco|investimento|tabela|pacote/.test(recentTexts)) {
      archetype = 'POST_PRICE_FREEZE';
    } else if (/horário|horario|vaga|agenda|disponível|disponivel|quinta|sexta|sábado|sabado|hoje|amanhã|amanha/.test(recentTexts)) {
      archetype = 'POST_AVAILABILITY_FREEZE';
    } else if (messages.length <= 2) {
      archetype = 'COLD_INBOUND';
    }

    const primaryService = inferred.primaryServiceOrProduct || 'Atendimento Especializado';
    const offerHook = row.offer_hook || inferred.offerHook;

    // Gerar mensagem de quebra de vácuo via IA
    const systemPrompt = `Você é uma especialista em conversão comercial no WhatsApp para estética, beleza e serviços de alto padrão (SOS Sales MCT).
Sua missão é enviar UMA ÚNICA MENSAGEM CURTA (máximo 2 linhas), humanizada, calorosa e persuasiva para reatar a conversa com um lead que parou de responder após ver o preço ou horários.
Regras:
1. Comece com "Oi [Nome]!" de forma simpática.
2. Seja leve e não pareça um robô cobrando resposta.
3. Crie uma ponte suave: liberação de uma vaga especial, bônus exclusivo de hora marcada, ou apenas perguntando se prefere ver horários para outro dia.
4. NUNCA use clichês como "espero que esta mensagem o encontre bem" ou "gostaria de saber se tem interesse".
5. Retorne APENAS o texto da mensagem pronta para enviar no WhatsApp.`;

    const userPrompt = `Contato: ${row.contact_name || 'Cliente'}
Serviço de Interesse: ${primaryService}
Gancho do Anúncio/Oferta: ${offerHook || 'Nenhum específico'}
Arquétipo do Vácuo: ${archetype}
Horas em silêncio: ${hoursSilent.toFixed(1)}h
Última mensagem trocada: "${lastMessage.text_content || ''}"`;

    let recommendedMessage = '';
    try {
      const result = await this.aiEngine.generateChatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { tier: 'fast' }
      );
      recommendedMessage = result.content;
    } catch {
      // Fallback determinístico caso a IA esteja offline
      if (archetype === 'POST_PRICE_FREEZE') {
        recommendedMessage = `Oi ${row.contact_name || 'tudo bem'}! Consegui liberar uma condição especial com um mimo exclusivo para o seu ${primaryService} se agendarmos esta semana. Quer que eu veja os horários?`;
      } else if (archetype === 'POST_AVAILABILITY_FREEZE') {
        recommendedMessage = `Oi ${row.contact_name || 'tudo bem'}! Sobrou uma vaga exclusiva para hoje no final do dia. Quer que eu reserve para você antes que preencha?`;
      } else {
        recommendedMessage = `Oi ${row.contact_name || 'tudo bem'}! Passando para ver se você conseguiu ver os horários ou se prefere que eu veja outra opção para você!`;
      }
    }

    const urgencyScore = Math.min(100, Math.round(hoursSilent * 4 + (archetype === 'POST_PRICE_FREEZE' ? 30 : 15)));

    return {
      journeyId,
      contactName: row.contact_name || 'Cliente',
      contactPhone: row.contact_phone || '',
      hoursSilent: Math.round(hoursSilent * 10) / 10,
      archetype,
      primaryService,
      offerHook,
      recommendedMessage: recommendedMessage.trim(),
      urgencyScore,
    };
  }

  /**
   * Busca todas as jornadas em vácuo no workspace para o Cockpit / Radar Comercial.
   */
  async listGhostingOpportunities(workspaceId: string, minHours = 3, maxHours = 48): Promise<GhostingAnalysis[]> {
    const res = await dbPool.query(
      `SELECT j.id
       FROM public.commercial_journeys j
       WHERE j.workspace_id = $1
         AND j.status NOT IN ('WON', 'LOST')
         AND j.last_interaction_at <= NOW() - ($2 || ' hours')::interval
         AND j.last_interaction_at >= NOW() - ($3 || ' hours')::interval
       ORDER BY j.last_interaction_at DESC
       LIMIT 20`,
      [workspaceId, String(minHours), String(maxHours)]
    );

    const results: GhostingAnalysis[] = [];
    for (const row of res.rows) {
      const analysis = await this.analyzeAndGenerate(workspaceId, row.id);
      if (analysis) results.push(analysis);
    }

    return results.sort((a, b) => b.urgencyScore - a.urgencyScore);
  }
}
