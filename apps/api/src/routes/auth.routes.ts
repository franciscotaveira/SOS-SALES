import type { FastifyPluginAsync } from "fastify";
import crypto from "node:crypto";
import { z } from "zod";
import type { Role } from "@sos-sales/contracts";
import { getDatabasePool, getUserWorkspaces } from "@sos-sales/database";
import { logger } from "@sos-sales/observability";

const sessionRequestSchema = z.object({
  email: z.string().email(),
  accessKey: z.string().min(1),
  workspaceId: z.string().uuid().optional(),
});

/** Short token TTL for laboratory sessions (15 minutes = 900 seconds) */
const LAB_TOKEN_TTL_SECONDS = 900;

export const authRoutes: FastifyPluginAsync = async (app) => {
  /**
   * POST /v1/auth/session
   * Laboratory Session Generator Endpoint.
   * STRICTLY RESTRICTED to laboratory / test environments with explicit enablement.
   * Commercial production must use individual identity verified via Supabase Auth JWKS.
   */
  app.post("/v1/auth/session", async (request, reply) => {
    // 1. Fail-closed: Reject if laboratory authentication is not explicitly enabled
    const isLabAuthEnabled =
      process.env.ENABLE_LAB_AUTH === "true" ||
      (process.env.NODE_ENV === "test" &&
        Boolean(process.env.LAB_MASTER_ACCESS_KEY || process.env.MASTER_ACCESS_KEY));

    if (!isLabAuthEnabled) {
      logger.warn(
        { correlationId: request.id },
        "Lab session login rejected: laboratory authentication disabled in commercial environment"
      );
      return reply.status(403).send({
        type: "https://sos-sales.mct.br/errors/forbidden",
        title: "Forbidden",
        status: 403,
        detail: "Autenticação via chave de laboratório desabilitada neste ambiente",
        instance: request.url,
        correlationId: request.id,
      });
    }

    // 2. Validate request body (email and accessKey are strictly required)
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

    const { email, accessKey, workspaceId: requestedWorkspaceId } = parseResult.data;
    const normalizedEmail = email.trim().toLowerCase();

    // 3. Fail-closed: configured master key must be explicitly set without fallbacks to WAHA or defaults
    const configuredMasterKey = (
      process.env.LAB_MASTER_ACCESS_KEY ||
      process.env.MASTER_ACCESS_KEY ||
      ""
    ).trim();

    if (!configuredMasterKey) {
      logger.error(
        { correlationId: request.id },
        "Lab login rejected: master access key is not configured in server environment"
      );
      return reply.status(500).send({
        type: "https://sos-sales.mct.br/errors/internal-error",
        title: "Internal Error",
        status: 500,
        detail: "Serviço de autenticação temporariamente indisponível",
        instance: request.url,
        correlationId: request.id,
      });
    }

    // 4. Timing-safe comparison of master access key
    const accessKeyBuffer = Buffer.from(accessKey.trim());
    const configuredKeyBuffer = Buffer.from(configuredMasterKey);
    const isKeyValid =
      accessKeyBuffer.length === configuredKeyBuffer.length &&
      crypto.timingSafeEqual(accessKeyBuffer, configuredKeyBuffer);

    // Standard generic unauthorized response (prevent user/email enumeration)
    const sendGenericUnauthorized = () => {
      logger.warn(
        { correlationId: request.id },
        "Lab login rejected: invalid credentials"
      );
      return reply.status(401).send({
        type: "https://sos-sales.mct.br/errors/unauthorized",
        title: "Unauthorized",
        status: 401,
        detail: "Credenciais de acesso inválidas",
        instance: request.url,
        correlationId: request.id,
      });
    };

    if (!isKeyValid) {
      return sendGenericUnauthorized();
    }

    const pool = getDatabasePool();

    // 5. Discover user by email
    const userRes = await pool.query(
      `SELECT id, email, name FROM users WHERE LOWER(email) = $1 LIMIT 1`,
      [normalizedEmail]
    );

    if (userRes.rows.length === 0) {
      // Identical 401 generic message: NO email echoing or existence disclosure!
      return sendGenericUnauthorized();
    }

    const user = userRes.rows[0];

    // 6. Discover user memberships via SECURITY DEFINER function
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

    // 7. Deterministic membership selection (respects multi-workspace users)
    let selectedMembership: (typeof memberships)[0] | undefined;

    if (requestedWorkspaceId) {
      selectedMembership = memberships.find((m) => m.workspace_id === requestedWorkspaceId);
      if (!selectedMembership) {
        return reply.status(403).send({
          type: "https://sos-sales.mct.br/errors/forbidden",
          title: "Forbidden",
          status: 403,
          detail: "Usuário não possui acesso ao workspace solicitado",
          instance: request.url,
          correlationId: request.id,
        });
      }
    } else {
      // Deterministic sort: by workspace_name ASC, then workspace_id ASC
      const sorted = [...memberships].sort(
        (a, b) =>
          a.workspace_name.localeCompare(b.workspace_name) ||
          a.workspace_id.localeCompare(b.workspace_id)
      );
      selectedMembership = sorted[0];
    }

    if (!selectedMembership) {
      return reply.status(403).send({
        type: "https://sos-sales.mct.br/errors/forbidden",
        title: "Forbidden",
        status: 403,
        detail: "Usuário não possui nenhum workspace atribuído",
        instance: request.url,
        correlationId: request.id,
      });
    }

    const role = selectedMembership.role as Role;
    const activeWorkspaceId = selectedMembership.workspace_id;

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

    // 8. Generate JWT with strictly short TTL (15 minutes)
    const token = await app.identityProvider.generateToken(
      {
        id: user.id,
        email: user.email,
        role: role,
        workspaceId: activeWorkspaceId,
      },
      LAB_TOKEN_TTL_SECONDS
    );

    logger.info(
      { userId: user.id, activeWorkspaceId, correlationId: request.id },
      "Lab login session generated successfully with short TTL"
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
