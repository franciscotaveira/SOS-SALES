import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  CommercialOutcomeConflictError,
  CommercialOutcomeGateway,
  CommercialOutcomeRuleViolationError,
  COMMERCIAL_OUTCOME_RESULTS,
} from '../../../application/ports/commercial-outcome-gateway.js';

export interface CommercialOutcomeRouteDependencies {
  commercialOutcomeGateway?: CommercialOutcomeGateway;
}

const uuid = z.string().uuid();
const paramsSchema = z.object({ workspaceId: uuid, journeyId: uuid });
const idempotencySchema = z.object({ 'idempotency-key': uuid });
const bodySchema = z.object({
  result: z.enum(COMMERCIAL_OUTCOME_RESULTS),
  revenueMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  // Currency is not caller-selectable in v1; all commercial values are BRL.
  currency: z.literal('BRL').optional(),
  reason: z.string().trim().min(3).max(1000).optional(),
});

function actorOrUnauthorized(request: FastifyRequest, reply: FastifyReply) {
  if (!request.operatorActor) {
    reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or missing bearer token' });
    return null;
  }
  return request.operatorActor;
}

function invalid(reply: FastifyReply): FastifyReply {
  return reply.code(422).send({ statusCode: 422, error: 'Unprocessable Entity', message: 'Invalid commercial outcome request' });
}

function notFound(reply: FastifyReply): FastifyReply {
  return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Requested resource was not found' });
}

export async function commercialOutcomeRoutes(
  app: FastifyInstance,
  dependencies: CommercialOutcomeRouteDependencies,
): Promise<void> {
  app.post('/workspaces/:workspaceId/journeys/:journeyId/outcomes', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = paramsSchema.safeParse(request.params);
    const headers = idempotencySchema.safeParse(request.headers);
    const body = bodySchema.safeParse(request.body);
    if (!params.success || !headers.success || !body.success) return invalid(reply);
    if (!dependencies.commercialOutcomeGateway) {
      return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Commercial outcome service is unavailable' });
    }

    try {
      const data = await dependencies.commercialOutcomeGateway.record(actor, {
        workspaceId: params.data.workspaceId,
        journeyId: params.data.journeyId,
        result: body.data.result,
        revenueMinor: body.data.revenueMinor,
        currency: 'BRL',
        ...(body.data.reason ? { reason: body.data.reason } : {}),
        idempotencyKey: headers.data['idempotency-key'],
      });
      return data === null ? notFound(reply) : { data };
    } catch (error) {
      if (error instanceof CommercialOutcomeConflictError) {
        return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'A final outcome has already been recorded' });
      }
      if (error instanceof CommercialOutcomeRuleViolationError) return invalid(reply);
      return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Commercial outcome service is unavailable' });
    }
  });
}
