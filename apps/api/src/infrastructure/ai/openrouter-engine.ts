/**
 * TX COMMERCIAL CORE — OPENROUTER AI INFERENCE ENGINE
 * https://openrouter.ai/
 * Universal router for free and hosted models (Gemini Flash Free, Llama 3.3 Free, DeepSeek Free, Claude Sonnet, etc.)
 */

export interface OpenRouterChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export class OpenRouterEngine {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(
    apiKey?: string,
    baseUrl = 'https://openrouter.ai/api/v1',
    defaultModel = 'nvidia/nemotron-3.5-lightning:free'
  ) {
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || '';
    this.baseUrl = baseUrl;
    this.defaultModel = defaultModel;
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().startsWith('sk-or-'));
  }

  public async generateChatCompletion(
    messages: OpenRouterChatMessage[],
    options?: OpenRouterOptions
  ): Promise<{ content: string; model: string; latencyMs: number; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> {
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY não configurada. Forneça uma chave sk-or-v1-...');
    }

    const model = options?.model || this.defaultModel;
    const startTime = Date.now();

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://iaparavendas.tech',
        'X-Title': 'SOS Sales Comercial OS',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.2,
        max_tokens: options?.maxTokens ?? 1024,
      }),
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API Error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    let content = data.choices?.[0]?.message?.content || '';

    // Sanitiza blocos de raciocínio de modelos com reasoning (DeepSeek, Nemotron, etc.)
    content = this.cleanReasoningOutput(content);

    return {
      content,
      model: data.model || model,
      latencyMs,
      usage: data.usage,
    };
  }

  private cleanReasoningOutput(text: string): string {
    if (!text) return '';
    let cleaned = text;

    // Remove tags <think>...</think>
    cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');

    // Se o modelo começou com "Here's a thinking process:" ou "Okay, let's see..."
    if (cleaned.includes("Here's a thinking process:") || cleaned.includes("Here's the thinking process:")) {
      const parts = cleaned.split(/(?:Here's a draft response:|Final Response:|Resposta:|Draft:|Here is the message:)/i);
      if (parts.length > 1) {
        cleaned = parts[parts.length - 1];
      }
    }

    return cleaned.trim();
  }
}
