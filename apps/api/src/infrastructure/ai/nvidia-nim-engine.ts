/**
 * TX COMMERCIAL CORE — NVIDIA NIM AI INFERENCE ENGINE
 * https://build.nvidia.com/
 * OpenAI-compatible interface for high-performance free/hosted GPU inference.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface NvidiaNimOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export class NvidiaNimEngine {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(
    apiKey?: string,
    baseUrl = 'https://integrate.api.nvidia.com/v1',
    defaultModel = 'meta/llama-3.3-70b-instruct'
  ) {
    this.apiKey = apiKey || process.env.NVIDIA_API_KEY || '';
    this.baseUrl = baseUrl;
    this.defaultModel = defaultModel;
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().startsWith('nvapi-'));
  }

  /**
   * Gera uma resposta estruturada de vendas ou suporte via NVIDIA NIM
   */
  public async generateChatCompletion(
    messages: ChatMessage[],
    options?: NvidiaNimOptions
  ): Promise<{ content: string; model: string; latencyMs: number; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> {
    if (!this.apiKey) {
      throw new Error('NVIDIA_API_KEY não configurada. Forneça uma chave nvapi-...');
    }

    const model = options?.model || this.defaultModel;
    const startTime = Date.now();

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.2,
        max_tokens: options?.maxTokens ?? 1024,
        top_p: options?.topP ?? 0.9,
        stream: false,
      }),
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`NVIDIA NIM API Error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    const content = data.choices?.[0]?.message?.content || '';

    return {
      content,
      model: data.model || model,
      latencyMs,
      usage: data.usage,
    };
  }
}
