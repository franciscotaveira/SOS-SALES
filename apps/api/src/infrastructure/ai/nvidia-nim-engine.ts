/**
 * TX COMMERCIAL CORE — NVIDIA NIM SOVEREIGN AI INFERENCE ENGINE
 * https://build.nvidia.com/
 * High-speed, sovereign model inference for Llama 3.3 70B, DeepSeek R1, Nemotron & Vision
 */

import { PromptGuard } from './prompt-guard.js';

export interface NvidiaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type NvidiaModelTier = 'fast' | 'reasoning' | 'nemotron' | 'vision' | 'auto';

export interface NvidiaOptions {
  model?: string;
  tier?: NvidiaModelTier;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  compactHistory?: boolean;
}

export interface NvidiaChatCompletionResult {
  text: string;
  content: string;
  model: string;
  latencyMs: number;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export const NVIDIA_MODEL_TIERS = {
  FAST: 'meta/llama-3.3-70b-instruct',
  REASONING: 'deepseek-ai/deepseek-r1',
  NEMOTRON: 'nvidia/nemotron-4-340b-instruct',
  VISION: 'meta/llama-3.2-11b-vision-instruct',
};

export class NvidiaNimEngine {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(
    apiKey?: string,
    baseUrl = 'https://integrate.api.nvidia.com/v1',
    defaultModel = NVIDIA_MODEL_TIERS.FAST
  ) {
    this.apiKey = apiKey || process.env.NVIDIA_API_KEY || '';
    this.baseUrl = baseUrl;
    this.defaultModel = defaultModel;
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().startsWith('nvapi-'));
  }

  /**
   * Compacts conversation history preserving system prompt and last 6 messages.
   */
  public compactHistory(messages: NvidiaChatMessage[]): NvidiaChatMessage[] {
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');
    const recentMessages = nonSystemMessages.slice(-6);
    return [...systemMessages, ...recentMessages];
  }

  /**
   * Resolves the best model based on tier.
   */
  public resolveModelForTier(tier: NvidiaModelTier = 'auto'): string {
    switch (tier) {
      case 'fast':
        return NVIDIA_MODEL_TIERS.FAST;
      case 'reasoning':
        return NVIDIA_MODEL_TIERS.REASONING;
      case 'nemotron':
        return NVIDIA_MODEL_TIERS.NEMOTRON;
      case 'vision':
        return NVIDIA_MODEL_TIERS.VISION;
      case 'auto':
      default:
        return NVIDIA_MODEL_TIERS.FAST;
    }
  }

  /**
   * Executes chat completion via NVIDIA NIM OpenAI-compatible API.
   */
  public async generateChatCompletion(
    messages: NvidiaChatMessage[],
    options?: NvidiaOptions
  ): Promise<NvidiaChatCompletionResult> {
    if (!this.apiKey) {
      throw new Error('NVIDIA_API_KEY não configurada. Forneça uma chave nvapi-...');
    }

    const startTime = Date.now();

    const sanitizedMessages: NvidiaChatMessage[] = messages.map((msg) => {
      if (msg.role === 'user') {
        return {
          ...msg,
          content: PromptGuard.wrapUntrusted(msg.content),
        };
      }
      return msg;
    });

    const finalMessages = (options?.compactHistory || sanitizedMessages.length > 8)
      ? this.compactHistory(sanitizedMessages)
      : sanitizedMessages;

    const requestedModel = options?.model || this.resolveModelForTier(options?.tier);
    const modelsToTry = [
      requestedModel,
      NVIDIA_MODEL_TIERS.FAST,
      NVIDIA_MODEL_TIERS.NEMOTRON,
    ].filter((val, idx, arr) => arr.indexOf(val) === idx);

    let lastError: Error | null = null;

    for (const modelToTry of modelsToTry) {
      try {
        const bodyPayload: Record<string, unknown> = {
          model: modelToTry,
          messages: finalMessages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 1024,
        };
        if (options?.topP !== undefined) {
          bodyPayload.top_p = options.topP;
        }

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(bodyPayload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`NVIDIA NIM API (${response.status}) on ${modelToTry}: ${errorText}`);
        }

        const data = await response.json() as {
          choices?: Array<{ message?: { content?: string } }>;
          model?: string;
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        };

        const replyContent = data.choices?.[0]?.message?.content || '';
        const latencyMs = Date.now() - startTime;

        return {
          text: replyContent,
          content: replyContent,
          model: data.model || modelToTry,
          latencyMs,
          usage: data.usage ? {
            promptTokens: data.usage.prompt_tokens || 0,
            completionTokens: data.usage.completion_tokens || 0,
            totalTokens: data.usage.total_tokens || 0,
          } : undefined,
        };
      } catch (err) {
        lastError = err as Error;
        console.warn(`[NVIDIA Circuit Breaker] Model ${modelToTry} failed, trying next fallback...`, (err as Error).message);
      }
    }

    throw lastError || new Error('All NVIDIA NIM models in circuit breaker failed');
  }
}
