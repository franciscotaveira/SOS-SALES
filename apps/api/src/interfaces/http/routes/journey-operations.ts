import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  JourneyOperationRuleViolationError,
  JourneyOperationsGateway,
  PIPELINE_STAGES,
} from '../../../application/ports/journey-operations-gateway.js';
import { canonicalUuid } from '../validation.js';

export interface JourneyOperationRouteDependencies {
  journeyOperationsGateway?: JourneyOperationsGateway;
}

const uuid = canonicalUuid;
const paramsSchema = z.object({ workspaceId: uuid, journeyId: uuid });
const idempotencySchema = z.object({ 'idempotency-key': uuid });
const stageSchema = z.object({
  stage: z.enum(PIPELINE_STAGES),
  reason: z.string().trim().min(3).max(1000).optional(),
});
const followUpSchema = z.object({
  dueAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(3).max(1000),
});

function actorOrUnauthorized(request: FastifyRequest, reply: FastifyReply) {
  if (!request.operatorActor) {
    reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or missing bearer token' });
    return null;
  }
  return request.operatorActor;
}

function invalid(reply: FastifyReply): FastifyReply {
  return reply.code(422).send({ statusCode: 422, error: 'Unprocessable Entity', message: 'Invalid journey operation request' });
}

function notFound(reply: FastifyReply): FastifyReply {
  return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Requested resource was not found' });
}

function unavailable(reply: FastifyReply): FastifyReply {
  return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Journey operation service is unavailable' });
}

export async function journeyOperationRoutes(
  app: FastifyInstance,
  dependencies: JourneyOperationRouteDependencies,
): Promise<void> {
  app.patch('/workspaces/:workspaceId/journeys/:journeyId/stage', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = paramsSchema.safeParse(request.params);
    const headers = idempotencySchema.safeParse(request.headers);
    const body = stageSchema.safeParse(request.body);
    if (!params.success || !headers.success || !body.success) return invalid(reply);
    if (!dependencies.journeyOperationsGateway) return unavailable(reply);

    try {
      const data = await dependencies.journeyOperationsGateway.setStage(actor, {
        workspaceId: params.data.workspaceId,
        journeyId: params.data.journeyId,
        stage: body.data.stage,
        ...(body.data.reason ? { reason: body.data.reason } : {}),
        idempotencyKey: headers.data['idempotency-key'],
      });
      return data === null ? notFound(reply) : { data };
    } catch (error) {
      if (error instanceof JourneyOperationRuleViolationError) return invalid(reply);
      return unavailable(reply);
    }
  });

  app.post('/workspaces/:workspaceId/journeys/:journeyId/follow-ups', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = paramsSchema.safeParse(request.params);
    const headers = idempotencySchema.safeParse(request.headers);
    const body = followUpSchema.safeParse(request.body);
    if (!params.success || !headers.success || !body.success) return invalid(reply);
    if (!dependencies.journeyOperationsGateway) return unavailable(reply);

    try {
      const data = await dependencies.journeyOperationsGateway.createFollowUp(actor, {
        workspaceId: params.data.workspaceId,
        journeyId: params.data.journeyId,
        dueAt: body.data.dueAt,
        reason: body.data.reason,
        idempotencyKey: headers.data['idempotency-key'],
      });
      return data === null ? notFound(reply) : { data };
    } catch (error) {
      if (error instanceof JourneyOperationRuleViolationError) return invalid(reply);
      return unavailable(reply);
    }
  });
}
