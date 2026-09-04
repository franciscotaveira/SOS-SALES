/**
 * SOS SALES - MOTOR DE LTV E RECORRÊNCIA PÓS-VENDA (Level 4)
 * Calcula ciclos biológicos e temporais de recompra para maximizar o LTV do cliente.
 */

import { OpenRouterEngine } from '../../infrastructure/ai/openrouter-engine.js';
import { dbPool } from '../../infrastructure/database/pool.js';

export interface RetentionOpportunity {
  contactId: string;
  contactName: string;
  contactPhone: string;
  lastOutcomeId: string;
  lastService: string;
  lastWonAt: string;
  daysSinceLastService: number;
  recommendedCycleDays: number;
  retentionStatus: 'EARLY' | 'OPTIMAL_WINDOW' | 'OVERDUE_RISK';
  suggestedRetentionMessage: string;
  estimatedLtvPotentialMinor: number | null;
}

export function buildSafeRetentionMessage(
  contactName: string,
  service: string,
  daysSince: number,
): string {
  return `Oi ${contactName}! Faz ${daysSince} dias desde o atendimento de ${service}. Como foi sua experiência? Se quiser continuar, posso pedir para a equipe confirmar as opções disponíveis.`;
}

export class LtvRetentionEngine {
  private readonly aiEngine: OpenRouterEngine;

  constructor(aiEngine?: OpenRouterEngine) {
    this.aiEngine = aiEngine || new OpenRouterEngine();
  }

  private getOptimalCycleDays(serviceName: string): number {
    const s = serviceName.toLowerCase();
    if (/unha|gel|manicure|pedicure|fibra|esmaltação/.test(s)) return 18;
    if (/cronograma|tratamento|hidratação|nutrição|reconstrução|cauterização/.test(s)) return 21;
    if (/sobrancelha|buço|henna|egípcia|micro|design/.test(s)) return 25;
    if (/corte|escova|modelagem/.test(s)) return 14;
    if (/limpeza de pele|peeling|massagem|facial/.test(s)) return 28;
    return 30; // Padrão geral
  }

  async listRetentionOpportunities(workspaceId: string): Promise<RetentionOpportunity[]> {
    // Buscar últimos outcomes WON por contato
    const res = await dbPool.query(
      `SELECT DISTINCT ON (j.contact_id)
              j.contact_id,
              c.name AS contact_name,
              c.phone AS contact_phone,
              co.id AS outcome_id,
              co.final_revenue_minor,
              co.occurred_at,
              j.primary_service_or_product
       FROM public.commercial_outcomes co
       JOIN public.commercial_journeys j ON j.id = co.journey_id
       JOIN public.contacts c ON c.id = j.contact_id
       WHERE co.workspace_id = $1 AND co.result = 'WON'
       ORDER BY j.contact_id, co.occurred_at DESC
       LIMIT 30`,
      [workspaceId]
    );

    const opportunities: RetentionOpportunity[] = [];

    for (const row of res.rows) {
      const wonAt = new Date(row.occurred_at || Date.now()).getTime();
      const daysSince = Math.floor((Date.now() - wonAt) / (1000 * 60 * 60 * 24));
      const service = row.primary_service_or_product || 'Atendimento Especializado';
      const cycleDays = this.getOptimalCycleDays(service);

      // Status do ciclo de retenção
      let retentionStatus: RetentionOpportunity['retentionStatus'] = 'EARLY';
      if (daysSince >= cycleDays - 3 && daysSince <= cycleDays + 7) {
        retentionStatus = 'OPTIMAL_WINDOW';
      } else if (daysSince > cycleDays + 7) {
        retentionStatus = 'OVERDUE_RISK';
      }

      // Se ainda for muito recente (< 10 dias), não incomodar
      if (daysSince < 10) continue;

      const contactName = row.contact_name || 'Cliente';
      const suggestedRetentionMessage = buildSafeRetentionMessage(contactName, service, daysSince);

      opportunities.push({
        contactId: row.contact_id,
        contactName,
        contactPhone: row.contact_phone || '',
        lastOutcomeId: row.outcome_id,
        lastService: service,
        lastWonAt: row.occurred_at,
        daysSinceLastService: daysSince,
        recommendedCycleDays: cycleDays,
        retentionStatus,
        suggestedRetentionMessage,
        estimatedLtvPotentialMinor: row.final_revenue_minor === null || row.final_revenue_minor === undefined
          ? null
          : Number(row.final_revenue_minor),
      });
    }

    // Ordenar por prioridade: Janela ótima primeiro, depois risco de perda
    return opportunities.sort((a, b) => {
      const score = (status: RetentionOpportunity['retentionStatus']) =>
        status === 'OPTIMAL_WINDOW' ? 3 : status === 'OVERDUE_RISK' ? 2 : 1;
      return score(b.retentionStatus) - score(a.retentionStatus);
    });
  }
}
