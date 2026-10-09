import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import {
  createIdentityProvider,
  JwtIdentityProvider,
  SupabaseJwksIdentityProvider,
  RbacAuthorizationPolicy,
  type AuthUser,
  type Permission,
  type IIdentityProvider,
  type IdentityProviderConfig,
  type TokenVerificationResult,
} from "@sos-sales/auth";
import {
  getUserWorkspaces,
  recordSecurityAuditEvent,
  type UserWorkspaceMembership,
} from "@sos-sales/database";
import type { Role } from "@sos-sales/contracts";
import { z } from "zod";

declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser;
    memberships: UserWorkspaceMembership[];
    workspaceId?: string;
    activeRole?: Role;
  }

  interface FastifyInstance {
    identityProvider: IIdentityProvider;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireWorkspaceContext: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (
      permission: Permission
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const uuidSchema = z.string().uuid();

export interface AuthPluginOptions {
  providerType?: "local-jwt" | "supabase-jwks";
  identityProvider?: IIdentityProvider;
  identityProviderConfig?: IdentityProviderConfig;
  jwtSecret?: string;
  issuer?: string;
  audience?: string;
  supabaseUrl?: string;
  jwksUri?: string;
}

const authPluginCallback: FastifyPluginAsync<AuthPluginOptions> = async (app, options) => {
  let identityProvider: IIdentityProvider;

  if (options.identityProvider) {
    identityProvider = options.identityProvider;
  } else if (options.identityProviderConfig) {
    identityProvider = createIdentityProvider(options.identityProviderConfig);
  } else {
    // Explicit provider selection: AUTH_PROVIDER is mandatory
    const providerType = (
      options.providerType ??
      process.env.AUTH_PROVIDER ??
      ""
    ).trim().toLowerCase();

    if (providerType === "local-jwt") {
      const secret = (options.jwtSecret ?? process.env.JWT_SECRET ?? "").trim();
      const issuer = (options.issuer ?? process.env.AUTH_ISSUER ?? "").trim();
      const audience = (options.audience ?? process.env.AUTH_AUDIENCE ?? "").trim();

      if (!secret || secret.length < 32) {
        throw new Error(
          "FATAL: In 'local-jwt' mode, JWT_SECRET must be explicitly provided and be at least 32 characters long."
        );
      }
      if (!issuer) {
        throw new Error(
          "FATAL: In 'local-jwt' mode, AUTH_ISSUER must be explicitly provided and non-empty."
        );
      }
      if (!audience) {
        throw new Error(
          "FATAL: In 'local-jwt' mode, AUTH_AUDIENCE must be explicitly provided and non-empty."
        );
      }

      identityProvider = new JwtIdentityProvider({
        type: "local-jwt",
        secret,
        issuer,
        audience,
      });
    } else if (providerType === "supabase-jwks") {
      const supabaseUrl = (options.supabaseUrl ?? process.env.SUPABASE_URL ?? "").trim();
      let jwksUri = (options.jwksUri ?? process.env.SUPABASE_JWKS_URI ?? "").trim();
      let issuer = (options.issuer ?? process.env.AUTH_ISSUER ?? "").trim();
      const audience = (
        options.audience ??
        process.env.AUTH_AUDIENCE ??
        "authenticated"
      ).trim();

      if (!supabaseUrl && !jwksUri) {
        throw new Error(
          "FATAL: In 'supabase-jwks' mode, SUPABASE_URL or SUPABASE_JWKS_URI must be provided."
        );
      }

      if (supabaseUrl) {
        try {
          const parsed = new URL(supabaseUrl);
          if (!jwksUri) {
            jwksUri = `${parsed.origin}/auth/v1/.well-known/jwks.json`;
          }
          if (!issuer) {
            issuer = `${parsed.origin}/auth/v1`;
          }
        } catch {
          throw new Error("FATAL: SUPABASE_URL is not a valid URL.");
        }
      }

      if (!jwksUri) {
        throw new Error("FATAL: Could not resolve a valid jwksUri for 'supabase-jwks' mode.");
      }
      if (!issuer) {
        throw new Error("FATAL: Could not resolve a valid issuer for 'supabase-jwks' mode.");
      }

      identityProvider = new SupabaseJwksIdentityProvider({
        type: "supabase-jwks",
        jwksUri,
        issuer,
        audience,
      });
    } else {
      throw new Error(
        `FATAL: AUTH_PROVIDER must be explicitly configured as 'local-jwt' or 'supabase-jwks'. Received: '${providerType || "<empty>"}'. System startup aborted to prevent ambiguous security.`
      );
    }
  }

  const rbacPolicy = new RbacAuthorizationPolicy();

  // 1. Authenticate Hook: validates token and discovers user memberships
  const authenticate = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const authHeader = request.headers.authorization;
    const queryToken = (request.query as Record<string, string> | undefined)?.token;
    let token: string | null = null;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7).trim();
    } else if (queryToken && typeof queryToken === "string") {
      token = queryToken.trim();
    }

    if (!token) {
      return reply.status(401).send({
        type: "https://sos-sales.mct.br/errors/unauthorized",
        title: "Unauthorized",
        status: 401,
        detail: "Missing or invalid Bearer authorization header",
        instance: request.url,
        correlationId: request.id,
      });
    }

    // Validate token with detailed error differentiation (AC10)
    let verification: TokenVerificationResult;
    if (typeof identityProvider.verifyTokenDetailed === "function") {
      verification = await identityProvider.verifyTokenDetailed(token);
    } else {
      const user = await identityProvider.verifyToken(token);
      verification = user
        ? { status: "valid", user }
        : { status: "invalid", reason: "Token verification returned null" };
    }

    if (verification.status === "provider_unavailable") {
      return reply.status(503).send({
        type: "https://sos-sales.mct.br/errors/service-unavailable",
        title: "Service Unavailable",
        status: 503,
        detail: "Authentication provider is temporarily unreachable",
        instance: request.url,
        correlationId: request.id,
      });
    }

    if (verification.status === "invalid" || !verification.user) {
      return reply.status(401).send({
        type: "https://sos-sales.mct.br/errors/unauthorized",
        title: "Unauthorized",
        status: 401,
        detail: "Invalid, untrusted or expired JWT token",
        instance: request.url,
        correlationId: request.id,
      });
    }

    const verifiedUser = verification.user;

    // Strict validation: subject claim MUST be a valid UUID before database query
    if (!uuidSchema.safeParse(verifiedUser.id).success) {
      return reply.status(401).send({
        type: "https://sos-sales.mct.br/errors/unauthorized",
        title: "Unauthorized",
        status: 401,
        detail: "User identity subject claim is not a valid UUID",
        instance: request.url,
        correlationId: request.id,
      });
    }

    // Load authentic user memberships via SECURITY DEFINER database query
    const memberships = await getUserWorkspaces(verifiedUser.id);
    request.user = verifiedUser;
    request.memberships = memberships;

    // Check if client specified X-Workspace-Id header
    const rawWorkspaceHeader = request.headers["x-workspace-id"];
    if (rawWorkspaceHeader && typeof rawWorkspaceHeader === "string") {
      const targetWorkspaceId = rawWorkspaceHeader.trim();
      const isUuid = uuidSchema.safeParse(targetWorkspaceId).success;

      if (!isUuid) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "X-Workspace-Id header must be a valid UUID",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const membership = memberships.find((m) => m.workspace_id === targetWorkspaceId);

      if (!membership) {
        // SECURITY EVENT: Client attempted cross-tenant access to unauthorized workspace
        try {
          await recordSecurityAuditEvent({
            workspaceId: targetWorkspaceId,
            actorId: verifiedUser.id,
            actorType: "user",
            action: "security.cross_tenant_access_denied",
            resourceType: "workspace",
            resourceId: targetWorkspaceId,
            metadata: {
              url: request.url,
              method: request.method,
              attemptedWorkspaceId: targetWorkspaceId,
              userWorkspaces: memberships.map((m) => m.workspace_id),
              correlationId: request.id,
            },
            ipAddress: request.ip,
            userAgent: request.headers["user-agent"],
          });
        } catch (auditErr) {
          request.log.error(
            { err: auditErr, targetWorkspaceId, userId: verifiedUser.id },
            "Failed to log security audit event for denied tenant access"
          );
        }

        return reply.status(403).send({
          type: "https://sos-sales.mct.br/errors/forbidden",
          title: "Forbidden",
          status: 403,
          detail: "User is not a member of the requested workspace",
          instance: request.url,
          correlationId: request.id,
        });
      }

      request.workspaceId = membership.workspace_id;
      request.activeRole = membership.role as Role;
    } else {
      // If no explicit X-Workspace-Id header, default to token's workspace or deterministic first membership
      const defaultMembership =
        memberships.find((m) => m.workspace_id === verifiedUser.workspaceId) ||
        [...memberships].sort(
          (a, b) =>
            a.workspace_name.localeCompare(b.workspace_name) ||
            a.workspace_id.localeCompare(b.workspace_id)
        )[0];

      if (defaultMembership) {
        request.workspaceId = defaultMembership.workspace_id;
        request.activeRole = defaultMembership.role as Role;
      }
    }
  };

  // 2. Require Workspace Context Hook: ensures route has an active authorized workspace
  const requireWorkspaceContext = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const params = request.params as { workspaceId?: string } | undefined;
    const routeWorkspaceId = params?.workspaceId;

    if (routeWorkspaceId) {
      const isUuid = uuidSchema.safeParse(routeWorkspaceId).success;
      if (!isUuid) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Route parameter workspaceId must be a valid UUID",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const membership = request.memberships.find((m) => m.workspace_id === routeWorkspaceId);
      if (!membership) {
        try {
          await recordSecurityAuditEvent({
            workspaceId: routeWorkspaceId,
            actorId: request.user.id,
            actorType: "user",
            action: "security.cross_tenant_access_denied",
            resourceType: "workspace",
            resourceId: routeWorkspaceId,
            metadata: {
              url: request.url,
              method: request.method,
              routeWorkspaceId,
              correlationId: request.id,
            },
            ipAddress: request.ip,
            userAgent: request.headers["user-agent"],
          });
        } catch (auditErr) {
          request.log.error(
            { err: auditErr, routeWorkspaceId, userId: request.user.id },
            "Failed to log security audit event for denied workspace route"
          );
        }

        return reply.status(403).send({
          type: "https://sos-sales.mct.br/errors/forbidden",
          title: "Forbidden",
          status: 403,
          detail: "Access denied to target workspace",
          instance: request.url,
          correlationId: request.id,
        });
      }

      request.workspaceId = membership.workspace_id;
      request.activeRole = membership.role as Role;
    }

    if (!request.workspaceId) {
      return reply.status(400).send({
        type: "https://sos-sales.mct.br/errors/bad-request",
        title: "Bad Request",
        status: 400,
        detail: "Active workspace context is required for this operation",
        instance: request.url,
        correlationId: request.id,
      });
    }
  };

  // 3. Require Permission Hook: evaluates active role against RBAC policy
  const requirePermission = (permission: Permission) => {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const activeRole = request.activeRole || request.user?.role;
      if (!activeRole) {
        return reply.status(403).send({
          type: "https://sos-sales.mct.br/errors/forbidden",
          title: "Forbidden",
          status: 403,
          detail: "No active role determined for permission evaluation",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const userForCheck: AuthUser = {
        id: request.user.id,
        email: request.user.email,
        role: activeRole,
        workspaceId: request.workspaceId || request.user.workspaceId,
      };

      const hasPermission = rbacPolicy.hasPermission(userForCheck, permission);
      if (!hasPermission) {
        return reply.status(403).send({
          type: "https://sos-sales.mct.br/errors/forbidden",
          title: "Forbidden",
          status: 403,
          detail: `Role '${activeRole}' does not possess required permission '${permission}'`,
          instance: request.url,
          correlationId: request.id,
        });
      }
    };
  };

  app.decorate("identityProvider", identityProvider);
  app.decorate("authenticate", authenticate);
  app.decorate("requireWorkspaceContext", requireWorkspaceContext);
  app.decorate("requirePermission", requirePermission);
};

export const authPlugin = fp(authPluginCallback, {
  name: "auth-plugin",
  fastify: "5.x",
});
