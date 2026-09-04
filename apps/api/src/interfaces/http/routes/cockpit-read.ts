import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CockpitReadGateway } from '../../../application/ports/cockpit-read-gateway.js';
import { canonicalUuid } from '../validation.js';

export interface CockpitReadRouteDependencies {
  cockpitReadGateway?: CockpitReadGateway;
}

const uuid = canonicalUuid;
const boundedQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(512).nullable().optional().transform((value) => value ?? null),
});
const messageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(512).nullable().optional().transform((value) => value ?? null),
});
const cockpitQuery = z.object({
  messageLimit: z.coerce.number().int().min(1).max(50).default(50),
});

function validationError(reply: FastifyReply): FastifyReply {
  return reply.code(400).send({
    statusCode: 400,
    error: 'Bad Request',
    message: 'Invalid request parameters',
  });
}

function validCursor(cursor: string | null): boolean {
  if (!cursor) return true;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { at?: unknown; id?: unknown };
    return typeof decoded.at === 'string' && !Number.isNaN(Date.parse(decoded.at)) && uuid.safeParse(decoded.id).success;
  } catch {
    return false;
  }
}

function unavailable(reply: FastifyReply): FastifyReply {
  return reply.code(503).send({
    statusCode: 503,
    error: 'Service Unavailable',
    message: 'Cockpit read service is unavailable',
  });
}

function notFound(reply: FastifyReply): FastifyReply {
  // Deliberately identical for absent and cross-tenant resources.
  return reply.code(404).send({
    statusCode: 404,
    error: 'Not Found',
    message: 'Requested resource was not found',
  });
}

function actorOrUnauthorized(request: FastifyRequest, reply: FastifyReply) {
  if (!request.operatorActor) {
    reply.code(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid or missing bearer token',
    });
    return null;
  }
  return request.operatorActor;
}

export async function cockpitReadRoutes(
  app: FastifyInstance,
  dependencies: CockpitReadRouteDependencies,
): Promise<void> {
  app.get('/workspaces/:workspaceId/priorities', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = z.object({ workspaceId: uuid }).safeParse(request.params);
    const query = boundedQuery.safeParse(request.query);
    if (!params.success || !query.success || !validCursor(query.data?.cursor ?? null)) return validationError(reply);
    if (!dependencies.cockpitReadGateway) return unavailable(reply);
    try {
      const data = await dependencies.cockpitReadGateway.listPriorities(actor, params.data.workspaceId, query.data.limit);
      return data === null ? notFound(reply) : { data };
    } catch {
      return unavailable(reply);
    }
  });

  app.get('/workspaces/:workspaceId/journeys', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = z.object({ workspaceId: uuid }).safeParse(request.params);
    const query = boundedQuery.safeParse(request.query);
    if (!params.success || !query.success || !validCursor(query.data?.cursor ?? null)) return validationError(reply);
    if (!dependencies.cockpitReadGateway) return unavailable(reply);
    try {
      const page = await dependencies.cockpitReadGateway.listJourneys(actor, params.data.workspaceId, query.data);
      return page === null ? notFound(reply) : {
        data: page.items,
        meta: { nextCursor: page.nextCursor },
      };
    } catch {
      return unavailable(reply);
    }
  });

  app.get('/journeys/:journeyId/messages', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = z.object({ journeyId: uuid }).safeParse(request.params);
    const query = messageQuery.safeParse(request.query);
    if (!params.success || !query.success || !validCursor(query.data?.cursor ?? null)) return validationError(reply);
    if (!dependencies.cockpitReadGateway) return unavailable(reply);
    try {
      const page = await dependencies.cockpitReadGateway.listMessages(actor, params.data.journeyId, query.data);
      return page === null ? notFound(reply) : {
        data: page.items,
        meta: { nextCursor: page.nextCursor },
      };
    } catch {
      // Cursor/database details are intentionally never exposed to operators.
      return unavailable(reply);
    }
  });

  app.get('/workspaces/:workspaceId/journeys/:journeyId/cockpit', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const params = z.object({ workspaceId: uuid, journeyId: uuid }).safeParse(request.params);
    const query = cockpitQuery.safeParse(request.query);
    if (!params.success || !query.success) return validationError(reply);
    if (!dependencies.cockpitReadGateway) return unavailable(reply);
    try {
      const data = await dependencies.cockpitReadGateway.getJourneyCockpit(
        actor,
        params.data.workspaceId,
        params.data.journeyId,
        query.data.messageLimit,
      );
      return data === null ? notFound(reply) : { data };
    } catch {
      // Internal SQL and projection failures must not disclose tenant or
      // provider details to a browser operator.
      return unavailable(reply);
    }
  });
}
