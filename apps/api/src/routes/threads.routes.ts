import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  withTenantTransaction,
  listCommercialThreads,
  listThreadMessages,
  updateCommercialThreadStatus,
  type CommercialThreadStatus,
} from "@sos-sales/database";

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const threadParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  threadId: z.string().uuid(),
});

const listThreadsQuerySchema = z.object({
  status: z
    .enum(["active", "waiting_client", "waiting_human", "closed"])
    .optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  ascending: z.coerce.boolean().default(true),
});

const updateThreadBodySchema = z.object({
  status: z.enum(["active", "waiting_client", "waiting_human", "closed"]),
});

export const threadsRoutes: FastifyPluginAsync = async (app) => {
  // 1. List Commercial Threads for Workspace
  app.get(
    "/v1/workspaces/:workspaceId/threads",
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

      const parsedQuery = listThreadsQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: parsedQuery.error.issues.map((i) => i.message).join(", "),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId } = parsedParams.data;
      const { status, limit } = parsedQuery.data;

      const threads = await withTenantTransaction(workspaceId, async (client) => {
        return listCommercialThreads(client, {
          workspaceId,
          status: status as CommercialThreadStatus | undefined,
          limit,
        });
      });

      return reply.status(200).send({
        threads: threads.map((t) => ({
          id: t.id,
          workspaceId: t.workspace_id,
          channelInstanceId: t.channel_instance_id,
          channelProvider: t.channel_provider,
          channelName: t.channel_name,
          contactId: t.contact_id,
          contactPhone: t.contact_phone,
          contactName: t.contact_name,
          status: t.status,
          lastMessageAt: t.last_message_at,
          lastMessage: t.last_message_body
            ? {
                body: t.last_message_body,
                direction: t.last_message_direction,
                createdAt: t.last_message_created_at,
                deliveryStatus: t.last_message_delivery_status,
              }
            : null,
          createdAt: t.created_at,
          updatedAt: t.updated_at,
        })),
        total: threads.length,
      });
    }
  );

  // 2. List Messages for Thread
  app.get(
    "/v1/workspaces/:workspaceId/threads/:threadId/messages",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("cockpit:access"),
      ],
    },
    async (request, reply) => {
      const parsedParams = threadParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid route parameters",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parsedQuery = listMessagesQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: parsedQuery.error.issues.map((i) => i.message).join(", "),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, threadId } = parsedParams.data;
      const { limit, ascending } = parsedQuery.data;

      const messages = await withTenantTransaction(workspaceId, async (client) => {
        return listThreadMessages(client, {
          workspaceId,
          threadId,
          limit,
          ascending,
        });
      });

      return reply.status(200).send({
        messages: messages.map((m) => ({
          id: m.id,
          workspaceId: m.workspace_id,
          channelInstanceId: m.channel_instance_id,
          threadId: m.thread_id,
          provider: m.provider,
          direction: m.direction,
          senderE164: m.sender_e164,
          recipientE164: m.recipient_e164,
          contentType: m.content_type,
          body: m.body,
          mediaUrl: m.media_url,
          providerMessageId: m.provider_message_id,
          deliveryStatus: m.delivery_status,
          statusRank: m.status_rank,
          createdAt: m.created_at,
          updatedAt: m.updated_at,
        })),
        total: messages.length,
      });
    }
  );

  // 3. Update Thread Status (e.g. waiting_human, closed, active)
  app.patch(
    "/v1/workspaces/:workspaceId/threads/:threadId",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("cockpit:access"),
      ],
    },
    async (request, reply) => {
      const parsedParams = threadParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid route parameters",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parsedBody = updateThreadBodySchema.safeParse(request.body);
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

      const { workspaceId, threadId } = parsedParams.data;
      const { status } = parsedBody.data;

      const updated = await withTenantTransaction(workspaceId, async (client) => {
        return updateCommercialThreadStatus(client, {
          workspaceId,
          threadId,
          status: status as CommercialThreadStatus,
        });
      });

      if (!updated) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: "Commercial thread not found",
          instance: request.url,
          correlationId: request.id,
        });
      }

      return reply.status(200).send({
        thread: {
          id: updated.id,
          workspaceId: updated.workspace_id,
          channelInstanceId: updated.channel_instance_id,
          contactId: updated.contact_id,
          status: updated.status,
          lastMessageAt: updated.last_message_at,
          createdAt: updated.created_at,
          updatedAt: updated.updated_at,
        },
      });
    }
  );
};
