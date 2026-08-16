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
  suggestedAction: 'confirm_payment_and_close' | 'schedule_gift_card' | 'quote_and_schedule_service' | 'request_clearer_photo';
  operatorDraftReply: string;
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

    const systemPrompt = `Você é o módulo de Visão e Inteligência Comercial do SOS Sales.
Sua missão é analisar imagens recebidas pelo WhatsApp para empresas (ex: salões de beleza, clínicas, spas como Sora Headspa e Haven, e comércio em geral).

Você deve identificar o tipo da imagem entre:
1. "pix_receipt" (Comprovante de pagamento PIX ou transferência) -> Extraia valor, pagador, recebedor, data e código de autenticação.
2. "gift_card" (Foto de Cartão Presente / Vale Presente) -> Extraia de quem é, para quem é e qual o serviço/valor.
3. "style_reference" (Foto de penteado, corte de cabelo, modelo de unha, tratamento, etc) -> Descreva o estilo e sugira o procedimento correspondente.
4. "general_document" (Contrato, documento, receita ou PDF)
5. "unidentified" (Foto genérica ou ilegível)

RETORNE ESTRITAMENTE UM JSON no formato:
{
  "category": "pix_receipt" | "gift_card" | "style_reference" | "general_document" | "unidentified",
  "confidence": 0.95,
  "extractedData": {
    "amountMinor": 15000,
    "amountFormatted": "R$ 150,00",
    "senderName": "Nome do Cliente",
    "recipientName": "Nome da Empresa",
    "transactionId": "E123456789...",
    "paymentDate": "15/08/2026 14:30",
    "isPaymentValid": true,
    "giftCardFrom": "Nome de quem deu",
    "giftCardTo": "Nome de quem recebeu",
    "giftCardService": "Sessão Sora Headspa Relaxante",
    "styleType": "Unhas Amendoadas / Escova Modelada",
    "styleDescription": "Descrição detalhada do estilo da foto",
    "matchedCatalogProduct": "Nome do produto no catálogo",
    "estimatedPriceMinor": 18000
  },
  "suggestedAction": "confirm_payment_and_close" | "schedule_gift_card" | "quote_and_schedule_service" | "request_clearer_photo",
  "operatorDraftReply": "Mensagem educada e persuasiva pronta para o atendente enviar em 1 clique ao cliente pelo WhatsApp."
}`;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://iaparavendas.tech',
        'X-Title': 'SOS Sales Multimodal Vision',
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
      return parsed as MultimodalAnalysisResult;
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
