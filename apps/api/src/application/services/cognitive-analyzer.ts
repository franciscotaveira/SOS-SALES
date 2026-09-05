import { SOS_SALES_OFFERS } from './commercial-offers.js';

/**
 * SOS SALES - MOTOR COGNITIVO SOBERANO (Backend Edition)
 * Análise semântica e enriquecimento de jornada em tempo de leitura/escrita.
 */

export interface MessageLike {
  id?: string;
  direction: 'INBOUND' | 'OUTBOUND' | 'inbound' | 'outbound' | string;
  senderType?: 'CUSTOMER' | 'AI_AGENT' | 'HUMAN_OPERATOR' | 'SYSTEM' | string;
  textContent?: string | null;
  text?: string | null;
  sentAt?: string | Date;
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
  knownFacts: Array<{
    id: string;
    key: string;
    value: string;
    source: string;
    confidence: number;
    confirmedByCustomer: boolean;
    observedAt: string;
  }>;
  criticalGaps?: CriticalGap[];
  suggestedStage: 'LEAD' | 'QUALIFICADO' | 'PROPOSTA' | 'NEGOCIACAO' | 'GANHO';
  stageReason: string;
  primaryFriction?: string;
  frictionEvidence?: string;
  antiRegressionRule?: string;
  smallestNextMove?: SmallestNextMove;
}

const SERVICE_PATTERNS = [
  // SaaS & SOS Vendas Commercial Patterns
  {
    name: 'Planos Anuais SOS Vendas (Pix ou Cartão)',
    keywords: [
      'anual', 'empresa amiga', 'anuidade', 'plano anual', 'licença anual',
      'licenca anual', 'desconto anual', 'promoção anual', 'promocao anual',
      '582', '698,40', '698.40', '58,20', '58.20', 'pix', 'cartão', 'cartao',
    ],
    weight: 12,
  },
  {
    name: `${SOS_SALES_OFFERS.monthly.name} (${SOS_SALES_OFFERS.monthly.displayPrice})`,
    keywords: ['mensal', 'mensalidade', '97', 'flexivel', 'flexível', 'plano mensal', 'sem fidelidade'],
    weight: 10,
  },
  {
    name: 'Plano Escala VIP / Implantação',
    keywords: ['escala', 'vip', 'implantação', 'implantacao', 'equipe grande', 'multi-atendente', 'consultoria'],
    weight: 10,
  },
  {
    name: 'Automação WhatsApp & Agente IA',
    keywords: ['ia', 'agente', 'bot', 'sofia', 'receptionist', 'automação', 'automacao', 'waha', 'waba', 'meta ads', 'vácuo', 'vacuo', 'responder sozinho'],
    weight: 9,
  },
  // Haven / Estética / Beleza Patterns
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
  _contactName?: string | null
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
    offerHook = 'Oferta Especial de Recepção';
  }

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

  const knownFacts: Array<{
    id: string;
    key: string;
    value: string;
    source: string;
    confidence: number;
    confirmedByCustomer: boolean;
    observedAt: string;
  }> = [];
  const now = new Date().toISOString();

  if (highestScore > 0) {
    knownFacts.push({
      id: 'fact-service-interest',
      key: 'Interesse Principal',
      value: `Solicitou atendimento para ${matchedService}`,
      source: 'Conversa WhatsApp',
      confidence: confidenceService,
      confirmedByCustomer: true,
      observedAt: now,
    });
  }

  if (customerMsgs.length > 0) {
    const snippet = customerMsgs[customerMsgs.length - 1].text;
    knownFacts.push({
      id: 'fact-last-intent',
      key: 'Última Mensagem do Lead',
      value: `"${snippet.length > 80 ? snippet.slice(0, 80) + '...' : snippet}"`,
      source: 'Mensagem do Cliente',
      confidence: 0.95,
      confirmedByCustomer: true,
      observedAt: now,
    });
  }

  knownFacts.push({
    id: 'fact-origin-channel',
    key: 'Canal de Entrada',
    value: originLabel,
    source: 'Rastreamento de Origem',
    confidence: 0.90,
    confirmedByCustomer: false,
    observedAt: now,
  });

  // Fricções & Objeções
  let primaryFriction: string | undefined = undefined;
  let frictionEvidence: string | undefined = undefined;
  if (allTextLower.includes('caro') || allTextLower.includes('desconto') || allTextLower.includes('parcela')) {
    primaryFriction = 'Sensibilidade a Preço / Orçamento';
    frictionEvidence = 'Cliente consultou condições de pagamento ou valores parcelados.';
  } else if (allTextLower.includes('lotado') || allTextLower.includes('sem horário') || allTextLower.includes('outro dia')) {
    primaryFriction = 'Disponibilidade de Agenda';
    frictionEvidence = 'Conciliação de horário com a rotina do cliente.';
  }

  // Lacunas Críticas de Fechamento (EKO)
  const criticalGaps: CriticalGap[] = [];
  if (matchedService.includes('Plano') && !allTextLower.includes('cartão') && !allTextLower.includes('pix') && !hasWonSignal) {
    criticalGaps.push({
      id: 'gap-payment-method',
      question: 'Qual a forma preferida de pagamento (Pix ou Cartão em 12x)?',
      impact: 'Define o envio do link de checkout ou da chave Pix de ativação.',
    });
  }

  // Regra Anti-Regressão Cognitiva (Francisco Rios Framework)
  let antiRegressionRule = 'Proibido reiniciar com "Olá, como posso ajudar?". Conecte diretamente à oferta ativa.';
  if (matchedService && matchedService !== 'Interesse Geral / Atendimento Comercial') {
    antiRegressionRule = `Cliente já solicitou ${matchedService}. Não pergunte qual produto/serviço deseja. Apresente valores ou o próximo passo.`;
  }

  // Menor Próximo Passo (SmallestNextMove)
  const firstName = _contactName ? _contactName.split(' ')[0] : 'tudo bem';
  let smallestNextMove: SmallestNextMove = {
    actionTitle: 'Apresentar Condição e Ofertar Escolha Binária',
    draftText: `Olá ${firstName}! O ${matchedService} está com condição especial hoje. Quer que eu libere seu acesso agora ou prefere tirar alguma dúvida antes?`,
    rationale: 'Reduz o atrito cognitivo do cliente oferecendo uma escolha binária simples.',
    microCommitmentGoal: 'Definir o próximo passo de adesão.',
  };

  if (suggestedStage === 'NEGOCIACAO') {
    smallestNextMove = {
      actionTitle: 'Conquistar Microcompromisso de Fechamento',
      draftText: `Perfeito ${firstName}! Posso gerar o link de liberação imediata do seu plano com a condição especial? Me confirma seu melhor e-mail!`,
      rationale: 'Cliente já negociou. Travar o microcompromisso antes que o momentum esfrie.',
      microCommitmentGoal: 'Obter e-mail para envio de ativação.',
    };
  } else if (suggestedStage === 'GANHO') {
    smallestNextMove = {
      actionTitle: 'Enviar Dados de Pagamento / Ativação',
      draftText: `Show ${firstName}! Tudo pronto para iniciar! Segue nossa chave Pix oficial para a ativação imediata. Assim que enviar o comprovante, liberamos seu acesso!`,
      rationale: 'Fechamento comercial confirmado. Conduzir ao pagamento imediato.',
      microCommitmentGoal: 'Confirmar pagamento do sinal/plano.',
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
  };
}
