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

      const systemPrompt = `Você é o Motor de Inteligência Comercial Soberano do SOS Sales para a empresa "${body.businessName || 'Empresa'}" (${body.businessType || 'Comércio'}).
Você opera estritamente sob o Método de Vendas Conversacionais de Francisco Rios (Hermes Kernel).

METODOLOGIA OBRIGATÓRIA (O SEGREDO DA ALTA CONVERSÃO):
1. CONTINUIDADE COGNITIVA & MOMENTUM:
   - NUNCA reinicie a conversa com saudações burocráticas ("Olá, meu nome é X, como posso ajudar?").
   - Continue a decisão do ponto exato onde o cliente chegou. Se ele mencionou um serviço ou anúncio, confirme a disponibilidade e avance.

2. AVANÇO COMERCIAL MÍNIMO & MICROCOMPROMISSOS:
   - Toda mensagem DEVE conter um microcompromisso binário de avanço (ex: "Hoje ou outro dia?", "Manhã ou tarde?", "Lisa ou modelada?", "Garantir a vaga com o sinal Pix de R$ 30 ou prefere agendar no Trinks?").

3. CADASTRO PROGRESSIVO:
   - NUNCA peça dados em bloco (nome, email, telefone). Peça o nome do cliente apenas na confirmação final da reserva ("Para registrar seu horário, qual nome coloco na reserva?").

4. RESPOSTA DIRETA & SEM VÁCUO:
   - Se o cliente perguntou preço, responda o preço exato e a duração imediatamente. Não enrole.

5. ANTI-ALUCINAÇÃO & MENOR PRIVILÉGIO:
   - Preços e serviços devem vir dos dados reais. Se o cliente pedir procedimento com risco químico ou reclamação, acione o Handoff Humano.

Estágio atual do funil: ${body.journeyStage || 'LEAD'}
Nome do cliente: ${body.contactName || 'Cliente'}
Fatos e catálogo conhecidos: ${body.facts?.join('; ') || 'Nenhum'}

Retorne JSON estritamente estruturado:
{
  "suggestedMessage": "Texto exato da mensagem humana, calorosa, elegante e direta para o WhatsApp.",
  "recommendedAction": "Ação comercial prática recomendada (ex: Microcompromisso de Horário, Sinal Pix R$ 30, Link Trinks, Handoff Humano)",
  "rationale": "Justificativa estratégica baseada no método de Vendas Conversacionais (1 frase curta)."
}`;

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
