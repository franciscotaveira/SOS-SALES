import type { FastifyPluginAsync } from "fastify";
import crypto from "node:crypto";
import { z } from "zod";
import {
  withTenantTransaction,
  listOutboundWebhooks,
  getOutboundWebhookById,
  createOutboundWebhook,
  updateOutboundWebhook,
  deleteOutboundWebhook,
  recordWebhookDelivery,
  listWebhookDeliveries,
} from "@sos-sales/database";
import { safeFetchWithSsrfGuard, getInternalAllowedHosts } from "@sos-sales/application";

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const webhookParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  webhookId: z.string().uuid(),
});

const createWebhookSchema = z.object({
  url: z.string().url().max(1024),
  description: z.string().max(255).optional().nullable(),
  events: z.array(z.string().min(1).max(100)).max(20).optional(),
  secret: z.string().min(16).max(128).optional(),
});

const updateWebhookSchema = z.object({
  url: z.string().url().max(1024).optional(),
  description: z.string().max(255).optional().nullable(),
  events: z.array(z.string().min(1).max(100)).max(20).optional(),
  is_active: z.boolean().optional(),
});

export const outboundWebhooksRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/workspaces/:workspaceId/webhooks
  app.get(
    "/v1/workspaces/:workspaceId/webhooks",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("integration:view"),
      ],
    },
    async (request, reply) => {
      const { workspaceId } = workspaceParamsSchema.parse(request.params);

      const webhooks = await withTenantTransaction(workspaceId, async (client) => {
        return listOutboundWebhooks(client, workspaceId);
      });

      return reply.status(200).send({
        success: true,
        webhooks,
      });
    }
  );

  // POST /v1/workspaces/:workspaceId/webhooks
  app.post(
    "/v1/workspaces/:workspaceId/webhooks",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("integration:manage"),
      ],
    },
    async (request, reply) => {
      const { workspaceId } = workspaceParamsSchema.parse(request.params);
      const body = createWebhookSchema.parse(request.body);

      const secret = body.secret || `whsec_${crypto.randomBytes(24).toString("hex")}`;

      const webhook = await withTenantTransaction(workspaceId, async (client) => {
        return createOutboundWebhook(client, {
          workspaceId,
          url: body.url,
          secret,
          description: body.description,
          events: body.events,
        });
      });

      return reply.status(201).send({
        success: true,
        webhook,
      });
    }
  );

  // PATCH /v1/workspaces/:workspaceId/webhooks/:webhookId
  app.patch(
    "/v1/workspaces/:workspaceId/webhooks/:webhookId",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("integration:manage"),
      ],
    },
    async (request, reply) => {
      const { workspaceId, webhookId } = webhookParamsSchema.parse(request.params);
      const body = updateWebhookSchema.parse(request.body);

      const webhook = await withTenantTransaction(workspaceId, async (client) => {
        return updateOutboundWebhook(client, {
          workspaceId,
          webhookId,
          url: body.url,
          description: body.description,
          events: body.events,
          is_active: body.is_active,
        });
      });

      if (!webhook) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Webhook Not Found",
          status: 404,
          detail: "A assinatura de webhook especificada não foi encontrada.",
        });
      }

      return reply.status(200).send({
        success: true,
        webhook,
      });
    }
  );

  // DELETE /v1/workspaces/:workspaceId/webhooks/:webhookId
  app.delete(
    "/v1/workspaces/:workspaceId/webhooks/:webhookId",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("integration:manage"),
      ],
    },
    async (request, reply) => {
      const { workspaceId, webhookId } = webhookParamsSchema.parse(request.params);

      const deleted = await withTenantTransaction(workspaceId, async (client) => {
        return deleteOutboundWebhook(client, workspaceId, webhookId);
      });

      if (!deleted) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Webhook Not Found",
          status: 404,
          detail: "A assinatura de webhook especificada não foi encontrada.",
        });
      }

      return reply.status(200).send({
        success: true,
        message: "Assinatura de webhook removida com sucesso.",
      });
    }
  );

  // POST /v1/workspaces/:workspaceId/webhooks/:webhookId/test
  app.post(
    "/v1/workspaces/:workspaceId/webhooks/:webhookId/test",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("integration:manage"),
      ],
    },
    async (request, reply) => {
      const { workspaceId, webhookId } = webhookParamsSchema.parse(request.params);

      const webhook = await withTenantTransaction(workspaceId, async (client) => {
        return getOutboundWebhookById(client, workspaceId, webhookId);
      });

      if (!webhook) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Webhook Not Found",
          status: 404,
          detail: "A assinatura de webhook especificada não foi encontrada.",
        });
      }

      const deliveryId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      const testPayload = {
        id: deliveryId,
        event: "webhook.test",
        timestamp,
        workspace_id: workspaceId,
        data: {
          message: "Ping de teste do Chat Sales",
          system: "Chat Sales v3",
          status: "connected",
        },
      };

      const payloadString = JSON.stringify(testPayload);
      const signature = crypto
        .createHmac("sha256", webhook.secret)
        .update(payloadString)
        .digest("hex");

      const startTime = Date.now();
      let status: "delivered" | "failed" = "failed";
      let statusCode: number | null = null;
      let responseBody: string | null = null;
      let errorMessage: string | null = null;
      let durationMs = 0;

      try {
        const resp = await safeFetchWithSsrfGuard(
          webhook.url,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "ChatSales-Outbound-Webhook/3.0",
              "X-ChatSales-Signature-256": `sha256=${signature}`,
              "X-ChatSales-Event": "webhook.test",
              "X-ChatSales-Delivery": deliveryId,
            },
            body: payloadString,
          },
          {
            timeoutMs: 10000,
            allowLocalTest: process.env.NODE_ENV !== "production",
            allowedProtocols: ["http:", "https:"],
            allowedInternalHosts: getInternalAllowedHosts(),
          }
        );

        durationMs = Date.now() - startTime;
        statusCode = resp.status;
        const text = await resp.text();
        responseBody = text.slice(0, 1000);

        if (resp.ok) {
          status = "delivered";
        } else {
          status = "failed";
          errorMessage = `HTTP ${resp.status}: ${responseBody.slice(0, 200)}`;
        }
      } catch (err: unknown) {
        durationMs = Date.now() - startTime;
        status = "failed";
        errorMessage = err instanceof Error ? err.message : String(err);
      }

      // Persist delivery log in DB
      await withTenantTransaction(workspaceId, async (client) => {
        return recordWebhookDelivery(client, {
          subscriptionId: webhook.id,
          workspaceId,
          eventType: "webhook.test",
          payload: testPayload,
          status,
          statusCode,
          responseBody,
          errorMessage,
          durationMs,
        });
      });

      return reply.status(200).send({
        success: status === "delivered",
        status,
        statusCode,
        durationMs,
        responseBody,
        errorMessage,
      });
    }
  );

  // GET /v1/workspaces/:workspaceId/webhooks/:webhookId/deliveries
  app.get(
    "/v1/workspaces/:workspaceId/webhooks/:webhookId/deliveries",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("integration:view"),
      ],
    },
    async (request, reply) => {
      const { workspaceId, webhookId } = webhookParamsSchema.parse(request.params);

      const deliveries = await withTenantTransaction(workspaceId, async (client) => {
        return listWebhookDeliveries(client, workspaceId, webhookId, 15);
      });

      return reply.status(200).send({
        success: true,
        deliveries,
      });
    }
  );
};
