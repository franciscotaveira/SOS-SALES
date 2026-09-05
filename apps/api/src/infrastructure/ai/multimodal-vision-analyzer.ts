/**
 * TX COMMERCIAL CORE — MULTIMODAL VISION & DOCUMENT ANALYZER
 * Capacidade de visão computacional e OCR para WhatsApp:
 * - Comprovantes de PIX (valor, pagador, data, status)
 * - Fotos de Cartão Presente (nomes do presenteado e de quem presenteou)
 * - Fotos de Referência (estilos de cabelo, penteados, modelos de unhas, tratamentos de Spa/Haven/Sora)
 */

export interface MultimodalAnalysisResult {
  category: 'pix_receipt' | 'gift_card' | 'style_reference' | 'general_document' | 'unidentified';
  confidence: number;
  extractedData: {
    // PIX / Pagamento
    amountMinor?: number;
    amountFormatted?: string;
    senderName?: string;
    recipientName?: string;
    transactionId?: string;
    paymentDate?: string;
    isPaymentValid?: boolean;
    // Vale / Cartão Presente
    giftCardFrom?: string;
    giftCardTo?: string;
    giftCardService?: string;
    // Referência de Estética / Cabelo / Unhas / Spa
    styleType?: string;
    styleDescription?: string;
    matchedCatalogProduct?: string;
    estimatedPriceMinor?: number;
  };
  suggestedAction: 'confirm_payment_and_close' | 'verify_payment_manually' | 'schedule_gift_card' | 'quote_and_schedule_service' | 'request_clearer_photo';
  operatorDraftReply: string;
  /** OCR/vision is never proof of settlement; an operator must verify PIX. */
  requiresManualVerification?: boolean;
}

const categories = new Set<MultimodalAnalysisResult['category']>([
  'pix_receipt', 'gift_card', 'style_reference', 'general_document', 'unidentified',
]);
const actions = new Set<MultimodalAnalysisResult['suggestedAction']>([
  'confirm_payment_and_close', 'verify_payment_manually', 'schedule_gift_card',
  'quote_and_schedule_service', 'request_clearer_photo',
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function sanitizeAnalysis(value: unknown): MultimodalAnalysisResult {
  const raw = asRecord(value);
  const category = categories.has(raw.category as MultimodalAnalysisResult['category'])
    ? raw.category as MultimodalAnalysisResult['category']
    : 'unidentified';
  const rawData = asRecord(raw.extractedData);
  const confidence = typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)
    ? Math.min(1, Math.max(0, raw.confidence))
    : 0.5;
  const suggestedAction = actions.has(raw.suggestedAction as MultimodalAnalysisResult['suggestedAction'])
    ? raw.suggestedAction as MultimodalAnalysisResult['suggestedAction']
    : 'request_clearer_photo';
  const extractedData: MultimodalAnalysisResult['extractedData'] = {};
  for (const key of [
    'amountFormatted', 'senderName', 'recipientName', 'transactionId', 'paymentDate',
    'giftCardFrom', 'giftCardTo', 'giftCardService', 'styleType', 'styleDescription',
    'matchedCatalogProduct',
  ]) {
    const candidate = rawData[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      (extractedData as Record<string, unknown>)[key] = candidate.trim();
    }
  }
  if (typeof rawData.amountMinor === 'number' && Number.isFinite(rawData.amountMinor) && rawData.amountMinor >= 0) {
    extractedData.amountMinor = Math.floor(rawData.amountMinor);
  }

  // A vision model can read an amount, but cannot prove that money settled or
  // that a service price matches the tenant catalog. Never carry those claims
  // into an operational action.
  if (category === 'pix_receipt') {
    return {
      category,
      confidence,
      extractedData,
      suggestedAction: 'verify_payment_manually',
      operatorDraftReply: typeof raw.operatorDraftReply === 'string' && raw.operatorDraftReply.trim()
        ? raw.operatorDraftReply.trim()
        : 'Recebi o comprovante. Vou conferir a confirmação do pagamento antes de concluir o atendimento.',
      requiresManualVerification: true,
    };
  }

  return {
    category,
    confidence,
    extractedData,
    suggestedAction,
    operatorDraftReply: typeof raw.operatorDraftReply === 'string' && raw.operatorDraftReply.trim()
      ? raw.operatorDraftReply.trim()
      : 'Recebi sua imagem. Vou conferir os detalhes e já retorno com a orientação correta.',
  };
}

export class MultimodalVisionAnalyzer {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly visionModel: string;

  constructor(
    apiKey?: string,
    baseUrl = 'https://openrouter.ai/api/v1',
    visionModel = 'meta-llama/llama-3.2-11b-vision-instruct:free'
  ) {
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || '';
    this.baseUrl = baseUrl;
    this.visionModel = visionModel;
  }

  /**
   * Analisa qualquer imagem recebida no WhatsApp (URL ou Base64)
   */
  public async analyzeImage(
    imageUrlOrBase64: string,
    contextPrompt?: string
  ): Promise<MultimodalAnalysisResult> {
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY necessária para análise de imagens.');
    }

    const formattedImageUrl = imageUrlOrBase64.startsWith('http') || imageUrlOrBase64.startsWith('data:')
      ? imageUrlOrBase64
      : `data:image/jpeg;base64,${imageUrlOrBase64}`;

    const systemPrompt = `Você é o módulo de Visão e Inteligência Comercial do SOS Vendas.
Sua missão é analisar imagens recebidas pelo WhatsApp para empresas (ex: salões de beleza, clínicas, spas como Sora Headspa e Haven, e comércio em geral).

Você deve identificar o tipo da imagem entre:
1. "pix_receipt" (Comprovante de pagamento PIX ou transferência) -> Extraia valor, pagador, recebedor, data e código de autenticação.
2. "gift_card" (Foto de Cartão Presente / Vale Presente) -> Extraia de quem é, para quem é e qual o serviço/valor.
3. "style_reference" (Foto de penteado, corte de cabelo, modelo de unha, tratamento, etc) -> Descreva o estilo e sugira o procedimento correspondente.
4. "general_document" (Contrato, documento, receita ou PDF)
5. "unidentified" (Foto genérica ou ilegível)

RETORNE ESTRITAMENTE UM JSON no formato (use null quando a informação não estiver legível ou confirmada):
{
  "category": "pix_receipt" | "gift_card" | "style_reference" | "general_document" | "unidentified",
  "confidence": 0.95,
  "extractedData": {
    "amountMinor": null,
    "amountFormatted": null,
    "senderName": null,
    "recipientName": null,
    "transactionId": null,
    "paymentDate": null,
    "isPaymentValid": null,
    "giftCardFrom": null,
    "giftCardTo": null,
    "giftCardService": null,
    "styleType": null,
    "styleDescription": null,
    "matchedCatalogProduct": null,
    "estimatedPriceMinor": null
  },
  "suggestedAction": "verify_payment_manually" | "schedule_gift_card" | "quote_and_schedule_service" | "request_clearer_photo",
  "operatorDraftReply": "Mensagem educada e persuasiva pronta para o atendente enviar em 1 clique ao cliente pelo WhatsApp."
}

Nunca defina isPaymentValid como true: uma imagem não confirma liquidação. Nunca preencha estimatedPriceMinor: o preço só pode vir do catálogo publicado do workspace.
`;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://iaparavendas.tech',
        'X-Title': 'SOS Vendas Multimodal Vision',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.visionModel,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: contextPrompt || 'Analise a imagem recebida pelo WhatsApp deste cliente.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: formattedImageUrl,
                },
              },
            ],
          },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Vision Model Error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content || '{}';

    try {
      const parsed = JSON.parse(content.replace(/```json/g, '').replace(/```/g, '').trim());
      return sanitizeAnalysis(parsed);
    } catch {
      return {
        category: 'unidentified',
        confidence: 0.5,
        extractedData: {},
        suggestedAction: 'request_clearer_photo',
        operatorDraftReply: 'Recebemos sua imagem! Um momento enquanto conferimos para você.',
      };
    }
  }
}
