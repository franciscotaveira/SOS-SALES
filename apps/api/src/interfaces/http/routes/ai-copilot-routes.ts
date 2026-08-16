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

  /**
   * POST /api/v1/ai/copilot-suggestion
   * Gera sugestão comercial inteligente contextual para o Cockpit de Vendas
   */
  app.post(
    '/api/v1/ai/copilot-suggestion',
    {
      schema: {
        description: 'Gera sugestão contextual de resposta e ação comercial para o Copilot no Cockpit.',
        tags: ['AI Copilot'],
        body: {
          type: 'object',
          properties: {
            journeyStage: { type: 'string', default: 'LEAD' },
            contactName: { type: 'string', default: 'Cliente' },
            lastCustomerMessage: { type: 'string', default: '' },
            businessType: { type: 'string', default: 'serviços' },
            businessName: { type: 'string', default: 'SOS Sales' },
            facts: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        journeyStage?: string;
        contactName?: string;
        lastCustomerMessage?: string;
        businessType?: string;
        businessName?: string;
        facts?: string[];
      };

      const systemPrompt = `Você é o Copilot Comercial de Alta Conversão do SOS Sales para a empresa "${body.businessName || 'Empresa'}" (${body.businessType || 'Comércio'}).
Sua missão é sugerir a melhor resposta comercial e a próxima ação prática no WhatsApp para avançar o lead no funil.

Estágio atual do funil: ${body.journeyStage || 'LEAD'}
Nome do cliente: ${body.contactName || 'Cliente'}
Fatos conhecidos do cliente: ${body.facts?.join('; ') || 'Nenhum'}

Regras:
1. Resposta humana, direta, sem enrolação e acolhedora (estilo WhatsApp).
2. Conduza sempre com uma pergunta fechada de fechamento ou call-to-action claro (ex: "Qual melhor horário para você?", "Posso reservar sua vaga?").
3. Retorne JSON estruturado com os campos:
   - "suggestedMessage": O texto exato da mensagem para o cliente.
   - "recommendedAction": Ação comercial recomendada (ex: "Oferecer Agendamento", "Enviar Link de Pagamento PIX", "Quebrar Objeção de Preço").
   - "rationale": Breve justificativa estratégica (1 frase).`;

      try {
        const result = await openrouterEngine.generateChatCompletion(
          [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: body.lastCustomerMessage
                ? `Última mensagem do cliente: "${body.lastCustomerMessage}"`
                : `O cliente acabou de entrar no estágio ${body.journeyStage}. O que sugerir como primeiro contato?`,
            },
          ],
          {
            model: 'nvidia/nemotron-3-nano-30b-a3b:free',
          }
        );

        let parsed: any;
        try {
          const jsonMatch = result.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          } else {
            parsed = {
              suggestedMessage: result.content,
              recommendedAction: 'Avançar Conversa',
              rationale: 'Sugestão contextual gerada pela IA.',
            };
          }
        } catch {
          parsed = {
            suggestedMessage: result.content,
            recommendedAction: 'Avançar Conversa',
            rationale: 'Sugestão contextual gerada pela IA.',
          };
        }

        return reply.code(200).send({
          success: true,
          ...parsed,
          latencyMs: result.latencyMs,
          model: result.model,
        });
      } catch (err: any) {
        return reply.code(200).send({
          success: false,
          suggestedMessage: `Olá ${body.contactName || ''}! Como posso te ajudar hoje? Temos condições especiais para você.`,
          recommendedAction: 'Atendimento Consultivo',
          rationale: 'Fallback comercial seguro ativado.',
        });
      }
    }
  );
};
