/**
 * TX COMMERCIAL CORE — OPENROUTER AI INFERENCE ENGINE
 * https://openrouter.ai/
 * Universal router for free and hosted models (Gemini Flash Free, Llama 3.3 Free, DeepSeek Free, Claude Sonnet, etc.)
 */

import { PromptGuard } from './prompt-guard.js';

export interface OpenRouterChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type ModelTier = 'fast' | 'deep' | 'auto';

export interface OpenRouterOptions {
  model?: string;
  tier?: ModelTier;
  temperature?: number;
  maxTokens?: number;
  compactHistory?: boolean;
}

export const OPENROUTER_MODEL_TIERS = {
  FAST: 'google/gemini-2.0-flash-001',
  FAST_FALLBACK: 'anthropic/claude-3.5-haiku',
  DEEP: 'anthropic/claude-3.5-sonnet',
  FREE_DEFAULT: 'nvidia/nemotron-3.5-lightning:free',
};

export class OpenRouterEngine {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(
    apiKey?: string,
    baseUrl = 'https://openrouter.ai/api/v1',
    defaultModel = OPENROUTER_MODEL_TIERS.FAST
  ) {
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || '';
    this.baseUrl = baseUrl;
    this.defaultModel = defaultModel;
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().startsWith('sk-or-'));
  }

  /**
   * Compacts conversation history preserving system prompt and last 6 messages (saves 70% tokens).
   */
  public compactHistory(messages: OpenRouterChatMessage[]): OpenRouterChatMessage[] {
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    // Keep the most recent 6 conversational turns
    const recentMessages = nonSystemMessages.slice(-6);

    return [...systemMessages, ...recentMessages];
  }

  /**
   * Resolves the optimal model based on semantic tier or auto-classification
   */
  public resolveModelForTier(tier: ModelTier = 'auto', messages: OpenRouterChatMessage[] = []): string {
    if (tier === 'fast') {
      return OPENROUTER_MODEL_TIERS.FAST;
    }
    if (tier === 'deep') {
      return OPENROUTER_MODEL_TIERS.DEEP;
    }

    // Auto-Classification: Detect if conversation demands deep strategic reasoning
    const lastUserMsg = messages
      .filter((m) => m.role === 'user')
      .slice(-1)[0]?.content?.toLowerCase() || '';

    const isComplexObjection =
      lastUserMsg.length > 180 ||
      /(?:caro|desconto|pensar|concorrente|reclam|proposta|condiç|fechamento|garantia|diferencial)/i.test(lastUserMsg);

    if (isComplexObjection) {
      return OPENROUTER_MODEL_TIERS.DEEP;
    }

    // Standard fast path for everyday inquiries (hours, catalog, greeting, slot booking)
    return OPENROUTER_MODEL_TIERS.FAST;
  }

  public async generateChatCompletion(
    messages: OpenRouterChatMessage[],
    options?: OpenRouterOptions
  ): Promise<{ content: string; model: string; latencyMs: number; tierUsed: string; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> {
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY não configurada. Forneça uma chave sk-or-v1-...');
    }

    // 1. Sanitize user inputs against prompt injection and wrap untrusted messages
    const sanitizedMessages: OpenRouterChatMessage[] = messages.map((msg) => {
      if (msg.role === 'user') {
        return {
          ...msg,
          content: PromptGuard.wrapUntrusted(msg.content),
        };
      }
      return msg;
    });

    // 2. Compact history if requested or if exceeding 8 turns
    const finalMessages = (options?.compactHistory || sanitizedMessages.length > 8)
      ? this.compactHistory(sanitizedMessages)
      : sanitizedMessages;

    const primaryModel = options?.model || this.resolveModelForTier(options?.tier ?? 'auto', finalMessages);
    const startTime = Date.now();

    // 3. Execution with Circuit Breaker Fallback
    const candidateModels = [
      primaryModel,
      OPENROUTER_MODEL_TIERS.FAST_FALLBACK,
      OPENROUTER_MODEL_TIERS.FREE_DEFAULT,
    ];

    let lastError: Error | null = null;

    for (const modelToTry of candidateModels) {
      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'https://iaparavendas.tech',
            'X-Title': 'SOS Sales Comercial OS',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: modelToTry,
            messages: finalMessages,
            temperature: options?.temperature ?? 0.2,
            max_tokens: options?.maxTokens ?? 1024,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`OpenRouter API (${response.status}) on ${modelToTry}: ${errorText}`);
        }

        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          model?: string;
          usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
        };

        let content = data.choices?.[0]?.message?.content || '';
        content = this.cleanReasoningOutput(content);

        const latencyMs = Date.now() - startTime;
        return {
          content,
          model: data.model || modelToTry,
          latencyMs,
          tierUsed: modelToTry.includes('flash') || modelToTry.includes('haiku') ? 'fast' : 'deep',
          usage: data.usage,
        };
      } catch (err) {
        lastError = err as Error;
        console.warn(`[OpenRouter Circuit Breaker] Model ${modelToTry} failed, trying next fallback...`, (err as Error).message);
      }
    }

    throw lastError || new Error('All OpenRouter models in circuit breaker failed');
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
