import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  withTenantTransaction,
  createCommercialJourney,
  getJourneyByThread,
  listCommercialJourneys,
  recordCommercialOutcome,
  type JourneyStage,
  type AttributionSource,
} from "@sos-sales/database";

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const journeyParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  journeyId: z.string().uuid(),
});

const threadParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  threadId: z.string().uuid(),
});

const createJourneyBodySchema = z.object({
  contactId: z.string().uuid(),
  threadId: z.string().uuid().optional().nullable(),
  title: z.string().min(1).max(200).optional(),
  stage: z.enum(["lead", "qualified", "proposal", "scheduled", "won", "lost"] as const).optional(),
  attributionSource: z.enum([
    "ctwa_meta",
    "lead_ads_meta",
    "tracked_link_meta",
    "organic_whatsapp",
    "manual_input",
  ] as const).optional(),
  campaignId: z.string().optional().nullable(),
  adId: z.string().optional().nullable(),
  ctwaClid: z.string().optional().nullable(),
  estimatedValueCents: z.number().int().nonnegative().optional(),
});

const recordOutcomeBodySchema = z.object({
  status: z.enum(["won", "lost"]),
  valueCents: z.number().int().nonnegative(),
  currency: z.string().min(3).max(3).default("BRL"),
  reason: z.string().max(500).optional().nullable(),
  userPhoneE164: z.string().optional(),
});

export const commercialRoutes: FastifyPluginAsync = async (app) => {
  // 1. List commercial journeys (opportunities)
  app.get(
    "/v1/workspaces/:workspaceId/journeys",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
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

      const { workspaceId } = parsedParams.data;
      const query = request.query as { status?: any; limit?: string };
      const limit = query.limit ? parseInt(query.limit, 10) : 50;

      const journeys = await withTenantTransaction(workspaceId, async (client) => {
        return listCommercialJourneys(client, workspaceId, {
          status: query.status,
          limit,
        });
      });

      return reply.status(200).send({
        items: journeys.map((j) => ({
          id: j.id,
          workspaceId: j.workspace_id,
          contactId: j.contact_id,
          threadId: j.thread_id,
          assignedUserId: j.assigned_user_id,
          title: j.title,
          stage: j.stage,
          status: j.status,
          attributionSource: j.attribution_source,
          campaignId: j.campaign_id,
          adId: j.ad_id,
          ctwaClid: j.ctwa_clid,
          estimatedValueCents: j.estimated_value_cents,
          createdAt: j.created_at.toISOString(),
          updatedAt: j.updated_at.toISOString(),
        })),
        total: journeys.length,
      });
    }
  );

  // 2. Create commercial journey
  app.post(
    "/v1/workspaces/:workspaceId/journeys",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("journey:transition_stage"),
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

      const parseResult = createJourneyBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid journey creation payload",
          details: parseResult.error.format(),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId } = parsedParams.data;
      const data = parseResult.data;

      const journey = await withTenantTransaction(workspaceId, async (client) => {
        return createCommercialJourney(client, workspaceId, {
          contactId: data.contactId,
          threadId: data.threadId,
          assignedUserId: request.user?.id || null,
          title: data.title,
          stage: data.stage as JourneyStage,
          attributionSource: data.attributionSource as AttributionSource,
          campaignId: data.campaignId,
          adId: data.adId,
          ctwaClid: data.ctwaClid,
          estimatedValueCents: data.estimatedValueCents,
        });
      });

      return reply.status(201).send({
        id: journey.id,
        workspaceId: journey.workspace_id,
        contactId: journey.contact_id,
        threadId: journey.thread_id,
        title: journey.title,
        stage: journey.stage,
        status: journey.status,
        attributionSource: journey.attribution_source,
        estimatedValueCents: journey.estimated_value_cents,
        createdAt: journey.created_at.toISOString(),
      });
    }
  );

  // 3. Record outcome (close deal with financial value + trigger CAPI)
  app.post(
    "/v1/workspaces/:workspaceId/journeys/:journeyId/outcomes",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("outcome:register"),
      ],
    },
    async (request, reply) => {
      const parsedParams = journeyParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or journeyId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parseResult = recordOutcomeBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid outcome payload",
          details: parseResult.error.format(),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, journeyId } = parsedParams.data;
      const data = parseResult.data;

      try {
        const result = await withTenantTransaction(workspaceId, async (client) => {
          return recordCommercialOutcome(client, workspaceId, {
            journeyId,
            status: data.status,
            valueCents: data.valueCents,
            currency: data.currency,
            reason: data.reason || undefined,
            registeredByUserId: request.user.id,
            userPhoneE164: data.userPhoneE164,
          });
        });

        return reply.status(201).send({
          outcome: {
            id: result.outcome.id,
            journeyId: result.outcome.journey_id,
            status: result.outcome.status,
            valueCents: result.outcome.value_cents,
            currency: result.outcome.currency,
            registeredByUserId: result.outcome.registered_by_user_id,
            createdAt: result.outcome.created_at.toISOString(),
          },
          conversionEvent: result.conversionEvent
            ? {
                id: result.conversionEvent.id,
                eventName: result.conversionEvent.event_name,
                status: result.conversionEvent.status,
                valueCents: result.conversionEvent.value_cents,
                currency: result.conversionEvent.currency,
                createdAt: result.conversionEvent.created_at.toISOString(),
              }
            : null,
        });
      } catch (err: any) {
        if (err.message && err.message.includes("not found")) {
          return reply.status(404).send({
            type: "https://sos-sales.mct.br/errors/not-found",
            title: "Not Found",
            status: 404,
            detail: err.message,
            instance: request.url,
            correlationId: request.id,
          });
        }
        throw err;
      }
    }
  );

  // 3.1 Get Journey and latest outcome by Thread ID
  app.get(
    "/v1/workspaces/:workspaceId/threads/:threadId/journey",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
      ],
    },
    async (request, reply) => {
      const parsedParams = threadParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or threadId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, threadId } = parsedParams.data;

      const result = await withTenantTransaction(workspaceId, async (client) => {
        const journey = await getJourneyByThread(client, workspaceId, threadId);
        if (!journey) {
          return { journey: null, latestOutcome: null };
        }

        const outcomeRes = await client.query(
          `SELECT * FROM public.commercial_outcomes
           WHERE workspace_id = $1 AND journey_id = $2
           ORDER BY created_at DESC
           LIMIT 1;`,
          [workspaceId, journey.id]
        );

        return {
          journey: {
            id: journey.id,
            workspaceId: journey.workspace_id,
            contactId: journey.contact_id,
            threadId: journey.thread_id,
            stage: journey.stage,
            status: journey.status,
            estimatedValueCents: journey.estimated_value_cents,
            createdAt: journey.created_at.toISOString(),
          },
          latestOutcome: outcomeRes.rows[0]
            ? {
                id: outcomeRes.rows[0].id,
                status: outcomeRes.rows[0].status,
                valueCents: outcomeRes.rows[0].value_cents,
                currency: outcomeRes.rows[0].currency,
                reason: outcomeRes.rows[0].reason,
                createdAt: outcomeRes.rows[0].created_at.toISOString(),
              }
            : null,
        };
      });

      return reply.status(200).send(result);
    }
  );

  // 3.2 Record outcome directly for a Thread (auto-provisions Journey if needed + triggers CAPI)
  app.post(
    "/v1/workspaces/:workspaceId/threads/:threadId/outcomes",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("outcome:register"),
      ],
    },
    async (request, reply) => {
      const parsedParams = threadParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or threadId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parseResult = recordOutcomeBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid outcome payload",
          details: parseResult.error.format(),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, threadId } = parsedParams.data;
      const data = parseResult.data;
      const userId = request.user.id;

      try {
        const result = await withTenantTransaction(workspaceId, async (client) => {
          // 1. Get or create journey for this thread under RLS
          let journey = await getJourneyByThread(client, workspaceId, threadId);
          if (!journey) {
            const threadRes = await client.query<{ contact_id: string }>(
              `SELECT contact_id FROM public.commercial_threads WHERE workspace_id = $1 AND id = $2;`,
              [workspaceId, threadId]
            );
            if (!threadRes.rows[0]) {
              throw new Error(`Commercial thread ${threadId} not found in workspace ${workspaceId}`);
            }

            journey = await createCommercialJourney(client, workspaceId, {
              contactId: threadRes.rows[0].contact_id,
              threadId,
              assignedUserId: userId,
              title: "Oportunidade Comercial WhatsApp",
              stage: data.status,
              attributionSource: "organic_whatsapp",
              estimatedValueCents: data.valueCents,
            });
          }

          // 2. Resolve user phone for Meta CAPI SHA-256 matching
          let userPhone = data.userPhoneE164;
          if (!userPhone) {
            const contactRes = await client.query<{ phone_e164: string }>(
              `SELECT phone_e164 FROM public.contacts WHERE workspace_id = $1 AND id = $2;`,
              [workspaceId, journey.contact_id]
            );
            userPhone = contactRes.rows[0]?.phone_e164;
          }

          // 3. Record outcome & enqueue CAPI
          return recordCommercialOutcome(client, workspaceId, {
            journeyId: journey.id,
            status: data.status,
            valueCents: data.valueCents,
            currency: data.currency,
            reason: data.reason || undefined,
            registeredByUserId: userId,
            userPhoneE164: userPhone,
          });
        });

        return reply.status(201).send({
          outcome: {
            id: result.outcome.id,
            workspaceId: result.outcome.workspace_id,
            journeyId: result.outcome.journey_id,
            status: result.outcome.status,
            valueCents: result.outcome.value_cents,
            currency: result.outcome.currency,
            reason: result.outcome.reason,
            createdAt: result.outcome.created_at.toISOString(),
          },
          conversionEvent: result.conversionEvent
            ? {
                id: result.conversionEvent.id,
                eventName: result.conversionEvent.event_name,
                status: result.conversionEvent.status,
                valueCents: result.conversionEvent.value_cents,
                createdAt: result.conversionEvent.created_at.toISOString(),
              }
            : null,
        });
      } catch (err: any) {
        if (err.message && err.message.includes("not found")) {
          return reply.status(404).send({
            type: "https://sos-sales.mct.br/errors/not-found",
            title: "Not Found",
            status: 404,
            detail: err.message,
            instance: request.url,
            correlationId: request.id,
          });
        }
        throw err;
      }
    }
  );

  // 4. List conversion events (Meta CAPI verification & audit)
  app.get(
    "/v1/workspaces/:workspaceId/conversions",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
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

      const { workspaceId } = parsedParams.data;

      const rows = await withTenantTransaction(workspaceId, async (client) => {
        const res = await client.query(
          `SELECT * FROM public.conversion_events
           WHERE workspace_id = $1
           ORDER BY created_at DESC
           LIMIT 50;`,
          [workspaceId]
        );
        return res.rows;
      });

      return reply.status(200).send({
        items: rows.map((r: any) => ({
          id: r.id,
          journeyId: r.journey_id,
          outcomeId: r.outcome_id,
          eventName: r.event_name,
          valueCents: r.value_cents,
          currency: r.currency,
          status: r.status,
          providerReceipt: r.provider_receipt,
          errorMessage: r.error_message,
          createdAt: r.created_at.toISOString(),
        })),
        total: rows.length,
      });
    }
  );
};
