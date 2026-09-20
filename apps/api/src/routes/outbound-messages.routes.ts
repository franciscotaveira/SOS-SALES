import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  PublicOutboundRequestSchema,
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

export interface OutboundMessagesRoutesOptions {
  producerService?: ITransactionalOutboundProducerService;
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

      // 3. Assemble TrustedOutboundContext from authenticated session and validated route
      const context: TrustedOutboundContext = {
        workspaceId: request.workspaceId!,
        channelInstanceId: parsedParams.data.channelInstanceId,
        actorId: request.user.id,
        role: (request.activeRole || "operator") as any,
        permissions: [],
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      };

      // 4. Invoke Transactional Producer Service
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
