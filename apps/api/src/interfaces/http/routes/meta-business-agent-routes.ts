import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { MetaBusinessAgentUpstreamError } from '../../../infrastructure/channels/meta/meta-business-agent-client.js';
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

  app.post('/api/v1/workspaces/:workspaceId/meta-business-agent/onboarding', async (
    request: FastifyRequest<{ Params: { workspaceId: string }; Body: { catalogId?: string } }>,
    reply: FastifyReply,
  ) => {
    const actor = request.operatorActor;
    if (!actor) return unauthorized(reply, 'Operador não autenticado');
    const allowed = await assertTenantAccess(request, reply, request.params.workspaceId, actor, dependencies.workspaceDirectory, 'owner');
    if (!allowed) return;
    if (!dependencies.metaBusinessAgentGateway?.startOnboarding) return reply.status(503).send({ error: 'Meta Business Agent indisponível.', code: 'META_BUSINESS_AGENT_GATEWAY_UNAVAILABLE' });
    const parsed = z.object({ catalogId: z.string().trim().max(128).optional() }).strict().safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'Dados de onboarding inválidos.' });
    try {
      const result = await dependencies.metaBusinessAgentGateway.startOnboarding(request.params.workspaceId, parsed.data.catalogId);
      return reply.status(201).send({ data: result });
    } catch (error) {
      const upstream = error instanceof MetaBusinessAgentUpstreamError ? error : undefined;
      request.log.error({ statusCode: upstream?.statusCode, workspaceId: request.params.workspaceId }, 'Meta Business Agent onboarding failed');
      return reply.status(upstream?.statusCode === 403 ? 403 : 503).send({ error: 'Não foi possível iniciar o onboarding do Meta Business Agent.', code: 'META_BUSINESS_AGENT_ONBOARDING_FAILED' });
    }
  });

  app.post('/api/v1/workspaces/:workspaceId/meta-business-agent/test', async (
    request: FastifyRequest<{ Params: { workspaceId: string }; Body: { userMsg: string; conversationId?: string } }>,
    reply: FastifyReply,
  ) => {
    const actor = request.operatorActor;
    if (!actor) return unauthorized(reply, 'Operador não autenticado');
    const allowed = await assertTenantAccess(request, reply, request.params.workspaceId, actor, dependencies.workspaceDirectory, 'operator');
    if (!allowed) return;
    if (!dependencies.metaBusinessAgentGateway?.testAgent) return reply.status(503).send({ error: 'Meta Business Agent indisponível.', code: 'META_BUSINESS_AGENT_GATEWAY_UNAVAILABLE' });
    const parsed = z.object({ userMsg: z.string().trim().min(1).max(2000), conversationId: z.string().trim().max(256).optional() }).strict().safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Mensagem de teste inválida.' });
    try {
      const result = await dependencies.metaBusinessAgentGateway.testAgent(request.params.workspaceId, parsed.data.userMsg, parsed.data.conversationId);
      return reply.status(200).send({ data: result });
    } catch (error) {
      const upstream = error instanceof MetaBusinessAgentUpstreamError ? error : undefined;
      request.log.error({ statusCode: upstream?.statusCode, workspaceId: request.params.workspaceId }, 'Meta Business Agent test failed');
      return reply.status(503).send({ error: 'Não foi possível testar o Meta Business Agent.', code: 'META_BUSINESS_AGENT_TEST_FAILED' });
    }
  });

  app.post('/api/v1/workspaces/:workspaceId/meta-business-agent/thread-control', async (
    request: FastifyRequest<{ Params: { workspaceId: string }; Body: { action: 'take' | 'release'; to: string; metadata?: string } }>,
    reply: FastifyReply,
  ) => {
    const actor = request.operatorActor;
    if (!actor) return unauthorized(reply, 'Operador não autenticado');
    const allowed = await assertTenantAccess(request, reply, request.params.workspaceId, actor, dependencies.workspaceDirectory, 'operator');
    if (!allowed) return;
    if (!dependencies.metaBusinessAgentGateway?.controlThread) return reply.status(503).send({ error: 'Meta Business Agent indisponível.', code: 'META_BUSINESS_AGENT_GATEWAY_UNAVAILABLE' });
    const parsed = z.object({ action: z.enum(['take', 'release']), to: z.string().trim().min(1).max(128), metadata: z.string().trim().max(1024).optional() }).strict().safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Comando de thread control inválido.' });
    try {
      const result = await dependencies.metaBusinessAgentGateway.controlThread(request.params.workspaceId, parsed.data);
      return reply.status(200).send({ data: result });
    } catch (error) {
      const upstream = error instanceof MetaBusinessAgentUpstreamError ? error : undefined;
      request.log.error({ statusCode: upstream?.statusCode, workspaceId: request.params.workspaceId }, 'Meta Business Agent thread control failed');
      return reply.status(503).send({ error: 'Não foi possível alterar o controle da conversa.', code: 'META_BUSINESS_AGENT_THREAD_CONTROL_FAILED' });
    }
  });
}
