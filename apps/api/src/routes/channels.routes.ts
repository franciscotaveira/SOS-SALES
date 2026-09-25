import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import { withTenantTransaction } from "@sos-sales/database";

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const createChannelBodySchema = z.object({
  provider: z.enum(["meta_waba", "waha", "evolution", "meta_messenger", "meta_instagram"]),
  displayName: z.string().min(2).max(100),
  phoneNumberE164: z
    .string()
    .regex(/^\+[1-9][0-9]{6,14}$/, "Must be a valid E.164 phone number")
    .optional(),
  endpointToken: z.string().min(16).optional(),
});

export const channelsRoutes: FastifyPluginAsync = async (app) => {
  // 1. List Channels for Workspace
  app.get(
    "/v1/workspaces/:workspaceId/channels",
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

      const { workspaceId } = parsedParams.data;

      const channels = await withTenantTransaction(workspaceId, async (client) => {
        const res = await client.query<{
          id: string;
          workspace_id: string;
          provider: string;
          display_name: string;
          phone_number_e164: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        }>(
          `SELECT id, workspace_id, provider, display_name, phone_number_e164, is_active, created_at, updated_at
           FROM public.channel_instances
           WHERE workspace_id = $1
           ORDER BY created_at ASC;`,
          [workspaceId]
        );
        return res.rows;
      });

      return reply.status(200).send({
        channels: channels.map((c) => ({
          id: c.id,
          workspaceId: c.workspace_id,
          provider: c.provider,
          displayName: c.display_name,
          phoneNumberE164: c.phone_number_e164,
          isActive: c.is_active,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
        })),
        total: channels.length,
      });
    }
  );

  // 2. Create / Register Channel Instance (for easy local setup or onboarding)
  app.post(
    "/v1/workspaces/:workspaceId/channels",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("workspace:manage"),
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

      const parsedBody = createChannelBodySchema.safeParse(request.body);
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
      const { provider, displayName, phoneNumberE164, endpointToken } = parsedBody.data;

      // Generate a raw endpoint token if not provided, and hash it with SHA-256
      const rawToken = endpointToken ?? crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

      const channel = await withTenantTransaction(workspaceId, async (client) => {
        const res = await client.query<{
          id: string;
          workspace_id: string;
          provider: string;
          display_name: string;
          phone_number_e164: string | null;
          is_active: boolean;
          created_at: string;
        }>(
          `INSERT INTO public.channel_instances (
             workspace_id, provider, display_name, phone_number_e164, endpoint_token_hash, is_active
           ) VALUES ($1, $2, $3, $4, $5, true)
           RETURNING id, workspace_id, provider, display_name, phone_number_e164, is_active, created_at;`,
          [workspaceId, provider, displayName, phoneNumberE164 ?? null, tokenHash]
        );
        return res.rows[0];
      });

      if (!channel) {
        return reply.status(500).send({
          type: "https://sos-sales.mct.br/errors/internal",
          title: "Internal Server Error",
          status: 500,
          detail: "Failed to persist channel instance",
          instance: request.url,
          correlationId: request.id,
        });
      }

      return reply.status(201).send({
        channel: {
          id: channel.id,
          workspaceId: channel.workspace_id,
          provider: channel.provider,
          displayName: channel.display_name,
          phoneNumberE164: channel.phone_number_e164,
          isActive: channel.is_active,
          createdAt: channel.created_at,
          // Return the raw token only once on creation so the webhook URL can be configured
          webhookToken: rawToken,
          webhookUrl: `/v1/webhooks/whatsapp/${rawToken}`,
        },
      });
    }
  );
};
