import type { FastifyPluginAsync } from "fastify";

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/v1/me",
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const user = request.user;
      const memberships = request.memberships || [];

      return reply.status(200).send({
        user: {
          id: user.id,
          email: user.email,
          activeRole: request.activeRole || user.role,
          activeWorkspaceId: request.workspaceId || null,
        },
        workspaces: memberships.map((m) => ({
          id: m.workspace_id,
          name: m.workspace_name,
          role: m.role,
        })),
      });
    }
  );
};
