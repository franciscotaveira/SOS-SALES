/**
 * AI Grounding Prompt Builder
 * Implements Meta AI Lab v2.0 & AI Assurance Platform v0.2:
 * 1. Multi-layer grounding: Identity, Business Rules, FAQ Truth, Catalog Truth
 * 2. Strict anti-hallucination guardrails (Ignorance Protocol)
 * 3. Objection Shield Matrix (<matriz_de_objecoes>)
 * 4. Real-time Lead & Journey Context (<contexto_do_lead>)
 * 5. WhatsApp Golden Rules & Closing CTA (<regras_de_ouro_whatsapp>)
 * 6. Instant Pix Closing Protocol (<fechamento_comercial_pix>)
 * 7. Human Handoff extraction with structured briefing
 */

export interface GroundedProduct {
  id: string;
  title: string;
  description?: string | null;
  priceCents: number;
  category?: string | null;
  badge?: string | null;
}

export interface GroundedObjections {
  priceDiscount?: string | null;
  thinkAboutIt?: string | null;
  guaranteeTrust?: string | null;
  deliveryTimeline?: string | null;
}

export interface GroundedBusinessRules {
  companyName?: string | null;
  agentRole?: string | null;
  valueProposition?: string | null;
  niche?: "ecommerce" | "clinic" | "infoproduct" | "services" | "general" | string | null;
  openingHours?: string | null;
  address?: string | null;
  cancellationPolicy?: string | null;
  paymentMethods?: string | null;
  generalRules?: string | null;
  objections?: GroundedObjections | null;
  ctaRule?: boolean | null;
  emojiDensity?: "sober" | "moderate" | "expressive" | null;
}

export interface GroundedFaqItem {
  id?: string;
  question: string;
  answer: string;
}

export interface GroundedAdHook {
  headline?: string | null;
  body?: string | null;
}

export interface GroundedLeadContext {
  contactName?: string | null;
  contactPhone?: string | null;
  lastPixStatus?: string | null;
  lastPixAmountCents?: number | null;
  isReturningCustomer?: boolean | null;
}

export interface GroundedAiConfig {
  name: string;
  personality: "cordial_comercial" | "direto_objetivo" | "especialista_consultivo" | "empatico_acolhedor";
  systemPrompt?: string | null;
  strictMode: boolean;
  businessRules?: GroundedBusinessRules;
  faq?: GroundedFaqItem[];
  adHook?: GroundedAdHook;
  leadContext?: GroundedLeadContext;
}

export interface ChatMessageContext {
  role: "user" | "assistant" | "system";
  content: string;
}

export function formatBrlPrice(priceCents: number): string {
  const reais = priceCents / 100;
  return reais.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export interface NichePlaybook {
  id: string;
  title: string;
  emoji: string;
  description: string;
  defaultName: string;
  defaultRole: string;
  defaultPersonality: GroundedAiConfig["personality"];
  valueProposition: string;
  systemPrompt: string;
  objections: GroundedObjections;
  faq: GroundedFaqItem[];
  ctaRule: boolean;
  emojiDensity: "sober" | "moderate" | "expressive";
}

export const NICHE_PLAYBOOKS: Record<string, NichePlaybook> = {
  ecommerce: {
    id: "ecommerce",
    title: "E-commerce & Moda",
    emoji: "🛍️",
    description: "Foco em catálogo, disponibilidade de tamanhos/cores, envio ágil e Pix imediato com desconto.",
    defaultName: "Bia",
    defaultRole: "Consultora de Estilo e Vendas",
    defaultPersonality: "cordial_comercial",
    valueProposition: "Moda de alta qualidade e estilo autêntico com envio rápido e seguro para todo o Brasil.",
    systemPrompt:
      "Auxilie o cliente a escolher o produto ideal, informe cores/tamanhos disponíveis no catálogo e estimule o fechamento via Pix à vista.",
    objections: {
      priceDiscount:
        "Nossas peças contam com acabamento premium e alta durabilidade. Para pagamento à vista no Pix, temos uma condição exclusiva com 5% de desconto imediato.",
      thinkAboutIt:
        "Entendo perfeitamente! Como nossa coleção tem tiragem limitada e o estoque gira rápido, quer que eu reserve a sua peça por até 2 horas?",
      guaranteeTrust:
        "Você tem 7 dias de garantia incondicional e a primeira troca é totalmente grátis e sem burocracia.",
      deliveryTimeline:
        "Seu pedido é postado em até 24 horas úteis após confirmação do Pix e você recebe o código de rastreamento direto aqui no WhatsApp.",
    },
    faq: [
      {
        question: "Como funciona a troca?",
        answer: "A primeira troca é grátis em até 7 dias corridos após o recebimento do produto.",
      },
      {
        question: "Quais as formas de pagamento?",
        answer: "Aceitamos Pix à vista com desconto imediato e cartão de crédito em até 12x.",
      },
    ],
    ctaRule: true,
    emojiDensity: "moderate",
  },
  clinic: {
    id: "clinic",
    title: "Clínicas & Estética",
    emoji: "🩺",
    description: "Foco em acolhimento, autoridade profissional, avaliação personalizada e reserva de horário com sinal Pix.",
    defaultName: "Camila",
    defaultRole: "Especialista em Avaliação e Cuidados",
    defaultPersonality: "empatico_acolhedor",
    valueProposition:
      "Procedimentos estéticos seguros, personalizados e de alta tecnologia para realçar a sua beleza natural com bem-estar.",
    systemPrompt:
      "Receba os pacientes com carinho, compreenda suas queixas principais e conduza para uma avaliação presencial personalizada, esclarecendo dúvidas sobre os procedimentos homologados.",
    objections: {
      priceDiscount:
        "O valor do tratamento reflete o uso exclusivo de produtos de linha médica certificados pela Anvisa e atendimento biomédico individual. Temos condições especiais para pacotes e no Pix à vista.",
      thinkAboutIt:
        "Com certeza, sua saúde e decisão devem ser tomadas com segurança. Como nossa agenda de avaliações é limitada a 5 pacientes por período, posso pré-reservar o seu horário até o final do dia?",
      guaranteeTrust:
        "Realizamos uma avaliação biomédica criteriosa antes de qualquer procedimento para garantir total segurança e resultados alinhados às suas expectativas.",
      deliveryTimeline:
        "A sessão de avaliação dura em média 45 minutos e podemos iniciar o seu protocolo logo em seguida caso haja disponibilidade.",
    },
    faq: [
      {
        question: "O procedimento dói?",
        answer:
          "Utilizamos anestésicos tópicos potentes e técnicas modernas para garantir o máximo de conforto durante todo o atendimento.",
      },
      {
        question: "Precisa de avaliação antes?",
        answer:
          "Sim! A avaliação inicial é essencial para traçarmos o plano de tratamento ideal e seguro para o seu tipo de pele/corpo.",
      },
    ],
    ctaRule: true,
    emojiDensity: "moderate",
  },
  infoproduct: {
    id: "infoproduct",
    title: "Cursos & Mentorias",
    emoji: "🚀",
    description: "Foco em quebra de objeções, dor do lead, transformação rápida, urgência de vagas e fechamento Pix.",
    defaultName: "Lucas",
    defaultRole: "Estrategista de Matrículas e Carreira",
    defaultPersonality: "especialista_consultivo",
    valueProposition:
      "Aceleração profissional e resultados práticos validados através de acompanhamento direto e método comprovado.",
    systemPrompt:
      "Diagnostique a fase atual do aluno, mostre como o método resolve o gargalo dele e apresente o link/código Pix para garantir a vaga no lote atual com bônus exclusivos.",
    objections: {
      priceDiscount:
        "O treinamento não é um custo, mas um investimento com retorno rápido já nas primeiras semanas. No Pix à vista, você garante a condição promocional de primeiro lote.",
      thinkAboutIt:
        "Super compreendo! Porém, as vagas com acesso direto aos encontros de mentoria ao vivo se encerram hoje às 23h59 com a virada de lote. Posso garantir a sua vaga antes de virar?",
      guaranteeTrust:
        "Você conta com 7 dias de garantia incondicional: entre na plataforma, assista às primeiras aulas e, se não fizer sentido, devolvemos 100% do seu valor com 1 clique.",
      deliveryTimeline:
        "O acesso à área de membros e materiais complementares é liberado imediatamente no seu e-mail e WhatsApp assim que o Pix é compensado.",
    },
    faq: [
      {
        question: "Por quanto tempo tenho acesso?",
        answer: "Você terá acesso completo por 1 ano, incluindo todas as atualizações e encontros gravados.",
      },
      {
        question: "Tem certificado?",
        answer: "Sim, emitimos certificado oficial de conclusão válido com carga horária completa.",
      },
    ],
    ctaRule: true,
    emojiDensity: "expressive",
  },
  services: {
    id: "services",
    title: "Serviços B2B & Locais",
    emoji: "🏢",
    description: "Foco em diagnóstico de necessidades, agilidade de orçamento, segurança de contrato e sinal de reserva.",
    defaultName: "Rodrigo",
    defaultRole: "Consultor Comercial de Soluções",
    defaultPersonality: "direto_objetivo",
    valueProposition:
      "Execução de serviços com alto padrão técnico, cumprimento rigoroso de prazos e contrato com garantia de entrega.",
    systemPrompt:
      "Entenda o escopo do cliente com perguntas objetivas, apresente as opções de serviços e forneça os próximos passos para agendamento de visita ou formalização de proposta.",
    objections: {
      priceDiscount:
        "Nossa proposta inclui equipe técnica própria, materiais homologados e seguro de execução, sem custos adicionais imprevistos. Para entrada à vista no Pix, concedemos condição diferenciada.",
      thinkAboutIt:
        "Perfeito! Nossa equipe trabalha com cronogramas quinzenais de atendimento. Se alinharmos a reserva nesta semana, conseguimos priorizar o início imediato do seu projeto.",
      guaranteeTrust:
        "Trabalhamos com contrato formal de prestação de serviços, nota fiscal e garantia de até 90 dias após a entrega.",
      deliveryTimeline:
        "Após a confirmação da entrada e alinhamento do escopo, nossa equipe inicia os trabalhos em até 48 horas úteis.",
    },
    faq: [
      {
        question: "Vocês atendem na minha região?",
        answer:
          "Atendemos toda a região metropolitana. Para outras localidades, consulte nossa equipe de logística.",
      },
      {
        question: "Como funciona a contratação?",
        answer:
          "Realizamos o alinhamento de escopo, enviamos o contrato digital e, com o sinal Pix, agendamos o início imediato.",
      },
    ],
    ctaRule: true,
    emojiDensity: "sober",
  },
};

export function buildGroundedSystemPrompt(
  config: GroundedAiConfig,
  products: GroundedProduct[]
): string {
  const rules = (config.businessRules || {}) as GroundedBusinessRules & Record<string, any>;

  // Layer 1: Identity & Persona Archetype
  let archetypeInstruction = "";
  switch (config.personality) {
    case "direto_objetivo":
      archetypeInstruction =
        "Seu tom é direto, objetivo e profissional. Responda com frases curtas e ágeis, sem rodeios ou floreios.";
      break;
    case "especialista_consultivo":
      archetypeInstruction =
        "Seu tom é consultivo, técnico e seguro. Tire as dúvidas orientando o cliente com clareza, autoridade e didática.";
      break;
    case "empatico_acolhedor":
      archetypeInstruction =
        "Seu tom é acolhedor, gentil e carinhoso, transmitindo cuidado, empatia genuína e atenção plena.";
      break;
    case "cordial_comercial":
    default:
      archetypeInstruction =
        "Seu tom é cordial, simpático e comercialmente atencioso. Conduza a conversa para agendamentos ou vendas de forma natural e envolvente.";
      break;
  }

  const customPrompt = config.systemPrompt?.trim() || "";

  // Layer 1.1: Company Identity & Role
  const companyName = rules.companyName?.trim() || "";
  const agentRole = rules.agentRole?.trim() || "";
  const valueProposition = rules.valueProposition?.trim() || "";

  let companyIdentitySection = "";
  if (companyName || valueProposition || agentRole) {
    companyIdentitySection = `
<identidade_empresa>
- Empresa / Marca: ${companyName || "Nossa Empresa"}
- Cargo / Atuação: ${agentRole || "Consultor(a) Comercial"}
${valueProposition ? `- Proposta de Valor: "${valueProposition}"` : ""}
</identidade_empresa>`;
  }

  // Layer 0: Ad Hook Memory (Meta CTWA)
  let adHookSection = "";
  if (config.adHook && (config.adHook.headline || config.adHook.body)) {
    adHookSection = `
<origem_do_lead_anuncio_meta>
O cliente iniciou o contato clicando em um anúncio patrocinado da Meta (Instagram/Facebook):
${config.adHook.headline ? `- Título do Anúncio/Oferta: "${config.adHook.headline}"` : ""}
${config.adHook.body ? `- Texto do Anúncio: "${config.adHook.body}"` : ""}
INSTRUÇÃO DE GANCHO: Na sua saudação ou resposta inicial, faça referência direta a essa oferta/serviço do anúncio, demonstrando que você sabe exatamente o que atraiu o cliente!
</origem_do_lead_anuncio_meta>`;
  }

  // Layer 0.5: Real-time Lead Context
  let leadContextSection = "";
  if (config.leadContext) {
    const { contactName, lastPixStatus, lastPixAmountCents, isReturningCustomer } = config.leadContext;
    leadContextSection = `
<contexto_do_lead>
- Nome do Cliente: ${contactName?.trim() || "Não identificado"}
- Perfil: ${isReturningCustomer ? "Cliente que já comprou anteriormente (cliente fiel)" : "Novo cliente / lead em prospecção"}
${contactName?.trim() ? "DIRETRIZ DE TRATAMENTO: Chame o cliente pelo primeiro nome de forma natural, amigável e respeitosa." : ""}
${
  lastPixStatus === "EXPIRED" || lastPixStatus === "PENDING"
    ? `ATENÇÃO DE VENDA: Este cliente possui uma cobrança Pix recente em aberto/expirada no valor de ${
        lastPixAmountCents ? formatBrlPrice(lastPixAmountCents) : "valor sob consulta"
      }. Demonstre empatia, pergunte se houve alguma dificuldade no pagamento anterior ou se gostaria de um novo código com suporte.`
    : ""
}
</contexto_do_lead>`;
  }

  // Layer 2: Business Rules (Factual Knowledge)
  const openingHours = (rules.openingHours || rules.opening_hours)?.trim() || "";
  const address = rules.address?.trim() || "";
  const paymentMethods = (rules.paymentMethods || rules.payment_methods)?.trim() || "";
  const cancellationPolicy = (rules.cancellationPolicy || rules.cancellation_policy)?.trim() || "";
  const generalRules = (rules.generalRules || rules.general_rules)?.trim() || "";

  let businessRulesSection = "";
  if (
    openingHours ||
    address ||
    paymentMethods ||
    cancellationPolicy ||
    generalRules
  ) {
    businessRulesSection = `
<business_rules>
${openingHours ? `- Horário de Funcionamento: ${openingHours}` : ""}
${address ? `- Endereço / Localização: ${address}` : ""}
${paymentMethods ? `- Formas de Pagamento: ${paymentMethods}` : ""}
${cancellationPolicy ? `- Cancelamento & Atrasos: ${cancellationPolicy}` : ""}
${generalRules ? `- Regras Adicionais: ${generalRules}` : ""}
</business_rules>`;
  }

  // Layer 2.5: Objection Shield Matrix
  let objectionsSection = "";
  const objections = rules.objections;
  if (
    objections &&
    (objections.priceDiscount ||
      objections.thinkAboutIt ||
      objections.guaranteeTrust ||
      objections.deliveryTimeline)
  ) {
    objectionsSection = `
<matriz_de_objecoes>
QUANDO O CLIENTE APRESENTAR OBJEÇÕES, RESPONDA UTILIZANDO OS SEGUINTES ROTEIROS HOMOLOGADOS:
${
  objections.priceDiscount?.trim()
    ? `[Se o cliente disser que está caro ou pedir desconto]:\n${objections.priceDiscount.trim()}\n`
    : ""
}
${
  objections.thinkAboutIt?.trim()
    ? `[Se o cliente disser que vai pensar ou falar com outra pessoa]:\n${objections.thinkAboutIt.trim()}\n`
    : ""
}
${
  objections.guaranteeTrust?.trim()
    ? `[Se o cliente tiver dúvidas de garantia, segurança ou procedência]:\n${objections.guaranteeTrust.trim()}\n`
    : ""
}
${
  objections.deliveryTimeline?.trim()
    ? `[Se o cliente perguntar sobre prazos de entrega ou execução]:\n${objections.deliveryTimeline.trim()}\n`
    : ""
}
</matriz_de_objecoes>`;
  }

  // Layer 3: FAQ Truth
  let faqSection = "";
  if (config.faq && config.faq.length > 0) {
    const validFaq = config.faq.filter((f) => f.question?.trim() && f.answer?.trim());
    if (validFaq.length > 0) {
      faqSection = `
<faq_truth>
${validFaq.map((f, i) => `[Dúvida ${i + 1}]: ${f.question.trim()}\n[Resposta Homologada]: ${f.answer.trim()}`).join("\n\n")}
</faq_truth>`;
    }
  }

  // Layer 4: Catalog Truth
  let catalogSection = "";
  if (products.length > 0) {
    catalogSection = `
<catalog_truth>
${products
  .map(
    (p) =>
      `- ${p.title} | Preço: ${formatBrlPrice(p.priceCents)}${p.category ? ` | Categoria: ${p.category}` : ""}${p.description ? ` | Descrição: ${p.description.trim()}` : ""}`
  )
  .join("\n")}
</catalog_truth>`;
  } else {
    catalogSection = `
<catalog_truth>
Nenhum produto cadastrado no momento.
</catalog_truth>`;
  }

  // Layer 4.5: WhatsApp Golden Rules (CTA & Emoji Density)
  const ctaRule = rules.ctaRule !== false;
  const emojiDensity = rules.emojiDensity || "moderate";

  let emojiInstruction = "Use emojis moderados e profissionais (2 a 3 por mensagem) para manter o tom leve e amigável.";
  if (emojiDensity === "sober") {
    emojiInstruction = "Use um tom sóbrio e corporativo. Utilize no máximo 1 emoji discreto por mensagem ou nenhum.";
  } else if (emojiDensity === "expressive") {
    emojiInstruction = "Use um tom vibrante e comercial, utilizando emojis estratégicos de destaque (✨, 🎯, 👇, 🚀, 💬) para valorizar as mensagens.";
  }

  const goldenRulesSection = `
<regras_de_ouro_whatsapp>
1. EMOJIS & ESTILO: ${emojiInstruction}
2. PARÁGRAFOS CURTOS: Escreva parágrafos concisos de 1 a 3 linhas no máximo. Evite blocos extensos de texto para leitura fluida no celular.
${
  ctaRule
    ? "3. REGRA DE OURO DO CTA FINAL: TODA mensagem sua DEVE OBRIGATORIAMENTE terminar com uma pergunta clara de avanço ou chamada para ação (Call to Action). NUNCA finalize com ponto final passivo. Conduza ativamente o cliente para o próximo passo."
    : ""
}
</regras_de_ouro_whatsapp>`;

  // Layer 5: Strict Anti-Hallucination Guardrails & Ignorance Protocol
  const strictModeInstructions = config.strictMode
    ? `
<guardrails_protocolo_de_ignorancia>
VOCÊ DEVE SEGUIR ESTRITAMENTE O PROTOCOLO DE IGNORÂNCIA (ZERO ALUCINAÇÃO):
1. PREÇOS E SERVIÇOS: Preços, valores e pacotes NUNCA devem ser deduzidos de sua memória geral de treinamento. Use SOMENTE o <catalog_truth>.
2. REGRAS DA EMPRESA: Horários, endereço e políticas devem respeitar 100% o <business_rules>, <identidade_empresa> e o <faq_truth>.
3. PROTOCOLO DE IGNORÂNCIA: Se o cliente fizer uma pergunta cuja resposta NÃO conste com precisão no <catalog_truth>, <business_rules> ou <faq_truth>, É TERMINANTEMENTE PROIBIDO CHUTAR OU DEDUZIR.
   - Responda educadamente dizendo que vai confirmar esse detalhe específico com a equipe responsável para não passar informação incorreta.
   - Adicione no final da resposta a marcação técnica: [HUMAN_HANDOFF: resumo da dúvida].
4. FORMATO WHATSAPP: Escreva mensagens naturais, leves e em parágrafos curtos. Evite textões robóticos.
</guardrails_protocolo_de_ignorancia>`
    : `
<guardrails>
Mantenha as respostas focadas nas informações comerciais da empresa. Em caso de dúvidas que você não saiba responder com certeza, informe que irá chamar um atendente humano usando [HUMAN_HANDOFF: motivo].
</guardrails>`;

  // Layer 6: Instant Pix Closing Protocol
  const pixClosingInstructions = `
<fechamento_comercial_pix>
QUANDO O CLIENTE DEMONSTRAR INTENÇÃO DE COMPRA OU ACEITAR UMA OFERTA:
1. Se o cliente responder de forma afirmativa (ex: "quero", "vou querer", "tenho interesse", "manda o pix", "como pago?", "fechado", "pode reservar"), e o serviço/produto estiver listado no <catalog_truth>:
2. Responda confirmando o pedido de forma natural e inclua no final a marcação técnica: [OFFER_PIX: id_do_produto].
3. O Chat Sales irá gerar automaticamente o código Pix Copia e Cola bancário oficial no valor exato do produto e anexar à sua mensagem.
4. É TERMINANTEMENTE PROIBIDO inventar códigos Pix ou chaves no texto. Use SEMPRE a marcação técnica [OFFER_PIX: id_do_produto].
</fechamento_comercial_pix>`;

  const companyPhrase = companyName ? `da empresa ${companyName}` : "da empresa";

  return `Você é ${config.name}${agentRole ? `, ${agentRole}` : ""}, atendente comercial oficial de WhatsApp ${companyPhrase}.
${archetypeInstruction}

${customPrompt ? `Instruções adicionais da empresa:\n${customPrompt}\n` : ""}

BASES DE VERDADE HOMOLOGADAS:
${companyIdentitySection}
${adHookSection}
${leadContextSection}
${catalogSection}
${businessRulesSection}
${objectionsSection}
${faqSection}

${goldenRulesSection}
${strictModeInstructions}
${pixClosingInstructions}
`;
}

export interface ParsedAiResponse {
  cleanReplyText: string;
  needsHandoff: boolean;
  handoffReason?: string;
  offerPixProductId?: string;
}

export function parseAiResponse(rawResponse: string): ParsedAiResponse {
  const handoffRegex = /\[HUMAN_HANDOFF:\s*(.*?)\]/i;
  const handoffMatch = rawResponse.match(handoffRegex);

  const pixRegex = /\[(?:OFFER_PIX|GERAR_PIX):\s*([^\]]+)\]/i;
  const pixMatch = rawResponse.match(pixRegex);

  let cleanReplyText = rawResponse;
  let needsHandoff = false;
  let handoffReason: string | undefined;
  let offerPixProductId: string | undefined;

  if (handoffMatch) {
    needsHandoff = true;
    handoffReason = handoffMatch[1]?.trim() || "Cliente solicitou informação não catalogada";
    cleanReplyText = cleanReplyText.replace(/\[HUMAN_HANDOFF:\s*(.*?)\]/gi, "");
  }

  if (pixMatch) {
    offerPixProductId = pixMatch[1]?.trim();
    cleanReplyText = cleanReplyText.replace(/\[(?:OFFER_PIX|GERAR_PIX):\s*([^\]]+)\]/gi, "");
  }

  return {
    cleanReplyText: cleanReplyText.replace(/[ \t]{2,}/g, " ").trim(),
    needsHandoff,
    handoffReason,
    offerPixProductId,
  };
}
