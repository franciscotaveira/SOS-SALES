import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { withTenantTransaction } from "@sos-sales/database";

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const updateAiAgentBodySchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().min(1).max(100).optional(),
  systemPrompt: z.string().min(1).max(5000).optional(),
  personality: z
    .enum(["cordial_comercial", "direto_objetivo", "especialista_consultivo", "empatico_acolhedor"])
    .optional(),
  skills: z
    .object({
      qualify_lead: z.boolean().optional(),
      catalog_offers: z.boolean().optional(),
      pix_charges: z.boolean().optional(),
      appointments: z.boolean().optional(),
      capi_tracking: z.boolean().optional(),
    })
    .passthrough()
    .optional(),
  businessRules: z
    .object({
      openingHours: z.string().max(1000).optional(),
      address: z.string().max(1000).optional(),
      cancellationPolicy: z.string().max(1000).optional(),
      paymentMethods: z.string().max(1000).optional(),
      generalRules: z.string().max(2000).optional(),
    })
    .passthrough()
    .optional(),
  faq: z
    .array(
      z.object({
        id: z.string().optional(),
        question: z.string().min(1).max(500),
        answer: z.string().min(1).max(2000),
      })
    )
    .optional(),
  strictMode: z.boolean().optional(),
  temperature: z.number().min(0).max(1).optional(),
});

export const aiAgentRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/workspaces/:workspaceId/ai-agent
  app.get(
    "/v1/workspaces/:workspaceId/ai-agent",
    {
      preHandler: [app.authenticate, app.requireWorkspaceContext],
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

      const { workspaceId } = parsedParams.data;

      const config = await withTenantTransaction(workspaceId, async (client) => {
        const res = await client.query(
          `SELECT
             ai_receptionist_enabled,
             ai_agent_name,
             ai_system_prompt,
             ai_personality,
             ai_skills,
             ai_business_rules,
             ai_faq,
             ai_strict_mode,
             ai_temperature
           FROM public.workspaces
           WHERE id = $1`,
          [workspaceId]
        );
        return res.rows[0];
      });

      if (!config) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: "Workspace not found",
          instance: request.url,
          correlationId: request.id,
        });
      }

      return reply.status(200).send({
        success: true,
        config: {
          enabled: config.ai_receptionist_enabled ?? true,
          name: config.ai_agent_name || "Assistente Virtual",
          systemPrompt:
            config.ai_system_prompt ||
            "Você é a assistente de vendas da empresa. Atenda os clientes com atenção e simpatia.",
          personality: config.ai_personality || "cordial_comercial",
          skills: config.ai_skills || {
            qualify_lead: true,
            catalog_offers: true,
            pix_charges: true,
            appointments: true,
            capi_tracking: true,
          },
          businessRules: config.ai_business_rules || {
            openingHours: "",
            address: "",
            cancellationPolicy: "",
            paymentMethods: "",
            generalRules: "",
          },
          faq: Array.isArray(config.ai_faq) ? config.ai_faq : [],
          strictMode: config.ai_strict_mode ?? true,
          temperature: Number(config.ai_temperature ?? 0.1),
        },
      });
    }
  );

  // PUT /v1/workspaces/:workspaceId/ai-agent
  app.put(
    "/v1/workspaces/:workspaceId/ai-agent",
    {
      preHandler: [app.authenticate, app.requireWorkspaceContext],
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

      const parsedBody = updateAiAgentBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid AI agent payload: " + parsedBody.error.message,
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId } = parsedParams.data;
      const data = parsedBody.data;

      const updated = await withTenantTransaction(workspaceId, async (client) => {
        const res = await client.query(
          `UPDATE public.workspaces
           SET
             ai_receptionist_enabled = COALESCE($2, ai_receptionist_enabled),
             ai_agent_name = COALESCE($3, ai_agent_name),
             ai_system_prompt = COALESCE($4, ai_system_prompt),
             ai_personality = COALESCE($5, ai_personality),
             ai_skills = CASE WHEN $6::jsonb IS NOT NULL THEN $6::jsonb ELSE ai_skills END,
             ai_business_rules = CASE WHEN $7::jsonb IS NOT NULL THEN $7::jsonb ELSE ai_business_rules END,
             ai_faq = CASE WHEN $8::jsonb IS NOT NULL THEN $8::jsonb ELSE ai_faq END,
             ai_strict_mode = COALESCE($9, ai_strict_mode),
             ai_temperature = COALESCE($10, ai_temperature),
             updated_at = clock_timestamp()
           WHERE id = $1
           RETURNING
             ai_receptionist_enabled,
             ai_agent_name,
             ai_system_prompt,
             ai_personality,
             ai_skills,
             ai_business_rules,
             ai_faq,
             ai_strict_mode,
             ai_temperature;`,
          [
            workspaceId,
            data.enabled !== undefined ? data.enabled : null,
            data.name?.trim() || null,
            data.systemPrompt?.trim() || null,
            data.personality || null,
            data.skills ? JSON.stringify(data.skills) : null,
            data.businessRules ? JSON.stringify(data.businessRules) : null,
            data.faq ? JSON.stringify(data.faq) : null,
            data.strictMode !== undefined ? data.strictMode : null,
            data.temperature !== undefined ? data.temperature : null,
          ]
        );
        return res.rows[0];
      });

      if (!updated) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: "Workspace not found",
          instance: request.url,
          correlationId: request.id,
        });
      }

      return reply.status(200).send({
        success: true,
        config: {
          enabled: updated.ai_receptionist_enabled,
          name: updated.ai_agent_name,
          systemPrompt: updated.ai_system_prompt,
          personality: updated.ai_personality,
          skills: updated.ai_skills,
          businessRules: updated.ai_business_rules,
          faq: updated.ai_faq,
          strictMode: updated.ai_strict_mode,
          temperature: Number(updated.ai_temperature),
        },
      });
    }
  );
};
