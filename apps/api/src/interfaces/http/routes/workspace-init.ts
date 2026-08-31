import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { WorkspaceProvisioningGateway } from '../../../application/ports/workspace-provisioning-gateway.js';

export interface WorkspaceInitRouteDependencies {
  workspaceProvisioningGateway?: WorkspaceProvisioningGateway;
}

const initBodySchema = z.object({
  workspaceName: z.string().trim().min(2).max(100).optional(),
}).strict();

const clientWorkspaceBodySchema = z.object({
  name: z.string().trim().min(2).max(100),
  businessType: z.enum(['hair_salon', 'auto_film', 'general_services']),
  tagline: z.string().trim().max(500).default(''),
  ownerEmail: z.string().trim().email().optional().or(z.literal('')),
  whatsappNumber: z.string().trim().max(32).optional().default(''),
  provider: z.enum(['waba', 'waha']),
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

  app.post('/workspaces/:parentWorkspaceId/client-workspaces', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    if (!dependencies.workspaceProvisioningGateway) return unavailable(reply);
    const body = clientWorkspaceBodySchema.safeParse(request.body || {});
    const parentWorkspaceId = z.string().uuid().safeParse(
      (request.params as { parentWorkspaceId?: string }).parentWorkspaceId,
    );
    if (!body.success || !parentWorkspaceId.success) return invalid(reply);

    try {
      const result = await dependencies.workspaceProvisioningGateway.createClientWorkspace(actor, {
        parentWorkspaceId: parentWorkspaceId.data,
        ...body.data,
        ownerEmail: body.data.ownerEmail || undefined,
      });
      return reply.code(201).send({ data: result });
    } catch (error) {
      if (error instanceof Error && error.message === 'CLIENT_WORKSPACE_OWNER_REQUIRED') {
        return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Workspace owner role required' });
      }
      throw error;
    }
  });

  app.delete('/workspaces/:workspaceId', async (request, reply) => {
    const actor = actorOrUnauthorized(request, reply);
    if (!actor) return reply;
    if (!dependencies.workspaceProvisioningGateway) return unavailable(reply);
    const workspaceId = z.string().uuid().safeParse(
      (request.params as { workspaceId?: string }).workspaceId,
    );
    if (!workspaceId.success) return invalid(reply);

    try {
      await dependencies.workspaceProvisioningGateway.deactivateWorkspace(actor, workspaceId.data);
      return { data: { workspaceId: workspaceId.data, status: 'deactivated' } };
    } catch (error) {
      if (error instanceof Error && error.message === 'WORKSPACE_DEACTIVATION_FORBIDDEN_OR_NOT_FOUND') {
        return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Workspace owner role required or workspace unavailable' });
      }
      throw error;
    }
  });
}
