import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  withTenantTransaction,
  listWhatsAppFlows,
  upsertWhatsAppFlow,
  type FlowCategory,
  type FlowStatus,
} from "@sos-sales/database";

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const listFlowsQuerySchema = z.object({
  category: z
    .enum(["LEAD_GENERATION", "APPOINTMENT_BOOKING", "CUSTOMER_SUPPORT", "SURVEY"])
    .optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "DEPRECATED", "BLOCKED"]).optional(),
});

const flowScreenFieldSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["text", "select", "radio", "date", "textarea"]),
  label: z.string().min(1),
  required: z.boolean().optional(),
  options: z.array(z.object({ id: z.string(), title: z.string() })).optional(),
});

const flowScreenSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  fields: z.array(flowScreenFieldSchema),
});

const createFlowBodySchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_]+$/, "Flow name must contain only lowercase alphanumeric characters and underscores"),
  title: z.string().min(1).max(120),
  description: z.string().max(255).nullable().optional(),
  category: z
    .enum(["LEAD_GENERATION", "APPOINTMENT_BOOKING", "CUSTOMER_SUPPORT", "SURVEY"])
    .default("LEAD_GENERATION"),
  status: z.enum(["DRAFT", "PUBLISHED", "DEPRECATED", "BLOCKED"]).default("PUBLISHED"),
  metaFlowId: z.string().min(1),
  ctaLabel: z.string().min(1).max(30).default("Preencher Formulário"),
  headerText: z.string().max(60).nullable().optional(),
  bodyText: z.string().min(1).max(1024),
  footerText: z.string().max(60).nullable().optional(),
  initialScreen: z.string().min(1).default("START_SCREEN"),
  screensPreview: z.array(flowScreenSchema).default([]),
});

export const flowsRoutes: FastifyPluginAsync = async (app) => {
  // 1. List WhatsApp native flows (with auto-seeding of master flows if workspace has none)
  app.get(
    "/v1/workspaces/:workspaceId/flows",
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

      const parsedQuery = listFlowsQuerySchema.safeParse(request.query);
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

      const flows = await withTenantTransaction(workspaceId, async (client) => {
        return listWhatsAppFlows(client, workspaceId, {
          category: category as FlowCategory | undefined,
          status: status as FlowStatus | undefined,
        });
      });

      return reply.status(200).send({
        flows: flows.map((f) => ({
          id: f.id,
          workspaceId: f.workspace_id,
          name: f.name,
          title: f.title,
          description: f.description,
          category: f.category,
          status: f.status,
          metaFlowId: f.meta_flow_id,
          ctaLabel: f.cta_label,
          headerText: f.header_text,
          bodyText: f.body_text,
          footerText: f.footer_text,
          initialScreen: f.initial_screen,
          screensPreview: f.screens_preview,
          createdAt: f.created_at.toISOString(),
          updatedAt: f.updated_at.toISOString(),
        })),
        total: flows.length,
      });
    }
  );

  // 2. Register or update a WhatsApp Flow
  app.post(
    "/v1/workspaces/:workspaceId/flows",
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

      const parsedBody = createFlowBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: parsedBody.error.issues[0]?.message || "Invalid flow payload",
          errors: parsedBody.error.issues,
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId } = parsedParams.data;
      const body = parsedBody.data;

      const flow = await withTenantTransaction(workspaceId, async (client) => {
        return upsertWhatsAppFlow(client, {
          workspaceId,
          name: body.name,
          title: body.title,
          description: body.description ?? null,
          category: body.category as FlowCategory,
          status: body.status as FlowStatus,
          metaFlowId: body.metaFlowId,
          ctaLabel: body.ctaLabel,
          headerText: body.headerText ?? null,
          bodyText: body.bodyText,
          footerText: body.footerText ?? null,
          initialScreen: body.initialScreen,
          screensPreview: body.screensPreview,
        });
      });

      return reply.status(201).send({
        flow: {
          id: flow.id,
          workspaceId: flow.workspace_id,
          name: flow.name,
          title: flow.title,
          description: flow.description,
          category: flow.category,
          status: flow.status,
          metaFlowId: flow.meta_flow_id,
          ctaLabel: flow.cta_label,
          headerText: flow.header_text,
          bodyText: flow.body_text,
          footerText: flow.footer_text,
          initialScreen: flow.initial_screen,
          screensPreview: flow.screens_preview,
          createdAt: flow.created_at.toISOString(),
          updatedAt: flow.updated_at.toISOString(),
        },
      });
    }
  );
};
