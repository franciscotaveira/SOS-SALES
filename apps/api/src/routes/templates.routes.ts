import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  withTenantTransaction,
  listMessageTemplates,
  upsertMessageTemplate,
  type TemplateCategory,
  type TemplateStatus,
} from "@sos-sales/database";

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const listTemplatesQuerySchema = z.object({
  category: z.enum(["UTILITY", "MARKETING", "AUTHENTICATION"]).optional(),
  status: z.enum(["APPROVED", "PENDING", "REJECTED", "PAUSED"]).optional(),
});

const templateButtonSchema = z.object({
  type: z.string().min(1),
  text: z.string().min(1),
  url: z.string().url().optional(),
  phone_number: z.string().optional(),
});

const createTemplateBodySchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_]+$/, "Template name must contain only lowercase alphanumeric characters and underscores"),
  category: z.enum(["UTILITY", "MARKETING", "AUTHENTICATION"]),
  language: z.string().min(2).max(10).default("pt_BR"),
  headerText: z.string().max(60).nullable().optional(),
  bodyText: z.string().min(1).max(1024),
  footerText: z.string().max(60).nullable().optional(),
  buttons: z.array(templateButtonSchema).optional(),
  variables: z.array(z.string()).optional(),
  status: z.enum(["APPROVED", "PENDING", "REJECTED", "PAUSED"]).default("APPROVED"),
  metaTemplateId: z.string().optional(),
});

const generateTemplateBodySchema = z.object({
  objective: z.string().min(10).max(800),
  audience: z.string().min(2).max(200),
  tone: z.enum(["PROFESSIONAL", "FRIENDLY", "DIRECT"]).default("FRIENDLY"),
  strategy: z.enum(["UTILITY_TROJAN", "DIRECT_MARKETING"]).default("UTILITY_TROJAN"),
});

const generatedTemplateSchema = z.object({
  name: z.string().regex(/^[a-z0-9_]+$/).max(100),
  category: z.enum(["UTILITY", "MARKETING"]),
  headerText: z.string().max(60).nullable(),
  bodyText: z.string().min(1).max(1024),
  footerText: z.string().max(60).nullable(),
  buttonText: z.string().max(25).nullable(),
  variableLabels: z.array(z.string().max(60)).max(10),
  explanation: z.string().min(1).max(500),
});

export const templatesRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/v1/workspaces/:workspaceId/templates/generate",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("cockpit:access"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceParamsSchema.safeParse(request.params);
      const parsedBody = generateTemplateBodySchema.safeParse(request.body);
      if (!parsedParams.success || !parsedBody.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: parsedBody.success ? "Invalid workspaceId parameter" : parsedBody.error.issues[0]?.message,
          instance: request.url,
          correlationId: request.id,
        });
      }

      const apiKey = process.env.NVIDIA_API_KEY;
      if (!apiKey) {
        return reply.status(503).send({
          type: "https://sos-sales.mct.br/errors/ai-unavailable",
          title: "AI assistant unavailable",
          status: 503,
          detail: "O assistente de criação ainda não foi configurado neste ambiente.",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { objective, audience, tone, strategy = "UTILITY_TROJAN" } = parsedBody.data;
      const model = process.env.NVIDIA_TEMPLATE_MODEL || "nvidia/nemotron-3-super-120b-a12b";

      const systemPrompt = `Você é o maior especialista do Brasil em Engenharia de Templates WhatsApp Business da Meta (Meta Cloud API / WABA) e Otimização de Custos (MCT OS).

DIRETRIZ DE CUSTOS DA META (2025/2026):
- Marketing custa ~R$ 0,40 a R$ 0,45 por conversa.
- Utility (Utilidade) custa ~R$ 0,03 a R$ 0,06 por conversa (Economia de 85% a 90%).
- Service Window (Janela 24h): Quando o cliente clica no botão rápido ou responde, abre uma Janela de 24h GRATUITA (R$ 0,00) onde todas as mensagens de vendas, áudios e ofertas da IA têm CUSTO ZERO.

ESTRATÉGIA SELECIONADA: ${strategy === "UTILITY_TROJAN" ? "CAVALO DE TROIA DA UTILIDADE (UTILITY TROJAN)" : "MARKETING DIRETO"}

REGRAS DE CONSTRUÇÃO ${strategy === "UTILITY_TROJAN" ? "PARA APROVAÇÃO COMO UTILITY (ECONOMIA DE 85%)" : "PARA MARKETING DIRETO"}:
${
  strategy === "UTILITY_TROJAN"
    ? `1. Enquadre a mensagem como notificação transacional, confirmação operacional, atualização de cadastro/crédito, aviso de reserva ou protocolo (ex: "reserva prioritária de horário", "atualização de proposta", "crédito de fidelidade pendente").
2. NUNCA use palavras abertamente promocionais como "Compre já", "Mega promoção", "Black Friday", "X% de Desconto", pois a Meta rejeitaria a classificação Utility. Em vez disso, use "condição reservada", "benefício exclusivo liberado", "atualização do seu atendimento".
3. Crie um botão de resposta rápida (QUICK_REPLY) irresistível de 1 clique (ex: "Confirmar Horário", "Ver Detalhes", "Consultar Saldo", "Tenho Interesse"). Ao clicar, destrava a Janela de 24h Grátis de Atendimento.
4. Defina a category OBRIGATORIAMENTE como "UTILITY".`
    : `1. Enquadre a mensagem com persuasão direta, escassez e apelo comercial.
2. Defina a category como "MARKETING".`
}

REGRAS TÉCNICAS INVIOLÁVEIS DA META:
1. Variáveis sequenciais {{1}}, {{2}}... A variável {{1}} DEVE ser sempre o nome do cliente (ex: Olá {{1}}, tudo bem?).
2. Variáveis NUNCA podem estar no início isolado ou no final da mensagem sem texto/pontuação posterior.
3. Botão rápido sem emojis, máximo de 25 caracteres.
4. Retorne SOMENTE JSON válido com: name, category, headerText, bodyText, footerText, buttonText, variableLabels, explanation.
- name deve usar snake_case com sufixo de versão (ex: confirmacao_reserva_v1).
- explanation deve explicar sucintamente a tática utilizada, ressaltando o custo reduzido (~R$ 0,04) e o destravamento da Janela de 24h Grátis.`;

      try {
        const aiResponse = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            max_tokens: 1600,
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: `Objetivo: ${objective}\nPúblico: ${audience}\nTom: ${tone}\nEstratégia: ${strategy}`,
              },
            ],
          }),
          signal: AbortSignal.timeout(45000),
        });
        if (!aiResponse.ok) throw new Error(`NVIDIA returned ${aiResponse.status}`);
        const payload = await aiResponse.json() as { choices?: Array<{ message?: { content?: string } }> };
        const raw = payload.choices?.[0]?.message?.content?.trim() || "";
        const jsonText = raw.match(/\{[\s\S]*\}/)?.[0] || raw;
        const candidate = JSON.parse(jsonText) as Record<string, unknown>;
        if (
          candidate.variableLabels &&
          typeof candidate.variableLabels === "object" &&
          !Array.isArray(candidate.variableLabels)
        ) {
          candidate.variableLabels = Object.entries(candidate.variableLabels as Record<string, unknown>)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([, value]) => String(value));
        }
        const generated = generatedTemplateSchema.parse(candidate);
        return reply.status(200).send({ generated, model });
      } catch (error) {
        const safeError = error instanceof Error
          ? { name: error.name, message: error.message }
          : { name: "UnknownError", message: String(error) };
        request.log.error({ aiError: safeError }, "WABA template AI generation failed");
        return reply.status(502).send({
          type: "https://sos-sales.mct.br/errors/ai-generation-failed",
          title: "AI generation failed",
          status: 502,
          detail: "A IA não conseguiu gerar um modelo válido agora. Tente novamente ou use um modelo facilitado.",
          instance: request.url,
          correlationId: request.id,
        });
      }
    }
  );

  // 1. List message templates (with auto-seed of canonical templates if workspace is new)
  app.get(
    "/v1/workspaces/:workspaceId/templates",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("cockpit:access"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parsedQuery = listTemplatesQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid query parameters",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId } = parsedParams.data;
      const { category, status } = parsedQuery.data;

      const templates = await withTenantTransaction(workspaceId, async (client) => {
        return listMessageTemplates(client, workspaceId, {
          category: category as TemplateCategory | undefined,
          status: status as TemplateStatus | undefined,
        });
      });

      return reply.status(200).send({
        templates: templates.map((t) => ({
          id: t.id,
          workspaceId: t.workspace_id,
          name: t.name,
          category: t.category,
          language: t.language,
          headerText: t.header_text,
          bodyText: t.body_text,
          footerText: t.footer_text,
          buttons: t.buttons,
          variables: t.variables,
          status: t.status,
          metaTemplateId: t.meta_template_id,
          createdAt: t.created_at.toISOString(),
          updatedAt: t.updated_at.toISOString(),
        })),
        total: templates.length,
      });
    }
  );

  // 2. Register or update a message template
  app.post(
    "/v1/workspaces/:workspaceId/templates",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("cockpit:access"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parsedBody = createTemplateBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        const issues = parsedBody.error.issues
          .map((i) => i.message || i.path.join("."))
          .join("; ");
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: `Request body validation failed: ${issues}`,
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId } = parsedParams.data;
      const data = parsedBody.data;

      const template = await withTenantTransaction(workspaceId, async (client) => {
        return upsertMessageTemplate(client, {
          workspaceId,
          name: data.name,
          category: data.category as TemplateCategory,
          language: data.language,
          headerText: data.headerText,
          bodyText: data.bodyText,
          footerText: data.footerText,
          buttons: data.buttons,
          variables: data.variables,
          status: data.status as TemplateStatus,
          metaTemplateId: data.metaTemplateId,
        });
      });

      return reply.status(201).send({
        template: {
          id: template.id,
          workspaceId: template.workspace_id,
          name: template.name,
          category: template.category,
          language: template.language,
          headerText: template.header_text,
          bodyText: template.body_text,
          footerText: template.footer_text,
          buttons: template.buttons,
          variables: template.variables,
          status: template.status,
          metaTemplateId: template.meta_template_id,
          createdAt: template.created_at.toISOString(),
          updatedAt: template.updated_at.toISOString(),
        },
      });
    }
  );
};
