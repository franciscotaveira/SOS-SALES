import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  PublicOutboundRequestSchema,
  TrustedOutboundContextSchema,
  type TrustedOutboundContext,
} from "@sos-sales/contracts";
import {
  TransactionalOutboundProducerService,
  type ITransactionalOutboundProducerService,
  ChannelInstanceNotFoundError,
  ChannelInstanceInactiveError,
  IdempotencyConflictError,
  LegacyIdempotencyRecordError,
  OutboundProducerValidationError,
} from "@sos-sales/application";
import type { IRateLimiter } from "../services/redis-rate-limiter";

export interface OutboundMessagesRoutesOptions {
  producerService?: ITransactionalOutboundProducerService;
  rateLimiter?: IRateLimiter;
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
}

const paramsSchema = z.object({
  workspaceId: z.string().uuid(),
  channelInstanceId: z.string().uuid(),
});

export const outboundMessagesRoutes: FastifyPluginAsync<OutboundMessagesRoutesOptions> = async (
  app,
  options
) => {
  const producerService =
    options.producerService ?? new TransactionalOutboundProducerService();
  const rateLimiter = options.rateLimiter;

  app.post(
    "/v1/workspaces/:workspaceId/channels/:channelInstanceId/messages",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("cockpit:send_message"),
      ],
    },
    async (request, reply) => {
      // 1. Validate route params
      const parsedParams = paramsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid URL route parameters",
          instance: request.url,
          correlationId: request.id,
        });
      }

      // 2. Validate request body with strict schema (rejection of injected authority fields)
      const parsedBody = PublicOutboundRequestSchema.safeParse(request.body);
      if (!parsedBody.success) {
        const issues = parsedBody.error.issues
          .map((i) => i.message || i.path.join("."))
          .join("; ");
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: `Request body validation failed: ${issues}`,
          instance: request.url,
          correlationId: request.id,
        });
      }

      // 3. Fail-closed identity verification: activeRole must be present without fallback
      if (!request.activeRole) {
        return reply.status(403).send({
          type: "https://sos-sales.mct.br/errors/forbidden",
          title: "Forbidden",
          status: 403,
          detail: "Active workspace role is required",
          instance: request.url,
          correlationId: request.id,
        });
      }

      // 4. Assemble and validate TrustedOutboundContext via schema
      const parsedContext = TrustedOutboundContextSchema.safeParse({
        workspaceId: request.workspaceId,
        channelInstanceId: parsedParams.data.channelInstanceId,
        actorId: request.user.id,
        role: request.activeRole,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });

      if (!parsedContext.success) {
        return reply.status(403).send({
          type: "https://sos-sales.mct.br/errors/forbidden",
          title: "Forbidden",
          status: 403,
          detail: "Invalid or unauthorized outbound execution context",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const context: TrustedOutboundContext = parsedContext.data;

      // 5. Distributed rate limiting before invoking producer service
      if (rateLimiter) {
        const clientIp = request.ip || "127.0.0.1";

        // Tier 1: Per-IP rate limit check
        const ipCheck = rateLimiter.checkOutboundIpLimit
          ? await rateLimiter.checkOutboundIpLimit(clientIp)
          : rateLimiter.checkIpLimit
          ? await rateLimiter.checkIpLimit(`outbound:ip:${clientIp}`)
          : {
              allowed: await rateLimiter.isIpAllowed(`outbound:ip:${clientIp}`),
              remaining: 0,
              resetMs: options.rateLimitWindowMs ?? 60_000,
              limit: options.rateLimitMax ?? 100,
            };

        if (!ipCheck.allowed) {
          reply.header("Retry-After", Math.max(1, Math.ceil(ipCheck.resetMs / 1000)));
          reply.header("X-RateLimit-Limit", ipCheck.limit);
          reply.header("X-RateLimit-Remaining", 0);
          return reply.status(429).send({
            type: "https://sos-sales.mct.br/errors/too-many-requests",
            title: "Too Many Requests",
            status: 429,
            detail: "Rate limit exceeded for client IP",
            instance: request.url,
            correlationId: request.id,
          });
        }

        // Tier 2: Per-composite key (workspaceId + actorId + channelInstanceId) rate limit check
        const tenantParams = {
          workspaceId: context.workspaceId,
          actorId: context.actorId,
          channelInstanceId: context.channelInstanceId,
        };
        const tenantKey = `outbound:${context.workspaceId}:${context.actorId}:${context.channelInstanceId}`;
        const tenantCheck = rateLimiter.checkOutboundTenantLimit
          ? await rateLimiter.checkOutboundTenantLimit(tenantParams)
          : rateLimiter.checkChannelLimit
          ? await rateLimiter.checkChannelLimit(tenantKey)
          : {
              allowed: await rateLimiter.isChannelAllowed(tenantKey),
              remaining: 0,
              resetMs: options.rateLimitWindowMs ?? 60_000,
              limit: (options.rateLimitMax ?? 100) * 3,
            };

        if (!tenantCheck.allowed) {
          reply.header("Retry-After", Math.max(1, Math.ceil(tenantCheck.resetMs / 1000)));
          reply.header("X-RateLimit-Limit", tenantCheck.limit);
          reply.header("X-RateLimit-Remaining", 0);
          return reply.status(429).send({
            type: "https://sos-sales.mct.br/errors/too-many-requests",
            title: "Too Many Requests",
            status: 429,
            detail: "Rate limit exceeded for actor and channel in workspace",
            instance: request.url,
            correlationId: request.id,
          });
        }

        reply.header("X-RateLimit-Limit", tenantCheck.limit);
        reply.header("X-RateLimit-Remaining", Math.min(ipCheck.remaining, tenantCheck.remaining));
      }

      // 6. Invoke Transactional Producer Service
      try {
        const result = await producerService.produce(parsedBody.data, context);

        const httpStatus = result.isIdempotentReplay ? 200 : 201;
        return reply.status(httpStatus).send(result);
      } catch (err: any) {
        const errCode = err?.code;
        const errName = err?.name;

        if (
          err instanceof ChannelInstanceNotFoundError ||
          errCode === "CHANNEL_INSTANCE_NOT_FOUND" ||
          errName === "ChannelInstanceNotFoundError"
        ) {
          return reply.status(404).send({
            type: "https://sos-sales.mct.br/errors/not-found",
            title: "Not Found",
            status: 404,
            detail: err.message,
            instance: request.url,
            correlationId: request.id,
          });
        }

        if (
          err instanceof ChannelInstanceInactiveError ||
          errCode === "CHANNEL_INSTANCE_INACTIVE" ||
          errName === "ChannelInstanceInactiveError"
        ) {
          return reply.status(422).send({
            type: "https://sos-sales.mct.br/errors/unprocessable-entity",
            title: "Unprocessable Entity",
            status: 422,
            detail: err.message,
            instance: request.url,
            correlationId: request.id,
          });
        }

        if (
          err instanceof IdempotencyConflictError ||
          err instanceof LegacyIdempotencyRecordError ||
          errCode === "IDEMPOTENCY_CONFLICT" ||
          errCode === "LEGACY_IDEMPOTENCY_RECORD" ||
          errName === "IdempotencyConflictError" ||
          errName === "LegacyIdempotencyRecordError"
        ) {
          return reply.status(409).send({
            type: "https://sos-sales.mct.br/errors/conflict",
            title: "Conflict",
            status: 409,
            detail: err.message,
            instance: request.url,
            correlationId: request.id,
          });
        }

        if (
          err instanceof OutboundProducerValidationError ||
          errCode === "OUTBOUND_PRODUCER_VALIDATION_ERROR" ||
          errName === "OutboundProducerValidationError"
        ) {
          return reply.status(400).send({
            type: "https://sos-sales.mct.br/errors/bad-request",
            title: "Bad Request",
            status: 400,
            detail: err.message,
            instance: request.url,
            correlationId: request.id,
          });
        }

        // Forward to global Fastify RFC 9457 error handler
        throw err;
      }

    }
  );
};
