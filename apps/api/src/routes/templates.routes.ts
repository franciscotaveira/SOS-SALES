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

export const templatesRoutes: FastifyPluginAsync = async (app) => {
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
