import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { withTenantTransaction } from "@sos-sales/database";
import {
  SovereignLlmClient,
  buildGroundedSystemPrompt,
  parseAiResponse,
  DEFAULT_MODELS,
  type GroundedAiConfig,
  type GroundedProduct,
  type AiProvider,
} from "@sos-sales/application";

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
  provider: z.enum(["nvidia", "openrouter"]).optional(),
  model: z.string().min(1).max(100).optional(),
  apiKey: z.string().max(300).optional(),
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

const simulateBodySchema = z.object({
  message: z.string().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(2000),
      })
    )
    .optional(),
  draftConfig: updateAiAgentBodySchema.optional(),
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
             ai_temperature,
             ai_provider,
             ai_model,
             ai_api_key
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

      const rawRules = (config.ai_business_rules || {}) as Record<string, string | undefined>;
      const normalizedRules = {
        openingHours: rawRules.openingHours || rawRules.opening_hours || "",
        address: rawRules.address || "",
        cancellationPolicy: rawRules.cancellationPolicy || rawRules.cancellation_policy || "",
        paymentMethods: rawRules.paymentMethods || rawRules.payment_methods || "",
        generalRules: rawRules.generalRules || rawRules.general_rules || "",
      };

      return reply.status(200).send({
        success: true,
        config: {
          enabled: config.ai_receptionist_enabled ?? true,
          name: config.ai_agent_name || "Assistente Virtual",
          systemPrompt:
            config.ai_system_prompt ||
            "Você é a assistente de vendas da empresa. Atenda os clientes com atenção e simpatia.",
          personality: config.ai_personality || "cordial_comercial",
          provider: (config.ai_provider as AiProvider) || "nvidia",
          model:
            config.ai_model ||
            (config.ai_provider === "openrouter"
              ? DEFAULT_MODELS.openrouter
              : process.env.NVIDIA_TEMPLATE_MODEL || process.env.NVIDIA_MODEL || DEFAULT_MODELS.nvidia),
          hasCustomApiKey: Boolean(config.ai_api_key),
          skills: config.ai_skills || {
            qualify_lead: true,
            catalog_offers: true,
            pix_charges: true,
            appointments: true,
            capi_tracking: true,
          },
          businessRules: normalizedRules,
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
             ai_provider = COALESCE($11, ai_provider),
             ai_model = COALESCE($12, ai_model),
             ai_api_key = CASE WHEN $13::text IS NOT NULL THEN $13::text ELSE ai_api_key END,
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
             ai_temperature,
             ai_provider,
             ai_model,
             ai_api_key;`,
          [
            workspaceId,
            data.enabled !== undefined ? data.enabled : null,
            data.name?.trim() || null,
            data.systemPrompt?.trim() || null,
            data.personality || null,
            data.skills ? JSON.stringify(data.skills) : null,
            data.businessRules
              ? JSON.stringify({
                  openingHours: data.businessRules.openingHours?.trim() || "",
                  address: data.businessRules.address?.trim() || "",
                  cancellationPolicy: data.businessRules.cancellationPolicy?.trim() || "",
                  paymentMethods: data.businessRules.paymentMethods?.trim() || "",
                  generalRules: data.businessRules.generalRules?.trim() || "",
                  // Backwards-compatibility
                  opening_hours: data.businessRules.openingHours?.trim() || "",
                  cancellation_policy: data.businessRules.cancellationPolicy?.trim() || "",
                  payment_methods: data.businessRules.paymentMethods?.trim() || "",
                  general_rules: data.businessRules.generalRules?.trim() || "",
                })
              : null,
            data.faq ? JSON.stringify(data.faq) : null,
            data.strictMode !== undefined ? data.strictMode : null,
            data.temperature !== undefined ? data.temperature : null,
            data.provider || null,
            data.model || null,
            data.apiKey !== undefined ? data.apiKey.trim() || null : null,
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

      const rawUpdatedRules = (updated.ai_business_rules || {}) as Record<string, string | undefined>;
      const normalizedUpdatedRules = {
        openingHours: rawUpdatedRules.openingHours || rawUpdatedRules.opening_hours || "",
        address: rawUpdatedRules.address || "",
        cancellationPolicy: rawUpdatedRules.cancellationPolicy || rawUpdatedRules.cancellation_policy || "",
        paymentMethods: rawUpdatedRules.paymentMethods || rawUpdatedRules.payment_methods || "",
        generalRules: rawUpdatedRules.generalRules || rawUpdatedRules.general_rules || "",
      };

      return reply.status(200).send({
        success: true,
        config: {
          enabled: updated.ai_receptionist_enabled,
          name: updated.ai_agent_name,
          systemPrompt: updated.ai_system_prompt,
          personality: updated.ai_personality,
          provider: updated.ai_provider,
          model: updated.ai_model,
          hasCustomApiKey: Boolean(updated.ai_api_key),
          skills: updated.ai_skills,
          businessRules: normalizedUpdatedRules,
          faq: updated.ai_faq,
          strictMode: updated.ai_strict_mode,
          temperature: Number(updated.ai_temperature),
        },
      });
    }
  );

  // POST /v1/workspaces/:workspaceId/ai-agent/simulate (Dry-Run Playground)
  app.post(
    "/v1/workspaces/:workspaceId/ai-agent/simulate",
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

      const parsedBody = simulateBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid simulate payload: " + parsedBody.error.message,
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId } = parsedParams.data;
      const { message, history, draftConfig } = parsedBody.data;

      const { ws, products } = await withTenantTransaction(workspaceId, async (client) => {
        const wsRes = await client.query(
          `SELECT
             ai_agent_name,
             ai_system_prompt,
             ai_personality,
             ai_business_rules,
             ai_faq,
             ai_strict_mode,
             ai_temperature,
             ai_provider,
             ai_model,
             ai_api_key
           FROM public.workspaces
           WHERE id = $1`,
          [workspaceId]
        );

        const prodRes = await client.query<{
          id: string;
          title: string;
          description: string | null;
          price_cents: number;
          category: string | null;
          badge: string | null;
        }>(
          `SELECT id, title, description, price_cents, category, badge
           FROM public.products
           WHERE workspace_id = $1 AND status = 'ACTIVE'
           ORDER BY is_featured DESC, title ASC
           LIMIT 50;`,
          [workspaceId]
        );

        return { ws: wsRes.rows[0], products: prodRes.rows };
      });

      if (!ws) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: "Workspace not found",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const provider: AiProvider = (draftConfig?.provider || ws.ai_provider as AiProvider) || "nvidia";
      const apiKey =
        draftConfig?.apiKey?.trim() ||
        ws.ai_api_key?.trim() ||
        (provider === "nvidia"
          ? process.env.NVIDIA_API_KEY || process.env.NVAPI_KEY
          : process.env.OPENROUTER_API_KEY);

      if (!apiKey || !apiKey.trim()) {
        return reply.status(422).send({
          type: "https://sos-sales.mct.br/errors/unprocessable-entity",
          title: "API Key Missing",
          status: 422,
          detail: `Chave de API para o provedor '${provider.toUpperCase()}' não está configurada nem no workspace nem no servidor.`,
          instance: request.url,
          correlationId: request.id,
        });
      }

      const groundedProducts: GroundedProduct[] = products.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        priceCents: p.price_cents,
        category: p.category,
        badge: p.badge,
      }));

      const rawBusinessRules = draftConfig?.businessRules || ws.ai_business_rules || {};
      const aiConfig: GroundedAiConfig = {
        name: draftConfig?.name || ws.ai_agent_name || "Assistente Virtual",
        personality: draftConfig?.personality || ws.ai_personality || "cordial_comercial",
        systemPrompt: (draftConfig?.systemPrompt !== undefined ? draftConfig.systemPrompt : ws.ai_system_prompt) || "",
        strictMode: draftConfig?.strictMode !== undefined ? draftConfig.strictMode : (ws.ai_strict_mode ?? true),
        businessRules: rawBusinessRules,
        faq: Array.isArray(draftConfig?.faq) ? draftConfig.faq : (Array.isArray(ws.ai_faq) ? ws.ai_faq : []),
      };

      const rulesRecord = (aiConfig.businessRules || {}) as Record<string, string | undefined>;
      const activeRulesCount = [
        rulesRecord.openingHours || rulesRecord.opening_hours,
        rulesRecord.address,
        rulesRecord.paymentMethods || rulesRecord.payment_methods,
        rulesRecord.cancellationPolicy || rulesRecord.cancellation_policy,
        rulesRecord.generalRules || rulesRecord.general_rules,
      ].filter((v) => Boolean(v && v.trim())).length;

      const activeFaqCount = (aiConfig.faq || []).filter((f) => Boolean(f.question?.trim() && f.answer?.trim())).length;

      const systemPrompt = buildGroundedSystemPrompt(aiConfig, groundedProducts);
      const messagesForModel: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: systemPrompt },
      ];

      if (history && history.length > 0) {
        for (const item of history) {
          messagesForModel.push({ role: item.role, content: item.content });
        }
      }

      messagesForModel.push({ role: "user", content: message });

      const llmClient = new SovereignLlmClient();
      const model =
        draftConfig?.model ||
        ws.ai_model ||
        (provider === "nvidia"
          ? process.env.NVIDIA_TEMPLATE_MODEL || process.env.NVIDIA_MODEL || DEFAULT_MODELS.nvidia
          : DEFAULT_MODELS.openrouter);

      const startTime = Date.now();
      const completion = await llmClient.complete(messagesForModel, {
        provider,
        apiKey,
        model,
        temperature: Number(draftConfig?.temperature ?? ws.ai_temperature ?? 0.1),
      });
      const latencyMs = Date.now() - startTime;

      const parsed = parseAiResponse(completion.content);

      return reply.status(200).send({
        success: true,
        replyText: parsed.cleanReplyText,
        needsHandoff: parsed.needsHandoff,
        handoffReason: parsed.handoffReason || null,
        offerPixProductId: parsed.offerPixProductId || null,
        matchedCatalogCount: groundedProducts.length,
        groundedRulesCount: activeRulesCount,
        groundedFaqCount: activeFaqCount,
        isCustomPromptUsed: Boolean(aiConfig.systemPrompt && aiConfig.systemPrompt.trim()),
        strictMode: aiConfig.strictMode,
        provider: completion.provider,
        model: completion.model,
        latencyMs,
      });
    }
  );
};
