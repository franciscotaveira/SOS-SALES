/**
 * SOS SALES - RADAR DE SENTIMENTO & PROBABILIDADE DE FECHAMENTO (Level 5)
 * Analisa a micro-linguagem da conversa para guiar o timing exato do pedido de pagamento/sinal.
 */

import { analyzeConversationDossier, MessageLike } from './cognitive-analyzer.js';

export interface SentimentAnalysis {
  closingProbability: number; // 0 - 100
  sentimentTier: 'HOT_CLOSER' | 'WARM_INTEREST' | 'HESITANT_FRICTION' | 'COLD_INITIAL';
  sentimentLabel: string;
  tacticalRecommendation: string;
  detectedObjections: string[];
  engagementScore: number;
}

export class LiveSentimentEngine {
  /**
   * Avalia o fluxo da conversa em tempo real e entrega a probabilidade de fechamento.
   */
  static analyze(messages: MessageLike[], contactName?: string): SentimentAnalysis {
    if (!messages || messages.length === 0) {
      return {
        closingProbability: 15,
        sentimentTier: 'COLD_INITIAL',
        sentimentLabel: 'Início de Contato',
        tacticalRecommendation: 'Apresente o diferencial do serviço e valide o interesse do cliente.',
        detectedObjections: [],
        engagementScore: 10,
      };
    }

    const dossier = analyzeConversationDossier(messages, contactName);
    const customerMessages = messages.filter((m) => m.direction === 'inbound' || m.direction === 'INBOUND');
    const operatorMessages = messages.filter((m) => m.direction === 'outbound' || m.direction === 'OUTBOUND');

    const customerText = customerMessages.map((m) => (m.textContent || m.text || '').toLowerCase()).join(' ');
    const lastCustomerMsg = customerMessages[customerMessages.length - 1];
    const lastText = (lastCustomerMsg?.textContent || lastCustomerMsg?.text || '').toLowerCase();

    let probability = 35;
    const detectedObjections: string[] = [];

    // 1. Sinais de Alta Intenção / Compra Imediata (Boost +30 a +45)
    if (/pix|cartao|cartão|pagar|pago|chave|link|como pago|reserva|agenda|pode marcar|marca|quero sim|fechar|vou querer/.test(lastText)) {
      probability += 45;
    } else if (/horário|horario|sexta|sábado|sabado|hoje|amanhã|amanha|tarde|manhã|manha|18h|19h|17h|14h|15h/.test(lastText)) {
      probability += 30;
    } else if (/qual endereço|onde fica|localização|localizacao|rua|bairro/.test(customerText)) {
      probability += 20;
    }

    // 2. Fricções & Objeções Detectadas (Penalidade -15 a -30)
    if (/caro|salgado|desconto|abaixa|parcela|mais barato/.test(customerText)) {
      detectedObjections.push('PREÇO');
      probability -= 15;
    }
    if (/marido|esposo|mae|mãe|ver com|pensar|depois vejo|depois te chamo|qualquer coisa falo/.test(lastText)) {
      detectedObjections.push('DECISÃO_TERCEIROS');
      probability -= 25;
    }
    if (/longe|difícil acesso|estacionamento/.test(customerText)) {
      detectedObjections.push('LOCALIZAÇÃO');
      probability -= 15;
    }

    // 3. Profundidade do Diálogo (Engajamento)
    const engagementScore = Math.min(100, customerMessages.length * 15);
    if (customerMessages.length >= 3) probability += 10;
    if (customerMessages.length >= 6) probability += 10;

    // Normalização 0 - 100
    const finalProb = Math.max(5, Math.min(98, probability));

    let sentimentTier: SentimentAnalysis['sentimentTier'] = 'COLD_INITIAL';
    let sentimentLabel = 'Início de Contato';
    let tacticalRecommendation = 'Qualifique a necessidade do cliente.';

    if (finalProb >= 75) {
      sentimentTier = 'HOT_CLOSER';
      sentimentLabel = '🔥 Super Quente (Pronto para Fechar)';
      tacticalRecommendation = 'Momento perfeito: envie os dados do Pix/Sinal ou confirme o horário imediatamente.';
    } else if (finalProb >= 50) {
      sentimentTier = 'WARM_INTEREST';
      sentimentLabel = '⚡ Interesse Ativo';
      tacticalRecommendation = 'Cliente interessado: ofereça 2 opções de horários exclusivos para forçar a escolha.';
    } else if (detectedObjections.length > 0) {
      sentimentTier = 'HESITANT_FRICTION';
      sentimentLabel = '⚠️ Objeção Detectada';
      tacticalRecommendation = `Objeção de ${detectedObjections.join(', ')} identificada: envie prova social (fotos antes/depois) ou benefício exclusivo.`;
    }

    return {
      closingProbability: finalProb,
      sentimentTier,
      sentimentLabel,
      tacticalRecommendation,
      detectedObjections,
      engagementScore,
    };
  }
}
