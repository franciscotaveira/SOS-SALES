import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { MetaBusinessAgentGateway } from '../../../application/ports/meta-business-agent-gateway.js';
import { OperatorAuthenticator } from '../../../application/ports/operator-authenticator.js';
import { WorkspaceDirectory } from '../../../application/ports/workspace-directory.js';
import { assertTenantAccess, unauthorized, verifyOperatorAuth } from '../helpers/auth-guard.js';

export interface MetaBusinessAgentRouteDependencies {
  authenticator?: OperatorAuthenticator;
  workspaceDirectory?: WorkspaceDirectory;
  metaBusinessAgentGateway?: MetaBusinessAgentGateway;
}

export async function metaBusinessAgentRoutes(
  app: FastifyInstance,
  dependencies: MetaBusinessAgentRouteDependencies = {},
): Promise<void> {
  app.addHook('onRequest', async (request, reply) => {
    if (!dependencies.authenticator) return unauthorized(reply, 'Authenticator is required');
    const actor = await verifyOperatorAuth(request, reply, dependencies.authenticator);
    if (!actor) return;
  });

  app.get('/api/v1/workspaces/:workspaceId/meta-business-agent/eligibility', async (
    request: FastifyRequest<{ Params: { workspaceId: string } }>,
    reply: FastifyReply,
  ) => {
    const actor = request.operatorActor;
    if (!actor) return unauthorized(reply, 'Operador não autenticado');
    const allowed = await assertTenantAccess(
      request,
      reply,
      request.params.workspaceId,
      actor,
      dependencies.workspaceDirectory,
      'viewer',
    );
    if (!allowed) return;
    if (!dependencies.metaBusinessAgentGateway) {
      return reply.status(503).send({
        error: 'Elegibilidade do Meta Business Agent indisponível.',
        code: 'META_BUSINESS_AGENT_GATEWAY_UNAVAILABLE',
      });
    }
    try {
      const eligibility = await dependencies.metaBusinessAgentGateway.checkEligibility(request.params.workspaceId);
      return reply.status(200).send({ data: eligibility });
    } catch (error) {
      request.log.error({ error, workspaceId: request.params.workspaceId }, 'Meta Business Agent eligibility adapter failed');
      return reply.status(503).send({
        error: 'Não foi possível consultar a elegibilidade do Meta Business Agent.',
        code: 'META_BUSINESS_AGENT_ELIGIBILITY_UNAVAILABLE',
      });
    }
  });
}
