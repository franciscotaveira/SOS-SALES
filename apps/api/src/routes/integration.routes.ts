/**
 * Chat Sales — Integration Routes (F1.1-B Radar Hardening)
 * 
 * Capabilities:
 * 1. GET   /v1/workspaces/:workspaceId/integrations/candidates  — governed candidate snapshot with stable cursor
 * 2. POST  /v1/workspaces/:workspaceId/integrations/suggestions — semantically idempotent suggestion creation
 * 3. GET   /v1/workspaces/:workspaceId/integrations/suggestions — list suggestions with expiry exclusion
 * 4. GET   /v1/workspaces/:workspaceId/integrations/suggestions/count — active pending count for Cockpit badge
 * 5. PATCH /v1/workspaces/:workspaceId/integrations/suggestions/:suggestionId — transactional decision with origin revalidation
 * 
 * Invariants:
 * - Accepting a suggestion NEVER sends external messages. It only pre-fills the composer draft.
 * - Same key + same payload = 200/201 idempotent replay.
 * - Same key + different payload = 409 Conflict.
 * - Origin state change (new message, closed thread, handoff, opt-out, expiry) persists invalidated/expired and responds 409 Conflict.
 * - Client cannot spoof originSnapshot (strictly derived on server).
 * - Malformed cursor returns 400 with INVALID_CURSOR code.
 */
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { RbacAuthorizationPolicy, type AuthUser, type Permission } from "@sos-sales/auth";
import {
  withTenantTransaction,
  listIntegrationCandidates,
  createIntegrationSuggestion,
  listIntegrationSuggestions,
  decideSuggestion,
  countPendingSuggestions,
  SuggestionIdempotencyConflictError,
  SuggestionDecisionRejectionError,
  InvalidCursorError,
  type SuggestionStatus,
  type SuggestionSource,
} from "@sos-sales/database";
import type { Role } from "@sos-sales/contracts";

const rbacPolicy = new RbacAuthorizationPolicy();

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const suggestionParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  suggestionId: z.string().uuid(),
});

const listCandidatesQuerySchema = z.object({
  minHoursSinceLastMessage: z.coerce.number().min(0).max(8760).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  moduleKey: z.string().max(64).optional(),
});

const listSuggestionsQuerySchema = z.object({
  status: z.enum(["pending", "accepted", "dismissed", "expired", "invalidated"]).optional(),
  threadId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// Strict schema: unknown fields (including spoofed originSnapshot) are rejected with 400 Bad Request
const createSuggestionBodySchema = z.object({
  idempotencyKey: z.string().min(1).max(256),
  source: z.enum(["n8n", "manual", "system"]).optional(),
  threadId: z.string().uuid().optional().nullable(),
  contactId: z.string().uuid().optional().nullable(),
  suggestionType: z.enum(["follow_up", "reengagement", "upsell", "reminder", "custom"]).optional(),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  draftMessage: z.string().max(2000).optional().nullable(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  moduleKey: z.literal("radar_m01").default("radar_m01").optional(),
  ruleVersion: z.string().max(32).default("1.0.0").optional(),
  reasonCode: z.string().max(64).optional(),
  evidence: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
}).strict();

const decideSuggestionBodySchema = z.object({
  status: z.enum(["accepted", "dismissed"]),
  stateVersion: z.number().int().positive(),
}).strict();

/**
 * Inline permission check: returns true if the request's active role
 * has ANY of the provided permissions.
 */
function hasAnyPermission(request: FastifyRequest, ...permissions: Permission[]): boolean {
  const activeRole = (request.activeRole || request.user?.role) as Role | undefined;
  if (!activeRole) return false;

  const userForCheck: AuthUser = {
    id: request.user.id,
    email: request.user.email,
    role: activeRole,
    workspaceId: request.workspaceId || request.user.workspaceId,
  };

  return permissions.some((p) => rbacPolicy.hasPermission(userForCheck, p));
}

function forbidden(reply: FastifyReply, request: FastifyRequest, detail: string) {
  return reply.status(403).send({
    type: "https://chat-sales.mct.br/errors/forbidden",
    title: "Forbidden",
    status: 403,
    detail,
    instance: request.url,
    correlationId: request.id,
  });
}

function badRequest(reply: FastifyReply, request: FastifyRequest, detail: string, code?: string, details?: unknown) {
  return reply.status(400).send({
    type: "https://chat-sales.mct.br/errors/bad-request",
    title: "Bad Request",
    status: 400,
    ...(code ? { code } : {}),
    detail,
    ...(details ? { details } : {}),
    instance: request.url,
    correlationId: request.id,
  });
}

export const integrationRoutes: FastifyPluginAsync = async (app) => {

  // ─────────────────────────────────────────────────────────────────────────
  // 1. GET /v1/workspaces/:workspaceId/integrations/candidates
  //    Permission: integration:candidates:read OR integration:manage
  //    Returns a governed candidate snapshot with stable cursor.
  // ─────────────────────────────────────────────────────────────────────────
  app.get(
    "/v1/workspaces/:workspaceId/integrations/candidates",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
      ],
    },
    async (request, reply) => {
      if (!hasAnyPermission(request, "integration:candidates:read", "integration:manage")) {
        return forbidden(reply, request, "Missing permission: integration:candidates:read");
      }

      const parsedParams = workspaceParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return badRequest(reply, request, "Invalid workspaceId parameter");
      }

      const parsedQuery = listCandidatesQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return badRequest(reply, request, "Invalid query parameters for candidates", undefined, parsedQuery.error.format());
      }

      const { workspaceId } = parsedParams.data;
      const { minHoursSinceLastMessage, limit, cursor, moduleKey } = parsedQuery.data;

      try {
        const result = await withTenantTransaction(workspaceId, async (client) => {
          return listIntegrationCandidates(client, workspaceId, {
            minHoursSinceLastMessage,
            limit,
            cursor,
            moduleKey,
          });
        });

        return reply.status(200).send({
          items: result.items,
          total: result.total,
          nextCursor: result.nextCursor,
        });
      } catch (err: any) {
        if (err instanceof InvalidCursorError || err.code === "INVALID_CURSOR") {
          return badRequest(reply, request, err.message, "INVALID_CURSOR");
        }
        throw err;
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 2. POST /v1/workspaces/:workspaceId/integrations/suggestions
  //    Permission: integration:suggestions:create OR integration:manage
  //    Idempotent: same key + same payload -> 200/201. Same key + different -> 409.
  // ─────────────────────────────────────────────────────────────────────────
  app.post(
    "/v1/workspaces/:workspaceId/integrations/suggestions",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
      ],
    },
    async (request, reply) => {
      if (!hasAnyPermission(request, "integration:suggestions:create", "integration:manage")) {
        return forbidden(reply, request, "Missing permission: integration:suggestions:create");
      }

      const parsedParams = workspaceParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return badRequest(reply, request, "Invalid workspaceId parameter");
      }

      const parseResult = createSuggestionBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return badRequest(reply, request, "Invalid suggestion creation payload", undefined, parseResult.error.format());
      }

      const { workspaceId } = parsedParams.data;
      const data = parseResult.data;

      // Server-derived provenance: integration_service callers are strictly 'n8n'
      const activeRole = (request.activeRole || request.user?.role) as Role | undefined;
      const derivedSource: SuggestionSource = activeRole === "integration_service"
        ? "n8n"
        : (data.source || "system");

      try {
        const { suggestion, created } = await withTenantTransaction(
          workspaceId,
          async (client) => {
            return createIntegrationSuggestion(client, workspaceId, {
              idempotencyKey: data.idempotencyKey,
              source: derivedSource,
              threadId: data.threadId,
              contactId: data.contactId,
              suggestionType: data.suggestionType,
              title: data.title,
              body: data.body,
              draftMessage: data.draftMessage,
              priority: data.priority,
              moduleKey: data.moduleKey,
              ruleVersion: data.ruleVersion,
              reasonCode: data.reasonCode,
              evidence: data.evidence,
              metadata: data.metadata,
              expiresAt: data.expiresAt,
            });
          }
        );

        const statusCode = created ? 201 : 200;
        return reply.status(statusCode).send({
          id: suggestion.id,
          idempotencyKey: suggestion.idempotency_key,
          source: suggestion.source,
          moduleKey: suggestion.module_key,
          ruleVersion: suggestion.rule_version,
          threadId: suggestion.thread_id,
          contactId: suggestion.contact_id,
          suggestionType: suggestion.suggestion_type,
          title: suggestion.title,
          body: suggestion.body,
          draftMessage: suggestion.draft_message,
          priority: suggestion.priority,
          originSnapshot: suggestion.origin_snapshot,
          status: suggestion.status,
          stateVersion: suggestion.state_version,
          expiresAt: suggestion.expires_at?.toISOString() ?? null,
          createdAt: suggestion.created_at.toISOString(),
          created,
        });
      } catch (err: any) {
        if (err instanceof SuggestionIdempotencyConflictError || err.code === "IDEMPOTENCY_CONFLICT") {
          return reply.status(409).send({
            type: "https://chat-sales.mct.br/errors/conflict",
            title: "Idempotency Conflict",
            status: 409,
            code: "IDEMPOTENCY_CONFLICT",
            detail: err.message,
            instance: request.url,
            correlationId: request.id,
          });
        }
        if (err instanceof SuggestionDecisionRejectionError) {
          const statusCode = err.code === "INVALID_SNAPSHOT" ? 400 : 409;
          return reply.status(statusCode).send({
            type: "https://chat-sales.mct.br/errors/conflict",
            title: "Suggestion Rejected",
            status: statusCode,
            code: err.code,
            detail: err.message,
            instance: request.url,
            correlationId: request.id,
          });
        }
        throw err;
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 3. GET /v1/workspaces/:workspaceId/integrations/suggestions
  //    Permission: integration:suggestions:manage OR integration:manage
  //    Lists suggestions with optional status/thread filter. Excludes expired.
  // ─────────────────────────────────────────────────────────────────────────
  app.get(
    "/v1/workspaces/:workspaceId/integrations/suggestions",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
      ],
    },
    async (request, reply) => {
      if (!hasAnyPermission(request, "integration:suggestions:manage", "integration:manage")) {
        return forbidden(reply, request, "Missing permission: integration:suggestions:manage");
      }

      const parsedParams = workspaceParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return badRequest(reply, request, "Invalid workspaceId parameter");
      }

      const parsedQuery = listSuggestionsQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return badRequest(reply, request, "Invalid query parameters for suggestions", undefined, parsedQuery.error.format());
      }

      const { workspaceId } = parsedParams.data;
      const { status, threadId, limit, offset } = parsedQuery.data;

      const result = await withTenantTransaction(workspaceId, async (client) => {
        return listIntegrationSuggestions(client, workspaceId, {
          status: status as SuggestionStatus | undefined,
          threadId,
          limit,
          offset,
        });
      });

      return reply.status(200).send({
        items: result.items.map((s) => ({
          id: s.id,
          idempotencyKey: s.idempotency_key,
          source: s.source,
          moduleKey: s.module_key,
          ruleVersion: s.rule_version,
          threadId: s.thread_id,
          contactId: s.contact_id,
          suggestionType: s.suggestion_type,
          title: s.title,
          body: s.body,
          draftMessage: s.draft_message,
          priority: s.priority,
          metadata: s.metadata,
          originSnapshot: s.origin_snapshot,
          status: s.status,
          stateVersion: s.state_version,
          decidedByUserId: s.decided_by_user_id,
          decidedAt: s.decided_at?.toISOString() ?? null,
          expiresAt: s.expires_at?.toISOString() ?? null,
          createdAt: s.created_at.toISOString(),
          updatedAt: s.updated_at.toISOString(),
        })),
        total: result.total,
      });
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 4. GET /v1/workspaces/:workspaceId/integrations/suggestions/count
  //    Permission: cockpit:access (operators can see the badge)
  //    Returns active, non-expired pending count for Cockpit badge.
  // ─────────────────────────────────────────────────────────────────────────
  app.get(
    "/v1/workspaces/:workspaceId/integrations/suggestions/count",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
      ],
    },
    async (request, reply) => {
      if (!hasAnyPermission(request, "cockpit:access", "integration:suggestions:manage", "integration:manage")) {
        return forbidden(reply, request, "Missing permission for suggestion count");
      }

      const parsedParams = workspaceParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return badRequest(reply, request, "Invalid workspaceId parameter");
      }

      const { workspaceId } = parsedParams.data;

      const count = await withTenantTransaction(workspaceId, async (client) => {
        return countPendingSuggestions(client, workspaceId);
      });

      return reply.status(200).send({ pendingCount: count });
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 5. PATCH /v1/workspaces/:workspaceId/integrations/suggestions/:suggestionId
  //    Permission: integration:suggestions:manage OR integration:manage
  //    Accept or dismiss with transactional origin state revalidation.
  //    INVARIANT: Accepting ONLY pre-fills composer draft, NEVER auto-sends.
  //    PERSISTENCE: If invalidated or expired, commits state and returns 409.
  // ─────────────────────────────────────────────────────────────────────────
  app.patch(
    "/v1/workspaces/:workspaceId/integrations/suggestions/:suggestionId",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
      ],
    },
    async (request, reply) => {
      if (!hasAnyPermission(request, "integration:suggestions:manage", "integration:manage")) {
        return forbidden(reply, request, "Missing permission: integration:suggestions:manage");
      }

      const parsedParams = suggestionParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return badRequest(reply, request, "Invalid workspaceId or suggestionId parameter");
      }

      const parseResult = decideSuggestionBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return badRequest(
          reply, request,
          "Invalid decision payload. Required: { status: 'accepted'|'dismissed', stateVersion: number }",
          undefined,
          parseResult.error.format()
        );
      }

      const { workspaceId, suggestionId } = parsedParams.data;
      const { status, stateVersion } = parseResult.data;

      const decisionResult = await withTenantTransaction(workspaceId, async (client) => {
        return decideSuggestion(client, workspaceId, suggestionId, {
          status,
          decidedByUserId: request.user.id,
          expectedStateVersion: stateVersion,
        });
      });

      if (!decisionResult.ok) {
        const statusCode = decisionResult.code === "SUGGESTION_NOT_FOUND" ? 404 : 409;
        return reply.status(statusCode).send({
          type: "https://chat-sales.mct.br/errors/conflict",
          title: "Decision Conflict",
          status: statusCode,
          code: decisionResult.code,
          detail: decisionResult.reason,
          instance: request.url,
          correlationId: request.id,
        });
      }

      const updated = decisionResult.suggestion;
      return reply.status(200).send({
        id: updated.id,
        status: updated.status,
        stateVersion: updated.state_version,
        decidedByUserId: updated.decided_by_user_id,
        decidedAt: updated.decided_at?.toISOString() ?? null,
        draftMessage: updated.draft_message,
        threadId: updated.thread_id,
        originSnapshot: updated.origin_snapshot,
      });
    }
  );
};
