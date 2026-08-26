/**
 * SOS SALES - MOTOR DE EVOLUÇÃO DO PLAYBOOK (Level 5 Hive-Mind)
 * Destila os melhores argumentos de vendas fechadas e os transforma em patrimônio da equipe.
 */

import { OpenRouterEngine } from '../../infrastructure/ai/openrouter-engine.js';
import { dbPool } from '../../infrastructure/database/pool.js';
import { MessageLike } from './cognitive-analyzer.js';

export interface BattlecardExtraction {
  objectionTitle: string;
  winningArgumentText: string;
  contextSummary: string;
  confidence: number;
}

export class PlaybookEvolutionEngine {
  private readonly aiEngine: OpenRouterEngine;

  constructor(aiEngine?: OpenRouterEngine) {
    this.aiEngine = aiEngine || new OpenRouterEngine();
  }

  /**
   * Extrai e registra o argumento vencedor quando uma venda é marcada como GANHO.
   */
  async distillAndEvolve(
    workspaceId: string,
    journeyId: string,
    revenueMinor: number,
    messages: MessageLike[]
  ): Promise<BattlecardExtraction | null> {
    if (!messages || messages.length < 4) return null;

    const operatorMessages = messages.filter((m) => m.direction === 'outbound' || m.direction === 'OUTBOUND');
    if (operatorMessages.length === 0) return null;

    const conversationTranscript = messages
      .map((m) => `${m.direction === 'inbound' || m.direction === 'INBOUND' ? 'Cliente' : 'Vendedor'}: ${m.textContent || m.text || ''}`)
      .join('\n');

    const systemPrompt = `Você é um Estrategista Sênior de Vendas e Engenharia Comercial.
Analise a transcrição de uma negociação no WhatsApp que acabou de ser FECHADA COM SUCESSO (R$ ${(revenueMinor / 100).toFixed(2)}).
Identifique a principal objeção ou hesitação que o cliente teve e qual foi o ARGUMENTO DE OURO usado pelo vendedor que destravou o fechamento.

Retorne EXCLUSIVAMENTE um objeto JSON válido no formato:
{
  "objectionTitle": "Título curto da objeção contornada (ex: Preço Alto, Insegurança de Horário, Dúvida de Durabilidade)",
  "winningArgumentText": "O argumento ou frase exata do vendedor que convenceu o cliente",
  "contextSummary": "Resumo em 1 linha de como aplicar esse argumento"
}`;

    try {
      const result = await this.aiEngine.generateChatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: conversationTranscript },
        ],
        { tier: 'fast' }
      );

      const cleanJson = result.content.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson) as BattlecardExtraction;

      if (parsed.objectionTitle && parsed.winningArgumentText) {
        // Gravar no banco como Known Fact do Playbook Global do Workspace
        await dbPool.query(
          `INSERT INTO public.known_facts (
            id, workspace_id, journey_id, key, value, confidence, confirmed_by_customer, source, observed_at
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, 0.95, true, 'hive_mind_playbook', NOW()
          )
          ON CONFLICT (workspace_id, journey_id, key)
          DO UPDATE SET value = EXCLUDED.value, observed_at = NOW()`,
          [
            workspaceId,
            journeyId,
            `playbook.winning_${Date.now()}`,
            JSON.stringify({
              objection: parsed.objectionTitle,
              argument: parsed.winningArgumentText,
              summary: parsed.contextSummary,
              dealValueMinor: revenueMinor,
            }),
          ]
        );

        return parsed;
      }
    } catch {
      // ignore
    }

    return null;
  }
}
