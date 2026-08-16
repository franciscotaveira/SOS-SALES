import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { WorkspaceProvisioningGateway } from '../../../application/ports/workspace-provisioning-gateway.js';

export interface WorkspaceInitRouteDependencies {
  workspaceProvisioningGateway?: WorkspaceProvisioningGateway;
}

const initBodySchema = z.object({
  workspaceName: z.string().trim().min(2).max(100).optional(),
}).strict();

function actorOrUnauthorized(request: FastifyRequest, reply: FastifyReply) {
  if (!request.operatorActor) {
    reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or missing bearer token' });
    return null;
  }
  return request.operatorActor;
}

function invalid(reply: FastifyReply): FastifyReply {
  return reply.code(422).send({ statusCode: 422, error: 'Unprocessable Entity', message: 'Invalid workspace init payload' });
}

function unavailable(reply: FastifyReply): FastifyReply {
  return reply.code(503).send({ statusCode: 503, error: 'Service Unavailable', message: 'Workspace provisioning service is unavailable' });
}

export async function workspaceInitRoutes(
  app: FastifyInstance,
  dependencies: WorkspaceInitRouteDependencies,
): Promise<void> {
  app.post('/workspaces/init', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    const body = initBodySchema.safeParse(request.body || {});
    if (!body.success) return invalid(reply);
    if (!dependencies.workspaceProvisioningGateway) return unavailable(reply);

    const result = await dependencies.workspaceProvisioningGateway.initializeForActor(
      actor,
      body.data.workspaceName,
    );

    reply.code(result.isExisting ? 200 : 201);
    return { data: result };
  });
}
