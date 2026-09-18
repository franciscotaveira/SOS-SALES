import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import {
  JwtIdentityProvider,
  RbacAuthorizationPolicy,
  type AuthUser,
  type Permission,
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
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireWorkspaceContext: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (
      permission: Permission
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const uuidSchema = z.string().uuid();

export interface AuthPluginOptions {
  jwtSecret?: string;
}

const authPluginCallback: FastifyPluginAsync<AuthPluginOptions> = async (app, options) => {
  const jwtProvider = new JwtIdentityProvider(options.jwtSecret || process.env.JWT_SECRET);
  const rbacPolicy = new RbacAuthorizationPolicy();

  // 1. Authenticate Hook: validates token and discovers user memberships
  const authenticate = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return reply.status(401).send({
        type: "https://sos-sales.mct.br/errors/unauthorized",
        title: "Unauthorized",
        status: 401,
        detail: "Missing or invalid Bearer authorization header",
        instance: request.url,
        correlationId: request.id,
      });
    }

    const token = authHeader.slice(7).trim();
    const verifiedUser = await jwtProvider.verifyToken(token);

    if (!verifiedUser) {
      return reply.status(401).send({
        type: "https://sos-sales.mct.br/errors/unauthorized",
        title: "Unauthorized",
        status: 401,
        detail: "Invalid or expired JWT token",
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
      // If no explicit X-Workspace-Id header, default to token's workspace or first membership
      const defaultMembership =
        memberships.find((m) => m.workspace_id === verifiedUser.workspaceId) || memberships[0];

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

  app.decorate("authenticate", authenticate);
  app.decorate("requireWorkspaceContext", requireWorkspaceContext);
  app.decorate("requirePermission", requirePermission);
};

export const authPlugin = fp(authPluginCallback, {
  name: "auth-plugin",
  fastify: "5.x",
});
