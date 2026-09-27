import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  withTenantTransaction,
  listContacts,
  createOrGetContact,
} from "@sos-sales/database";

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const listContactsQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const createContactBodySchema = z.object({
  phoneE164: z
    .string()
    .regex(/^\+[1-9][0-9]{6,14}$/, "Must be a valid E.164 phone number"),
  name: z.string().min(1).max(150).optional(),
});

export const contactsRoutes: FastifyPluginAsync = async (app) => {
  // 1. List contacts for workspace
  app.get(
    "/v1/workspaces/:workspaceId/contacts",
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

      const parsedQuery = listContactsQuerySchema.safeParse(request.query);
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
      const { search, limit, offset } = parsedQuery.data;

      const contacts = await withTenantTransaction(workspaceId, async (client) => {
        return listContacts(client, {
          workspaceId,
          search,
          limit,
          offset,
        });
      });

      return reply.status(200).send({
        contacts: contacts.map((c) => ({
          id: c.id,
          workspaceId: c.workspace_id,
          phoneE164: c.phone_e164,
          name: c.name,
          createdAt: c.created_at.toISOString(),
          updatedAt: c.updated_at.toISOString(),
        })),
        total: contacts.length,
      });
    }
  );

  // 2. Create or update contact
  app.post(
    "/v1/workspaces/:workspaceId/contacts",
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

      const parsedBody = createContactBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: parsedBody.error.issues.map((i) => i.message).join(", "),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId } = parsedParams.data;
      const { phoneE164, name } = parsedBody.data;

      const contact = await withTenantTransaction(workspaceId, async (client) => {
        return createOrGetContact(client, {
          workspaceId,
          phoneE164,
          name,
        });
      });

      return reply.status(201).send({
        contact: {
          id: contact.id,
          workspaceId: contact.workspace_id,
          phoneE164: contact.phone_e164,
          name: contact.name,
          createdAt: contact.created_at.toISOString(),
          updatedAt: contact.updated_at.toISOString(),
        },
      });
    }
  );
};
