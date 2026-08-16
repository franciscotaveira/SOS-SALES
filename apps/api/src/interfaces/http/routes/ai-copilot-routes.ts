import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { NvidiaNimEngine } from '../../../infrastructure/ai/nvidia-nim-engine.js';
import { OpenRouterEngine } from '../../../infrastructure/ai/openrouter-engine.js';
import { MultimodalVisionAnalyzer } from '../../../infrastructure/ai/multimodal-vision-analyzer.js';

export interface AiCopilotRoutesOptions {
  nvidiaEngine?: NvidiaNimEngine;
  openrouterEngine?: OpenRouterEngine;
  visionAnalyzer?: MultimodalVisionAnalyzer;
}

export const aiCopilotRoutes: FastifyPluginAsync<AiCopilotRoutesOptions> = async (
  app: FastifyInstance,
  options
) => {
  const nvidiaEngine = options.nvidiaEngine || new NvidiaNimEngine();
  const openrouterEngine = options.openrouterEngine || new OpenRouterEngine();
  const visionAnalyzer = options.visionAnalyzer || new MultimodalVisionAnalyzer();

  /**
   * POST /api/v1/ai/vision/analyze
   * Endpoint de Visão Computacional para WhatsApp:
   * - Comprovantes PIX (Haven, Sora, Lojas)
   * - Cartões Presente
   * - Fotos de Referência (penteados, cortes, unhas, procedimentos)
   */
  app.post(
    '/api/v1/ai/vision/analyze',
    {
      schema: {
        description: 'Analisa comprovantes de PIX, fotos de cartão presente e referências de estética/produtos.',
        tags: ['AI Vision & Documents'],
        body: {
          type: 'object',
          required: ['imageUrl'],
          properties: {
            imageUrl: { type: 'string', description: 'URL pública ou Base64 da imagem' },
            contextPrompt: { type: 'string', description: 'Contexto adicional (opcional)' },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        imageUrl: string;
        contextPrompt?: string;
      };

      try {
        const result = await visionAnalyzer.analyzeImage(body.imageUrl, body.contextPrompt);
        return reply.code(200).send({
          success: true,
          ...result,
        });
      } catch (err: any) {
        return reply.code(500).send({
          success: false,
          error: err?.message || 'Falha ao processar a imagem com visão computacional',
        });
      }
    }
  );

  /**
   * POST /api/v1/ai/test-openrouter
   * Rota para testar a chave e latência de modelos gratuitos/pagos no OpenRouter
   */
  app.post(
    '/api/v1/ai/test-openrouter',
    {
      schema: {
        description: 'Testa a conexão, modelos gratuitos e latência do OpenRouter.',
        tags: ['AI Engine'],
        body: {
          type: 'object',
          properties: {
            apiKey: { type: 'string' },
            model: { type: 'string', default: 'nvidia/nemotron-3-nano-30b-a3b:free' },
            prompt: { type: 'string', default: 'Olá! Responda como a Sofia do SOS Sales em 2 linhas.' },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        apiKey?: string;
        model?: string;
        prompt?: string;
      };

      const customEngine = body.apiKey ? new OpenRouterEngine(body.apiKey) : openrouterEngine;

      try {
        const result = await customEngine.generateChatCompletion(
          [
            {
              role: 'system',
              content:
                'Você é a Sofia, consultora comercial de alta conversão do SOS Sales. Você é empática, rápida e persuasiva.',
            },
            {
              role: 'user',
              content: body.prompt || 'O cliente perguntou: Por que o SOS Sales é melhor do que atender no WhatsApp normal?',
            },
          ],
          {
            model: body.model || 'nvidia/nemotron-3-nano-30b-a3b:free',
          }
        );

        return reply.code(200).send({
          success: true,
          provider: 'OpenRouter (openrouter.ai)',
          model: result.model,
          latencyMs: result.latencyMs,
          response: result.content,
          usage: result.usage,
        });
      } catch (err: any) {
        return reply.code(500).send({
          success: false,
          error: err?.message || 'Falha ao conectar com OpenRouter',
        });
      }
    }
  );

  /**
   * POST /api/v1/ai/test-nvidia
   * Rota para testar a chave e latência do NVIDIA NIM
   */
  app.post(
    '/api/v1/ai/test-nvidia',
    {
      schema: {
        description: 'Testa a conexão e latência do modelo NVIDIA NIM.',
        tags: ['AI Engine'],
        body: {
          type: 'object',
          properties: {
            apiKey: { type: 'string' },
            model: { type: 'string', default: 'meta/llama-3.3-70b-instruct' },
            prompt: { type: 'string', default: 'Olá! Responda como especialista comercial do SOS Sales em 2 linhas.' },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        apiKey?: string;
        model?: string;
        prompt?: string;
      };

      const customEngine = body.apiKey ? new NvidiaNimEngine(body.apiKey) : nvidiaEngine;

      try {
        const result = await customEngine.generateChatCompletion(
          [
            {
              role: 'system',
              content:
                'Você é a Sofia, consultora comercial de alta conversão do SOS Sales. Você é objetiva, persuasiva e cordial.',
            },
            {
              role: 'user',
              content: body.prompt || 'O cliente perguntou: Como o SOS Sales funciona para clínica odontológica?',
            },
          ],
          {
            model: body.model || 'meta/llama-3.3-70b-instruct',
          }
        );

        return reply.code(200).send({
          success: true,
          provider: 'NVIDIA NIM (build.nvidia.com)',
          model: result.model,
          latencyMs: result.latencyMs,
          response: result.content,
          usage: result.usage,
        });
      } catch (err: any) {
        return reply.code(500).send({
          success: false,
          error: err?.message || 'Falha ao conectar com NVIDIA NIM',
        });
      }
    }
  );
};
