import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getDatabasePool, getUserWorkspaces } from "@sos-sales/database";
import { logger } from "@sos-sales/observability";

const sessionRequestSchema = z.object({
  email: z.string().email(),
  accessKey: z.string().min(1).optional(),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  /**
   * POST /v1/auth/session
   * Sovereign Login Endpoint.
   * Authenticates operator/owner via registered email and optional master access key,
   * returning signed JWT, profile, and authorized workspace memberships.
   */
  app.post("/v1/auth/session", async (request, reply) => {
    const parseResult = sessionRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        type: "https://sos-sales.mct.br/errors/bad-request",
        title: "Bad Request",
        status: 400,
        detail: "Formato de e-mail inválido ou dados incompletos",
        instance: request.url,
        correlationId: request.id,
      });
    }

    const { email, accessKey } = parseResult.data;
    const normalizedEmail = email.trim().toLowerCase();

    // Verify master key if provided or required
    const configuredMasterKey = (
      process.env.MASTER_ACCESS_KEY ||
      process.env.WAHA_API_KEY ||
      "mothership_master_2026"
    ).trim();

    if (accessKey && accessKey.trim() !== configuredMasterKey) {
      logger.warn(
        { email: normalizedEmail, correlationId: request.id },
        "Sovereign login rejected: invalid master access key"
      );
      return reply.status(401).send({
        type: "https://sos-sales.mct.br/errors/unauthorized",
        title: "Unauthorized",
        status: 401,
        detail: "Chave de acesso soberana inválida",
        instance: request.url,
        correlationId: request.id,
      });
    }

    const pool = getDatabasePool();

    // Discover user by email
    const userRes = await pool.query(
      `SELECT id, email, name FROM users WHERE LOWER(email) = $1 LIMIT 1`,
      [normalizedEmail]
    );

    if (userRes.rows.length === 0) {
      logger.warn(
        { email: normalizedEmail, correlationId: request.id },
        "Sovereign login rejected: user not found"
      );
      return reply.status(401).send({
        type: "https://sos-sales.mct.br/errors/unauthorized",
        title: "Unauthorized",
        status: 401,
        detail: `Nenhum operador ou proprietário cadastrado com o e-mail: ${normalizedEmail}`,
        instance: request.url,
        correlationId: request.id,
      });
    }

    const user = userRes.rows[0];

    // Discover user memberships via SECURITY DEFINER function
    const memberships = await getUserWorkspaces(user.id);

    if (memberships.length === 0) {
      return reply.status(403).send({
        type: "https://sos-sales.mct.br/errors/forbidden",
        title: "Forbidden",
        status: 403,
        detail: "Usuário não possui nenhum workspace atribuído",
        instance: request.url,
        correlationId: request.id,
      });
    }

    const primaryMembership = memberships[0];
    const role = primaryMembership.role;
    const activeWorkspaceId = primaryMembership.workspace_id;

    if (!app.identityProvider?.generateToken) {
      logger.error(
        { correlationId: request.id },
        "Identity provider does not implement generateToken"
      );
      return reply.status(500).send({
        type: "https://sos-sales.mct.br/errors/internal-error",
        title: "Internal Error",
        status: 500,
        detail: "Provedor de identidade não suporta geração de token",
        instance: request.url,
        correlationId: request.id,
      });
    }

    // Generate JWT (valid for 30 days)
    const token = await app.identityProvider.generateToken(
      {
        id: user.id,
        email: user.email,
        role: role,
        workspaceId: activeWorkspaceId,
      },
      30 * 86400
    );

    logger.info(
      { userId: user.id, email: user.email, activeWorkspaceId, correlationId: request.id },
      "Sovereign login session generated successfully"
    );

    return reply.status(200).send({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        activeRole: role,
        activeWorkspaceId,
      },
      workspaces: memberships.map((r) => ({
        id: r.workspace_id,
        name: r.workspace_name,
        role: r.role,
      })),
    });
  });
};
