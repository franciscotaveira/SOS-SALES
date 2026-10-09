/**
 * AI Grounding Prompt Builder
 * Implements Meta AI Lab v2.0 & AI Assurance Platform v0.2:
 * 1. Multi-layer grounding: Identity, Business Rules, FAQ Truth, Catalog Truth
 * 2. Strict anti-hallucination guardrails (Ignorance Protocol)
 * 3. Human Handoff extraction with structured briefing
 */

export interface GroundedProduct {
  id: string;
  title: string;
  description?: string | null;
  priceCents: number;
  category?: string | null;
  badge?: string | null;
}

export interface GroundedBusinessRules {
  openingHours?: string | null;
  address?: string | null;
  cancellationPolicy?: string | null;
  paymentMethods?: string | null;
  generalRules?: string | null;
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

export interface GroundedAiConfig {
  name: string;
  personality: "cordial_comercial" | "direto_objetivo" | "especialista_consultivo" | "empatico_acolhedor";
  systemPrompt?: string | null;
  strictMode: boolean;
  businessRules?: GroundedBusinessRules;
  faq?: GroundedFaqItem[];
  adHook?: GroundedAdHook;
}

export interface ChatMessageContext {
  role: "user" | "assistant" | "system";
  content: string;
}

export function formatBrlPrice(priceCents: number): string {
  const reais = priceCents / 100;
  return reais.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function buildGroundedSystemPrompt(
  config: GroundedAiConfig,
  products: GroundedProduct[]
): string {
  // Layer 1: Identity & Persona Archetype
  let archetypeInstruction = "";
  switch (config.personality) {
    case "direto_objetivo":
      archetypeInstruction =
        "Seu tom é direto, objetivo e profissional. Responda com frases curtas e ágeis, sem rodeios.";
      break;
    case "especialista_consultivo":
      archetypeInstruction =
        "Seu tom é consultivo, técnico e seguro. Tire as dúvidas orientando o cliente com clareza e autoridade.";
      break;
    case "empatico_acolhedor":
      archetypeInstruction =
        "Seu tom é acolhedor, gentil e carinhoso, transmitindo cuidado, atenção e bem-estar.";
      break;
    case "cordial_comercial":
    default:
      archetypeInstruction =
        "Seu tom é cordial, simpático e comercialmente atencioso. Conduza a conversa para agendamentos ou vendas de forma natural.";
      break;
  }

  const customPrompt = config.systemPrompt?.trim() || "";

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

  // Layer 2: Business Rules (Factual Knowledge)
  const rules = config.businessRules || {};
  let businessRulesSection = "";
  if (
    rules.openingHours ||
    rules.address ||
    rules.paymentMethods ||
    rules.cancellationPolicy ||
    rules.generalRules
  ) {
    businessRulesSection = `
<business_rules>
${rules.openingHours ? `- Horário de Funcionamento: ${rules.openingHours}` : ""}
${rules.address ? `- Endereço / Localização: ${rules.address}` : ""}
${rules.paymentMethods ? `- Formas de Pagamento: ${rules.paymentMethods}` : ""}
${rules.cancellationPolicy ? `- Cancelamento & Atrasos: ${rules.cancellationPolicy}` : ""}
${rules.generalRules ? `- Regras Adicionais: ${rules.generalRules}` : ""}
</business_rules>`;
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

  // Layer 5: Strict Anti-Hallucination Guardrails & Ignorance Protocol
  const strictModeInstructions = config.strictMode
    ? `
<guardrails_protocolo_de_ignorancia>
VOCÊ DEVE SEGUIR ESTRITAMENTE O PROTOCOLO DE IGNORÂNCIA (ZERO ALUCINAÇÃO):
1. PREÇOS E SERVIÇOS: Preços, valores e pacotes NUNCA devem ser deduzidos de sua memória geral de treinamento. Use SOMENTE o <catalog_truth>.
2. REGRAS DA EMPRESA: Horários, endereço e políticas devem respeitar 100% o <business_rules> e o <faq_truth>.
3. PROTOCOLO DE IGNORÂNCIA: Se o cliente fizer uma pergunta cuja resposta NÃO conste com precisão no <catalog_truth>, <business_rules> ou <faq_truth>, É TERMINANTEMENTE PROIBIDO CHUTAR OU DEDUZIR.
   - Responda educadamente dizendo que vai confirmar esse detalhe específico com a equipe responsável para não passar informação incorreta.
   - Adicione no final da resposta a marcação técnica: [HUMAN_HANDOFF: resumo da dúvida].
4. FORMATO WHATSAPP: Escreva mensagens naturais, leves e em parágrafos curtos. Evite textões robóticos.
</guardrails_protocolo_de_ignorancia>`
    : `
<guardrails>
Mantenha as respostas focadas nas informações comerciais da empresa. Em caso de dúvidas que você não saiba responder com certeza, informe que irá chamar um atendente humano usando [HUMAN_HANDOFF: motivo].
</guardrails>`;

  return `Você é ${config.name}, assistente comercial de WhatsApp da empresa.
${archetypeInstruction}

${customPrompt ? `Instruções adicionais da empresa:\n${customPrompt}\n` : ""}

BASES DE VERDADE HOMOLOGADAS:
${adHookSection}
${catalogSection}
${businessRulesSection}
${faqSection}

${strictModeInstructions}
`;
}

export interface ParsedAiResponse {
  cleanReplyText: string;
  needsHandoff: boolean;
  handoffReason?: string;
}

export function parseAiResponse(rawResponse: string): ParsedAiResponse {
  const handoffRegex = /\[HUMAN_HANDOFF:\s*(.*?)\]/i;
  const match = rawResponse.match(handoffRegex);

  if (match) {
    const handoffReason = match[1]?.trim() || "Cliente solicitou informação não catalogada";
    const cleanReplyText = rawResponse.replace(handoffRegex, "").trim();
    return {
      cleanReplyText,
      needsHandoff: true,
      handoffReason,
    };
  }

  return {
    cleanReplyText: rawResponse.trim(),
    needsHandoff: false,
  };
}
