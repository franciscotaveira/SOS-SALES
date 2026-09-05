/**
 * SOS VENDAS - MOTOR COGNITIVO SOBERANO (Francisco Rios Framework)
 * 
 * Analisador de inteligência comercial em tempo real para WhatsApp:
 * 1. Extração semântica de Serviços / Produtos Solicitados
 * 2. Identificação precisa de Origem (Meta Ads / CTWA vs Contato Direto Orgânico)
 * 3. Mapeamento de Fatos Conhecidos & Preferências (Dossiê Vivo / Histórico)
 * 4. Ponto de Virada no Funil Comercial (Auto-Evolução de Estágio do Lead)
 * 5. Detecção de Dúvidas, Objeções e Ação Recomendada
 */

export interface MessageLike {
  id?: string;
  direction: 'INBOUND' | 'OUTBOUND' | 'inbound' | 'outbound';
  senderType?: 'CUSTOMER' | 'AI_AGENT' | 'HUMAN_OPERATOR' | 'SYSTEM' | string;
  textContent?: string | null;
  text?: string | null;
  sentAt?: string | Date;
}

export interface InferredFact {
  id: string;
  key: string;
  value: string;
  source: string;
  confidence: number;
  confirmedByCustomer: boolean;
  observedAt: string;
}

export interface CriticalGap {
  id: string;
  question: string;
  impact: string;
}

export interface SmallestNextMove {
  actionTitle: string;
  draftText: string;
  rationale: string;
  microCommitmentGoal: string;
}

export interface InferredDossier {
  primaryServiceOrProduct: string;
  confidenceService: number;
  originType: 'META_ADS' | 'ORGANIC_DIRECT';
  originLabel: string;
  campaignName: string;
  offerHook?: string;
  entryMessage?: string;
  knownFacts: InferredFact[];
  criticalGaps: CriticalGap[];
  suggestedStage: 'LEAD' | 'QUALIFICADO' | 'PROPOSTA' | 'NEGOCIACAO' | 'GANHO';
  stageReason: string;
  primaryFriction?: string;
  frictionEvidence?: string;
  antiRegressionRule: string;
  smallestNextMove: SmallestNextMove;
  suggestedAction?: string;
  suggestedDraftText?: string;
}

// Catálogo de Conhecimento Semântico Comercial (Setor de Beleza, Estética, Vendas & Serviços)
const SERVICE_PATTERNS: Array<{
  name: string;
  keywords: string[];
  weight: number;
}> = [
  {
    name: 'Design de Sobrancelha & Buço',
    keywords: ['buço', 'buco', 'sobrancelha', 'sobrancelhas', 'henna', 'egipcia', 'egípcia', 'linha buço', 'fio a fio'],
    weight: 10,
  },
  {
    name: 'Micropigmentação Nanoblading',
    keywords: ['micropigmentação', 'micropigmentacao', 'nanoblading', 'fio a fio realista', 'sobrancelha realista', 'micro'],
    weight: 10,
  },
  {
    name: 'Tratamento Capilar & Alisamento',
    keywords: ['progressiva', 'botox', 'selagem', 'alisamento', 'hidratação', 'hidratacao', 'nutrição', 'reconstrução', 'cauterização', 'cronograma'],
    weight: 8,
  },
  {
    name: 'Escova & Corte',
    keywords: ['escova', 'corte', 'cortar', 'lavagem', 'modelagem', 'babyliss', 'escova modelada'],
    weight: 8,
  },
  {
    name: 'Coloração & Mechas',
    keywords: ['mechas', 'luzes', 'loiro', 'morena iluminada', 'coloração', 'coloracao', 'tintura', 'tonalizante', 'descoloração'],
    weight: 8,
  },
  {
    name: 'Manicure & Pedicure',
    keywords: ['manicure', 'pedicure', 'unha', 'unhas', 'gel', 'fibra de vidro', 'esmaltação', 'esmalte', 'cuticulagem', 'francesinha'],
    weight: 8,
  },
  {
    name: 'Estética Facial & Corporal',
    keywords: ['limpeza de pele', 'peeling', 'massagem', 'drenagem', 'depilação', 'depilacao', 'laser', 'corporal', 'facial'],
    weight: 8,
  },
  {
    name: 'Produção Visual & Maquiagem',
    keywords: ['maquiagem', 'make', 'penteado', 'noiva', 'madrinha', 'formatura', 'evento'],
    weight: 8,
  },
];

const AD_MARKERS = [
  'vi no instagram',
  'vi o anuncio',
  'vi o anúncio',
  'vi no facebook',
  'vi no face',
  'vi a publicacao',
  'vi a publicação',
  'promoção',
  'promocao',
  'desconto',
  'trinks.com',
  'fbclid',
  'gclid',
  'utm_',
  'link do anuncio',
  'anuncio do insta',
];

export function analyzeConversationDossier(
  messages: MessageLike[],
  contactName?: string | null
): InferredDossier {
  const normalizedMsgs = (messages || [])
    .map((m) => ({
      direction: String(m.direction || '').toUpperCase(),
      senderType: String(m.senderType || '').toUpperCase(),
      text: (m.textContent || m.text || '').trim(),
      sentAt: m.sentAt ? new Date(m.sentAt).toISOString() : new Date().toISOString(),
    }))
    .filter((m) => m.text.length > 0);

  const allText = normalizedMsgs.map((m) => m.text).join(' \n ');
  const allTextLower = allText.toLowerCase();

  const customerMsgs = normalizedMsgs.filter(
    (m) => m.direction === 'INBOUND' || m.senderType === 'CUSTOMER'
  );
  const operatorMsgs = normalizedMsgs.filter(
    (m) => m.direction === 'OUTBOUND' || m.senderType === 'HUMAN_OPERATOR' || m.senderType === 'AI_AGENT'
  );

  const firstInbound = customerMsgs[0]?.text || '';
  const firstInboundLower = firstInbound.toLowerCase();

  // 1. ORIGEM DO CONTATO (Meta Ads vs Orgânico)
  let originType: 'META_ADS' | 'ORGANIC_DIRECT' = 'ORGANIC_DIRECT';
  let originLabel = 'Contato Direto (Orgânico)';
  let campaignName = 'Atendimento Direto WhatsApp';
  let offerHook: string | undefined = undefined;
  let entryMessage: string | undefined = firstInbound || undefined;

  const hasAdMarker = AD_MARKERS.some((marker) => firstInboundLower.includes(marker));
  if (hasAdMarker || firstInboundLower.includes('trinks') || firstInboundLower.includes('promo')) {
    originType = 'META_ADS';
    originLabel = 'Anúncio WhatsApp (Meta Ads / Instagram)';
    campaignName = 'Campanha Instagram / Meta Ads';
    offerHook = 'Oferta Especial de Recepção (50% OFF na Aplicação)';
  }

  // 2. EXTRAÇÃO SEMÂNTICA DO SERVIÇO SOLICITADO
  let matchedService = 'Interesse Geral / Atendimento Comercial';
  let highestScore = 0;

  for (const pattern of SERVICE_PATTERNS) {
    let score = 0;
    for (const kw of pattern.keywords) {
      if (allTextLower.includes(kw)) {
        score += pattern.weight;
        if (firstInboundLower.includes(kw)) {
          score += 10;
        }
      }
    }
    if (score > highestScore) {
      highestScore = score;
      matchedService = pattern.name;
    }
  }

  const confidenceService = highestScore > 0 ? Math.min(0.98, 0.65 + highestScore * 0.03) : 0.5;

  // 3. PONTO DE VIRADA DO FUNIL (Auto-Evolução de Estágio)
  let suggestedStage: 'LEAD' | 'QUALIFICADO' | 'PROPOSTA' | 'NEGOCIACAO' | 'GANHO' = 'LEAD';
  let stageReason = 'Contato inicial registrado no WhatsApp.';

  const wonKeywords = [
    'marcado', 'agendado', 'pode agendar', 'confirmado', 'vou sim', 'estou indo',
    'comprovante', 'pago', 'pix enviado', 'fechado', 'pode marcar', 'combinado entao',
    'combinado então', 'até mais tarde', 'ate mais tarde'
  ];
  const negotiationKeywords = [
    'horário', 'horario', 'vaga', 'quinta', 'sexta', 'sábado', 'sabado', 'amanhã',
    'amanha', 'hoje', 'às 14', 'as 14', 'às 15', 'as 15', 'às 10', 'as 10', 'tem vaga',
    'disponível', 'disponivel', 'desconto', 'parcela', 'cartão', 'qual dia'
  ];
  const proposalKeywords = [
    'r$', 'reais', 'valor é', 'custa', 'tabela', 'pacote', 'combo', 'investimento',
    'fica no valor', 'orçamento', 'orcamento'
  ];

  const hasWonSignal = wonKeywords.some((w) => allTextLower.includes(w));
  const hasNegotiationSignal = negotiationKeywords.some((w) => allTextLower.includes(w));
  const hasProposalSignal = proposalKeywords.some((w) => allTextLower.includes(w));

  if (hasWonSignal) {
    suggestedStage = 'GANHO';
    stageReason = 'Agendamento ou fechamento comercial confirmado pelo cliente.';
  } else if (hasNegotiationSignal) {
    suggestedStage = 'NEGOCIACAO';
    stageReason = 'Negociação ativa de data, horário ou condições de agendamento.';
  } else if (hasProposalSignal && operatorMsgs.length > 0) {
    suggestedStage = 'PROPOSTA';
    stageReason = 'Valores, combos ou proposta de serviço apresentados ao cliente.';
  } else if (customerMsgs.length > 0 && highestScore > 0) {
    suggestedStage = 'QUALIFICADO';
    stageReason = 'Cliente demonstrou interesse explícito no catálogo de serviços.';
  } else if (customerMsgs.length > 0) {
    suggestedStage = 'QUALIFICADO';
    stageReason = 'Cliente em conversa ativa com a equipe/atendente.';
  }

  // 4. EXTRAÇÃO DE FATOS CONHECIDOS (EKO - Certezas Confirmadas)
  const knownFacts: InferredFact[] = [];
  const now = new Date().toISOString();

  if (highestScore > 0) {
    knownFacts.push({
      id: 'fact-service-interest',
      key: 'Serviço Solicitado',
      value: matchedService,
      source: 'Conversa WhatsApp',
      confidence: confidenceService,
      confirmedByCustomer: true,
      observedAt: now,
    });
  }

  if (offerHook) {
    knownFacts.push({
      id: 'fact-offer-hook',
      key: 'Gancho de Anúncio',
      value: offerHook,
      source: 'Meta Ads Attribution',
      confidence: 0.95,
      confirmedByCustomer: true,
      observedAt: now,
    });
  }

  if (hasNegotiationSignal) {
    knownFacts.push({
      id: 'fact-scheduling-intent',
      key: 'Disponibilidade',
      value: 'Lead com intenção de vir esta semana',
      source: 'Análise de Diálogo',
      confidence: 0.88,
      confirmedByCustomer: true,
      observedAt: now,
    });
  }

  // 5. LACUNAS CRÍTICAS DE CONHECIMENTO (EKO - O que falta saber para fechar)
  const criticalGaps: CriticalGap[] = [];
  if (!allTextLower.includes('manhã') && !allTextLower.includes('tarde') && !allTextLower.includes('noite') && !hasWonSignal) {
    criticalGaps.push({
      id: 'gap-period',
      question: 'Qual período de preferência?',
      impact: 'Necessário para consultar vagas na Agenda Trinks',
    });
  }
  if (!allTextLower.includes('comprimento') && !allTextLower.includes('curto') && !allTextLower.includes('longo') && matchedService.includes('Capilar')) {
    criticalGaps.push({
      id: 'gap-hair-length',
      question: 'Qual o comprimento do cabelo?',
      impact: 'Define o tempo exato de bancada e o valor final',
    });
  }

  // 6. FRICÇÕES & OBJEÇÕES
  let primaryFriction: string | undefined = undefined;
  let frictionEvidence: string | undefined = undefined;

  if (allTextLower.includes('caro') || allTextLower.includes('desconto') || allTextLower.includes('parcela')) {
    primaryFriction = 'Sensibilidade a Preço / Orçamento';
    frictionEvidence = 'Cliente consultou condições de pagamento ou valores parcelados.';
  } else if (allTextLower.includes('lotado') || allTextLower.includes('sem horário') || allTextLower.includes('outro dia')) {
    primaryFriction = 'Disponibilidade de Agenda';
    frictionEvidence = 'Conciliação de horário com a rotina do cliente.';
  }

  // 7. REGRA DE ANTI-REGRESSÃO COGNITIVA
  let antiRegressionRule = 'Proibido reiniciar com "Olá, como posso ajudar?". Conecte diretamente à oferta ativa.';
  if (matchedService && matchedService !== 'Interesse Geral / Atendimento Comercial') {
    antiRegressionRule = `Cliente já solicitou ${matchedService}. Não pergunte qual serviço deseja. Apresente horários ou condições.`;
  }

  // 8. MENOR PRÓXIMO MOVIMENTO & SUGESTÃO TÁTICA (TESE v2)
  const firstName = contactName ? contactName.split(' ')[0] : 'tudo bem';
  let smallestNextMove: SmallestNextMove = {
    actionTitle: 'Ofertar 2 Opções de Horário Fechadas',
    draftText: `Olá ${firstName}! Temos horários livres amanhã às 14h ou às 17h para ${matchedService}. Qual desses fica melhor para você?`,
    rationale: 'Reduz o atrito cognitivo do cliente escolhendo entre 2 opções simples.',
    microCommitmentGoal: 'Definir o período do atendimento.',
  };

  if (suggestedStage === 'NEGOCIACAO') {
    smallestNextMove = {
      actionTitle: 'Conquistar Microcompromisso de Reserva',
      draftText: `Perfeito ${firstName}! Posso garantir sua vaga amanhã às 15h? Me envie seu nome completo para bloquear na agenda!`,
      rationale: 'Cliente já negociou o dia. Travar a vaga antes que esfrie.',
      microCommitmentGoal: 'Bloquear horário na Agenda Trinks.',
    };
  } else if (suggestedStage === 'GANHO') {
    smallestNextMove = {
      actionTitle: 'Enviar Dados de Pagamento / Sinal',
      draftText: `Show ${firstName}! Agendamento confirmado! Segue nossa chave Pix para a taxa de reserva. Envie o comprovante aqui para garantir sua vaga. Até breve!`,
      rationale: 'Agendamento concluído. Confirmar com chave Pix para garantir presença.',
      microCommitmentGoal: 'Garantir comparecimento com sinal Pix.',
    };
  }

  return {
    primaryServiceOrProduct: matchedService,
    confidenceService,
    originType,
    originLabel,
    campaignName,
    offerHook,
    entryMessage,
    knownFacts,
    criticalGaps,
    suggestedStage,
    stageReason,
    primaryFriction,
    frictionEvidence,
    antiRegressionRule,
    smallestNextMove,
    suggestedAction: smallestNextMove.actionTitle,
    suggestedDraftText: smallestNextMove.draftText,
  };
}
