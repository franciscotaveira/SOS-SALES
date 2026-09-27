import type { FastifyPluginAsync } from "fastify";
import { withTenantTransaction } from "@sos-sales/database";
import { z } from "zod";

const updateWorkspaceSchema = z.object({
  name: z.string().min(2).max(100).optional(),
});

export const workspaceRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/workspaces/:workspaceId — view workspace details (requires workspace:view)
  app.get(
    "/v1/workspaces/:workspaceId",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("workspace:view"),
      ],
    },
    async (request, reply) => {
      const workspaceId = request.workspaceId!;

      const workspace = await withTenantTransaction(workspaceId, async (client) => {
        const res = await client.query<{
          id: string;
          name: string;
          slug: string;
          timezone: string;
          currency: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        }>(
          `SELECT id, name, slug, timezone, currency, is_active, created_at, updated_at
           FROM workspaces
           WHERE id = $1`,
          [workspaceId]
        );
        return res.rows[0];
      });

      if (!workspace) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: "Workspace not found",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const activeRole = request.activeRole || "owner";
      const permissions =
        activeRole === "owner" || activeRole === "admin"
          ? [
              "workspace:view",
              "workspace:manage",
              "workspace:invite",
              "cockpit:access",
              "cockpit:send_message",
              "cockpit:handoff",
              "journey:view",
              "journey:transition_stage",
              "outcome:register",
              "integration:view",
              "integration:manage",
              "capi:dispatch",
              "audit:view",
            ]
          : activeRole === "manager"
          ? [
              "workspace:view",
              "workspace:invite",
              "cockpit:access",
              "cockpit:send_message",
              "cockpit:handoff",
              "journey:view",
              "journey:transition_stage",
              "outcome:register",
              "integration:view",
              "audit:view",
            ]
          : activeRole === "operator"
          ? [
              "cockpit:access",
              "cockpit:send_message",
              "cockpit:handoff",
              "journey:view",
              "journey:transition_stage",
              "outcome:register",
            ]
          : ["workspace:view", "journey:view", "integration:view", "audit:view"];

      return reply.status(200).send({
        workspace: {
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          timezone: workspace.timezone,
          currency: workspace.currency,
          isActive: workspace.is_active,
          status: workspace.is_active ? "active" : "inactive",
          createdAt: workspace.created_at,
          updatedAt: workspace.updated_at,
        },
        membership: {
          role: activeRole,
        },
        userRole: activeRole,
        permissions,
      });
    }
  );

  // PATCH /v1/workspaces/:workspaceId — update workspace (requires workspace:manage)
  app.patch(
    "/v1/workspaces/:workspaceId",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("workspace:manage"),
      ],
    },
    async (request, reply) => {
      const workspaceId = request.workspaceId!;
      const parseResult = updateWorkspaceSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: parseResult.error.issues.map((i) => i.message).join(", "),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { name } = parseResult.data;
      if (!name) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "No fields provided to update",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const updated = await withTenantTransaction(workspaceId, async (client) => {
        const res = await client.query<{
          id: string;
          name: string;
          slug: string;
          timezone: string;
          currency: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        }>(
          `UPDATE workspaces
           SET name = $1, updated_at = NOW()
           WHERE id = $2
           RETURNING id, name, slug, timezone, currency, is_active, created_at, updated_at`,
          [name, workspaceId]
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
        workspace: {
          id: updated.id,
          name: updated.name,
          slug: updated.slug,
          timezone: updated.timezone,
          currency: updated.currency,
          isActive: updated.is_active,
          status: updated.is_active ? "active" : "inactive",
          createdAt: updated.created_at,
          updatedAt: updated.updated_at,
        },
      });
    }
  );
};
