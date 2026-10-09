import { describe, it, expect } from "vitest";
import {
  buildGroundedSystemPrompt,
  parseAiResponse,
  formatBrlPrice,
  type GroundedAiConfig,
  type GroundedProduct,
} from "../ai/ai-grounding-prompt.builder";

describe("AI Grounding Prompt Builder & Handoff Parser", () => {
  it("formats BRL currency correctly from price_cents", () => {
    expect(formatBrlPrice(149700)).toContain("1.497,00");
    expect(formatBrlPrice(11000)).toContain("110,00");
  });

  it("builds grounded prompt with products, business rules and ignorance protocol", () => {
    const config: GroundedAiConfig = {
      name: "Sofia",
      personality: "cordial_comercial",
      systemPrompt: "Seja muito gentil e convide para agendar.",
      strictMode: true,
      businessRules: {
        openingHours: "Seg-Sex 08h-19h",
        address: "Rua das Flores 123",
        cancellationPolicy: "Tolerância de 15 min",
        paymentMethods: "Pix e Cartão",
      },
      faq: [
        {
          question: "Quanto tempo dura a escova?",
          answer: "Dura em média 3 meses.",
        },
      ],
    };

    const products: GroundedProduct[] = [
      {
        id: "prod-1",
        title: "Escova Lisa",
        priceCents: 11000,
        category: "Escovas",
        description: "Lavagem e escova modelada",
      },
    ];

    const prompt = buildGroundedSystemPrompt(config, products);

    expect(prompt).toContain("Você é Sofia, assistente comercial de WhatsApp");
    expect(prompt).toContain("<catalog_truth>");
    expect(prompt).toContain("Escova Lisa | Preço:");
    expect(prompt).toContain("<business_rules>");
    expect(prompt).toContain("Horário de Funcionamento: Seg-Sex 08h-19h");
    expect(prompt).toContain("<faq_truth>");
    expect(prompt).toContain("Quanto tempo dura a escova?");
    expect(prompt).toContain("PROTOCOLO DE IGNORÂNCIA");
    expect(prompt).toContain("[HUMAN_HANDOFF: resumo da dúvida]");
  });

  it("parses clean response when no handoff is needed", () => {
    const raw = "Olá! O valor da Escova Lisa é R$ 110,00. Gostaria de agendar para hoje?";
    const parsed = parseAiResponse(raw);
    expect(parsed.needsHandoff).toBe(false);
    expect(parsed.cleanReplyText).toBe(raw);
    expect(parsed.handoffReason).toBeUndefined();
  });

  it("detects and extracts human handoff tag and cleans customer message", () => {
    const raw =
      "Vou confirmar essa condição especial com a nossa gerência e já te retorno! [HUMAN_HANDOFF: Cliente pediu desconto de 50% no pacote]";
    const parsed = parseAiResponse(raw);
    expect(parsed.needsHandoff).toBe(true);
    expect(parsed.handoffReason).toBe("Cliente pediu desconto de 50% no pacote");
    expect(parsed.cleanReplyText).toBe(
      "Vou confirmar essa condição especial com a nossa gerência e já te retorno!"
    );
  });

  it("injects CTWA ad hook layer when lead originates from Meta Ads", () => {
    const config: GroundedAiConfig = {
      name: "Sofia",
      personality: "cordial_comercial",
      strictMode: true,
      adHook: {
        headline: "50% OFF na Primeira Sessão de Laser",
        body: "Garanta seu voucher exclusivo de boas-vindas clicando aqui.",
      },
    };

    const prompt = buildGroundedSystemPrompt(config, []);

    expect(prompt).toContain("<origem_do_lead_anuncio_meta>");
    expect(prompt).toContain("50% OFF na Primeira Sessão de Laser");
    expect(prompt).toContain("Garanta seu voucher exclusivo de boas-vindas");
    expect(prompt).toContain("INSTRUÇÃO DE GANCHO: Na sua saudação ou resposta inicial");
  });
});
