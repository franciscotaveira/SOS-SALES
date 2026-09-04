import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  KnownFactIdempotencyConflictError,
  KnownFactOperationsGateway,
  KnownFactRuleViolationError,
} from '../../../application/ports/known-fact-operations-gateway.js';
import { canonicalUuid } from '../validation.js';

export interface KnownFactOperationRouteDependencies {
  knownFactOperationsGateway?: KnownFactOperationsGateway;
}

const uuid = canonicalUuid;
const paramsSchema = z.object({ workspaceId: uuid, journeyId: uuid });
const headersSchema = z.object({ 'idempotency-key': uuid });
const factKey = z.string().trim().regex(/^[a-z][a-z0-9_]{0,31}(\.[a-z][a-z0-9_]{0,63})+$/).max(128);
const jsonValue = z.unknown().refine((value) => {
  if (value === null || value === undefined) return false;
  try {
    const encoded = JSON.stringify(value);
    return typeof encoded === 'string' && Buffer.byteLength(encoded, 'utf8') <= 8192;
  } catch {
    return false;
  }
}, 'must be JSON serializable');
const bodySchema = z.object({
  key: factKey,
  value: jsonValue,
  confidence: z.number().finite().min(0).max(1),
  confirmedByCustomer: z.boolean(),
  evidenceMessageId: uuid.optional(),
  supersedesFactId: uuid.optional(),
}).strict();

function actorOrUnauthorized(request: FastifyRequest, reply: FastifyReply) {
  if (!request.operatorActor) {
    reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or missing bearer token' });
    return null;
  }
  return request.operatorActor;
}

function invalid(reply: FastifyReply): FastifyReply {
  return reply.code(422).send({ statusCode: 422, error: 'Unprocessable Entity', message: 'Invalid known fact request' });
}

function notFound(reply: FastifyReply): FastifyReply {
  return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Requested resource was not found' });
}

export async function knownFactOperationRoutes(
  app: FastifyInstance,
  dependencies: KnownFactOperationRouteDependencies,
): Promise<void> {
  app.post('/workspaces/:workspaceId/journeys/:journeyId/facts', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = paramsSchema.safeParse(request.params);
    const headers = headersSchema.safeParse(request.headers);
    const body = bodySchema.safeParse(request.body);
    if (!params.success || !headers.success || !body.success) return invalid(reply);
    if (!dependencies.knownFactOperationsGateway) {
      return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Known fact service is unavailable' });
    }

    try {
      const data = await dependencies.knownFactOperationsGateway.record(actor, {
        workspaceId: params.data.workspaceId,
        journeyId: params.data.journeyId,
        key: body.data.key,
        value: body.data.value,
        confidence: body.data.confidence,
        confirmedByCustomer: body.data.confirmedByCustomer,
        ...(body.data.evidenceMessageId ? { evidenceMessageId: body.data.evidenceMessageId } : {}),
        ...(body.data.supersedesFactId ? { supersedesFactId: body.data.supersedesFactId } : {}),
        idempotencyKey: headers.data['idempotency-key'],
      });
      return data === null ? notFound(reply) : { data };
    } catch (error) {
      if (error instanceof KnownFactIdempotencyConflictError) {
        return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'The idempotency key was already used for another fact' });
      }
      if (error instanceof KnownFactRuleViolationError) return invalid(reply);
      return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Known fact service is unavailable' });
    }
  });
}
