import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  HandoffOperationsGateway,
  HandoffRuleViolationError,
  HandoffTransitionConflictError,
} from '../../../application/ports/handoff-operations-gateway.js';
import { canonicalUuid } from '../validation.js';

export interface HandoffOperationRouteDependencies {
  handoffOperationsGateway?: HandoffOperationsGateway;
}

const uuid = canonicalUuid;
const paramsSchema = z.object({ workspaceId: uuid, handoffCaseId: uuid });
const idempotencySchema = z.object({ 'idempotency-key': uuid });
const returnSchema = z.object({ reason: z.string().trim().min(3).max(500) });

function actorOrUnauthorized(request: FastifyRequest, reply: FastifyReply) {
  if (!request.operatorActor) {
    reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or missing bearer token' });
    return null;
  }
  return request.operatorActor;
}

function invalid(reply: FastifyReply): FastifyReply {
  return reply.code(422).send({ statusCode: 422, error: 'Unprocessable Entity', message: 'Invalid handoff operation request' });
}

function notFound(reply: FastifyReply): FastifyReply {
  return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Requested resource was not found' });
}

function unavailable(reply: FastifyReply): FastifyReply {
  return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Handoff operation service is unavailable' });
}

async function execute(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: HandoffOperationRouteDependencies,
  operation: 'accept' | 'resolve' | 'return_to_ai',
): Promise<FastifyReply | { data: unknown }> {
  const actor = actorOrUnauthorized(request, reply);
  if (!actor) return reply;
  const params = paramsSchema.safeParse(request.params);
  const headers = idempotencySchema.safeParse(request.headers);
  const body = operation === 'return_to_ai' ? returnSchema.safeParse(request.body) : null;
  if (!params.success || !headers.success || (body !== null && !body.success)) return invalid(reply);
  if (!dependencies.handoffOperationsGateway) return unavailable(reply);

  try {
    const data = await dependencies.handoffOperationsGateway.execute(actor, {
      workspaceId: params.data.workspaceId,
      handoffCaseId: params.data.handoffCaseId,
      operation,
      idempotencyKey: headers.data['idempotency-key'],
      ...(operation === 'return_to_ai' && body?.success ? { reason: body.data.reason } : {}),
    });
    return data === null ? notFound(reply) : { data };
  } catch (error) {
    if (error instanceof HandoffTransitionConflictError) {
      return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'Handoff transition is no longer valid' });
    }
    if (error instanceof HandoffRuleViolationError) {
      return reply.code(422).send({ statusCode: 422, error: 'Unprocessable Entity', message: error.message });
    }
    return unavailable(reply);
  }
}

export async function handoffOperationRoutes(
  app: FastifyInstance,
  dependencies: HandoffOperationRouteDependencies,
): Promise<void> {
  app.post('/workspaces/:workspaceId/handoffs/:handoffCaseId/accept', (request, reply) => execute(request, reply, dependencies, 'accept'));
  app.post('/workspaces/:workspaceId/handoffs/:handoffCaseId/resolve', (request, reply) => execute(request, reply, dependencies, 'resolve'));
  app.post('/workspaces/:workspaceId/handoffs/:handoffCaseId/return-to-ai', (request, reply) => execute(request, reply, dependencies, 'return_to_ai'));
}
