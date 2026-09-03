import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { MetaBusinessAgentUpstreamError } from '../../../infrastructure/channels/meta/meta-business-agent-client.js';
import { MetaBusinessAgentGateway } from '../../../application/ports/meta-business-agent-gateway.js';
import { dbPool } from '../../../infrastructure/database/pool.js';
import { OperatorAuthenticator } from '../../../application/ports/operator-authenticator.js';
import { WorkspaceDirectory } from '../../../application/ports/workspace-directory.js';
import { assertTenantAccess, unauthorized, verifyOperatorAuth } from '../helpers/auth-guard.js';

export interface MetaBusinessAgentRouteDependencies {
  authenticator?: OperatorAuthenticator;
  workspaceDirectory?: WorkspaceDirectory;
  metaBusinessAgentGateway?: MetaBusinessAgentGateway;
  query?: typeof dbPool.query;
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
    const channelQuery = z.object({ channelConnectionId: z.string().uuid().optional() }).strict().safeParse(request.query ?? {});
    if (!channelQuery.success) {
      return reply.status(400).send({ error: 'Canal Meta inválido.' });
    }
    try {
      const eligibility = await dependencies.metaBusinessAgentGateway.checkEligibility(
        request.params.workspaceId,
        channelQuery.data.channelConnectionId,
      );
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
    request: FastifyRequest<{ Params: { workspaceId: string }; Body: { catalogId?: string; channelConnectionId?: string } }>,
    reply: FastifyReply,
  ) => {
    const actor = request.operatorActor;
    if (!actor) return unauthorized(reply, 'Operador não autenticado');
    const allowed = await assertTenantAccess(request, reply, request.params.workspaceId, actor, dependencies.workspaceDirectory, 'owner');
    if (!allowed) return;
    if (!dependencies.metaBusinessAgentGateway?.startOnboarding) return reply.status(503).send({ error: 'Meta Business Agent indisponível.', code: 'META_BUSINESS_AGENT_GATEWAY_UNAVAILABLE' });
    const parsed = z.object({
      catalogId: z.string().trim().max(128).optional(),
      channelConnectionId: z.string().uuid().optional(),
    }).strict().safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'Dados de onboarding inválidos.' });
    try {
      const result = await dependencies.metaBusinessAgentGateway.startOnboarding(
        request.params.workspaceId,
        parsed.data.catalogId,
        parsed.data.channelConnectionId,
      );
      return reply.status(201).send({ data: result });
    } catch (error) {
      const upstream = error instanceof MetaBusinessAgentUpstreamError ? error : undefined;
      request.log.error({ statusCode: upstream?.statusCode, workspaceId: request.params.workspaceId }, 'Meta Business Agent onboarding failed');
      if (upstream?.statusCode === 409) {
        return reply.status(409).send({ error: 'Este número não está elegível para o Meta Business Agent.', code: 'META_BUSINESS_AGENT_NOT_ELIGIBLE' });
      }
      return reply.status(upstream?.statusCode === 403 ? 403 : 503).send({ error: 'Não foi possível iniciar o onboarding do Meta Business Agent.', code: 'META_BUSINESS_AGENT_ONBOARDING_FAILED' });
    }
  });

  app.post('/api/v1/workspaces/:workspaceId/meta-business-agent/test', async (
    request: FastifyRequest<{ Params: { workspaceId: string }; Body: { userMsg: string; conversationId?: string; channelConnectionId?: string } }>,
    reply: FastifyReply,
  ) => {
    const actor = request.operatorActor;
    if (!actor) return unauthorized(reply, 'Operador não autenticado');
    const allowed = await assertTenantAccess(request, reply, request.params.workspaceId, actor, dependencies.workspaceDirectory, 'operator');
    if (!allowed) return;
    if (!dependencies.metaBusinessAgentGateway?.testAgent) return reply.status(503).send({ error: 'Meta Business Agent indisponível.', code: 'META_BUSINESS_AGENT_GATEWAY_UNAVAILABLE' });
    const parsed = z.object({
      userMsg: z.string().trim().min(1).max(2000),
      conversationId: z.string().trim().max(256).optional(),
      channelConnectionId: z.string().uuid().optional(),
    }).strict().safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Mensagem de teste inválida.' });
    const query = dependencies.query ?? dbPool.query.bind(dbPool);
    try {
      const config = await query(
        `SELECT meta_agent_id, meta_agent_enabled, meta_agent_eligibility_status,
                meta_agent_activation_status, meta_agent_channel_connection_id
         FROM public.workspace_agent_config
         WHERE workspace_id = $1
         LIMIT 1`,
        [request.params.workspaceId],
      );
      const row = config.rows[0] as Record<string, unknown> | undefined;
      if (!row) {
        return reply.status(409).send({
          error: 'Inicie o onboarding e confirme a elegibilidade antes de testar o agente Meta.',
          code: 'META_BUSINESS_AGENT_ONBOARDING_REQUIRED',
        });
      }
      const activation = row?.meta_agent_activation_status;
      const canRetryFailedAgent = activation === 'FAILED' && Boolean(row?.meta_agent_id);
      if ((!row.meta_agent_enabled && !canRetryFailedAgent) || !row.meta_agent_id
        || row.meta_agent_eligibility_status !== 'ELIGIBLE'
        || (activation !== 'PENDING' && activation !== 'READY' && !canRetryFailedAgent)
        || (parsed.data.channelConnectionId
          && row.meta_agent_channel_connection_id !== parsed.data.channelConnectionId)) {
        return reply.status(409).send({
          error: 'Inicie o onboarding e confirme a elegibilidade antes de testar o agente Meta.',
          code: 'META_BUSINESS_AGENT_ONBOARDING_REQUIRED',
        });
      }

      // Eligibility is time-varying. A browser can hold an old ELIGIBLE value
      // while the number, token, or account standing has changed, so refresh
      // the provider proof immediately before the official test. The gateway
      // persists the result and the responder policy will use its timestamp.
      const eligibility = await dependencies.metaBusinessAgentGateway.checkEligibility(
        request.params.workspaceId,
        parsed.data.channelConnectionId,
      );
      if (eligibility.status !== 'ELIGIBLE') {
        return reply.status(eligibility.status === 'INELIGIBLE' ? 409 : 503).send({
          error: eligibility.status === 'INELIGIBLE'
            ? 'Este número não está elegível para testar o Meta Business Agent.'
            : 'A elegibilidade do Meta Business Agent não pôde ser confirmada agora.',
          code: eligibility.status === 'INELIGIBLE'
            ? 'META_BUSINESS_AGENT_NOT_ELIGIBLE'
            : 'META_BUSINESS_AGENT_ELIGIBILITY_UNAVAILABLE',
        });
      }
    } catch (error) {
      request.log.error({ error, workspaceId: request.params.workspaceId }, 'Could not validate Meta agent before test');
      return reply.status(503).send({ error: 'Não foi possível validar a ativação do Meta Business Agent.', code: 'META_BUSINESS_AGENT_TEST_VALIDATION_FAILED' });
    }
    try {
      const result = await dependencies.metaBusinessAgentGateway.testAgent(
        request.params.workspaceId,
        parsed.data.userMsg,
        parsed.data.conversationId,
        parsed.data.channelConnectionId,
      );
      return reply.status(200).send({ data: result });
    } catch (error) {
      const upstream = error instanceof MetaBusinessAgentUpstreamError ? error : undefined;
      request.log.error({ statusCode: upstream?.statusCode, workspaceId: request.params.workspaceId }, 'Meta Business Agent test failed');
      if (upstream?.statusCode === 409) {
        return reply.status(409).send({
          error: 'O Meta Business Agent ainda não devolveu uma resposta utilizável. Aguarde a preparação e tente novamente.',
          code: 'META_BUSINESS_AGENT_NOT_READY',
        });
      }
      return reply.status(503).send({ error: 'Não foi possível testar o Meta Business Agent.', code: 'META_BUSINESS_AGENT_TEST_FAILED' });
    }
  });

  app.post('/api/v1/workspaces/:workspaceId/meta-business-agent/thread-control', async (
    request: FastifyRequest<{ Params: { workspaceId: string }; Body: { action: 'take' | 'release'; to: string; metadata?: string; journeyId?: string; channelConnectionId?: string } }>,
    reply: FastifyReply,
  ) => {
    const actor = request.operatorActor;
    if (!actor) return unauthorized(reply, 'Operador não autenticado');
    const allowed = await assertTenantAccess(request, reply, request.params.workspaceId, actor, dependencies.workspaceDirectory, 'operator');
    if (!allowed) return;
    if (!dependencies.metaBusinessAgentGateway?.controlThread) return reply.status(503).send({ error: 'Meta Business Agent indisponível.', code: 'META_BUSINESS_AGENT_GATEWAY_UNAVAILABLE' });
    const parsed = z.object({
      action: z.enum(['take', 'release']),
      to: z.string().trim().min(1).max(128),
      metadata: z.string().trim().max(1024).optional(),
      journeyId: z.string().uuid().optional(),
      channelConnectionId: z.string().uuid().optional(),
    }).strict().safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Comando de thread control inválido.' });

    // The provider call and the local owner transition form one auditable
    // contract.  Validate the journey before touching Meta so a typo cannot
    // transfer a real consumer thread without a matching CRM conversation.
    const query = dependencies.query ?? dbPool.query.bind(dbPool);
    let resolvedChannelConnectionId = parsed.data.channelConnectionId;
    if (parsed.data.journeyId) {
      try {
        const journey = await query(
          `SELECT j.id, j.contact_id, j.channel_connection_id, c.phone AS contact_phone,
                  cc.provider, cc.status AS channel_status,
                  cc.public_config::jsonb ->> 'phoneNumberId' AS phone_number_id
           FROM public.commercial_journeys j
           JOIN public.channel_connections cc ON cc.id = j.channel_connection_id
           JOIN public.contacts c ON c.id = j.contact_id
           WHERE j.id = $1 AND j.workspace_id = $2
           LIMIT 1`,
          [parsed.data.journeyId, request.params.workspaceId],
        );
        if ((journey.rowCount ?? journey.rows.length) !== 1) {
          return reply.status(404).send({ error: 'Jornada não encontrada para esta transferência.' });
        }
        const localJourney = journey.rows[0] as {
          provider?: string;
          channel_status?: string;
          contact_phone?: string | null;
          channel_connection_id?: string | null;
        };
        if (localJourney.provider !== 'meta_cloud' || localJourney.channel_status !== 'CONNECTED') {
          return reply.status(409).send({
            error: 'Thread control só está disponível para uma conversa em canal WABA Meta Cloud conectado.',
            code: 'META_THREAD_CONTROL_CHANNEL_REQUIRED',
          });
        }
        if (!localJourney.channel_connection_id) {
          return reply.status(409).send({
            error: 'A jornada não possui vínculo com uma conexão Meta Cloud.',
            code: 'META_THREAD_CONTROL_CHANNEL_REQUIRED',
          });
        }
        if (resolvedChannelConnectionId && resolvedChannelConnectionId !== localJourney.channel_connection_id) {
          return reply.status(409).send({
            error: 'O canal informado não corresponde à jornada selecionada.',
            code: 'META_THREAD_CONTROL_CHANNEL_MISMATCH',
          });
        }
        resolvedChannelConnectionId = localJourney.channel_connection_id;
        const targetDigits = parsed.data.to.replace(/\D/g, '');
        const contactDigits = String(localJourney.contact_phone || '').replace(/\D/g, '');
        if (!targetDigits || !contactDigits || targetDigits !== contactDigits) {
          return reply.status(409).send({
            error: 'O destinatário informado não corresponde ao telefone da jornada selecionada.',
            code: 'META_THREAD_CONTROL_RECIPIENT_MISMATCH',
          });
        }
      } catch (error) {
        request.log.error({ error, workspaceId: request.params.workspaceId }, 'Could not validate journey before Meta thread control');
        return reply.status(503).send({ error: 'Não foi possível validar a conversa antes da transferência.', code: 'META_BUSINESS_AGENT_THREAD_CONTROL_VALIDATION_FAILED' });
      }
    }

    try {
      const { journeyId, ...providerInput } = parsed.data;
      const result = await dependencies.metaBusinessAgentGateway.controlThread(
        request.params.workspaceId,
        { ...providerInput, channelConnectionId: resolvedChannelConnectionId },
      );

      if (journeyId) {
        const responderOwner = parsed.data.action === 'take' ? 'sos_sales' : 'meta_business_agent';
        let ownerUpdate;
        try {
          ownerUpdate = await query(
            `UPDATE public.commercial_journeys
             SET responder_owner = $3,
                 responder_changed_at = NOW(),
                 responder_change_reason = $4,
                 updated_at = NOW()
             WHERE id = $1 AND workspace_id = $2
             RETURNING id, responder_owner, responder_changed_at`,
            [journeyId, request.params.workspaceId, responderOwner, `meta_thread_control_${parsed.data.action}`],
          );
        } catch (error) {
          request.log.error({ error, workspaceId: request.params.workspaceId, journeyId }, 'Meta thread control succeeded but local responder owner update failed');
          return reply.status(503).send({ error: 'A Meta transfer foi aceita, mas o responsável local não pôde ser salvo. Faça uma reconciliação antes de novo envio.', code: 'META_BUSINESS_AGENT_THREAD_CONTROL_LOCAL_SYNC_FAILED' });
        }
        if ((ownerUpdate.rowCount ?? ownerUpdate.rows.length) !== 1) {
          request.log.error({ workspaceId: request.params.workspaceId, journeyId }, 'Meta thread control succeeded but local responder owner was not persisted');
          return reply.status(503).send({ error: 'A Meta transfer foi aceita, mas o responsável local não pôde ser salvo. Faça uma reconciliação antes de novo envio.', code: 'META_BUSINESS_AGENT_THREAD_CONTROL_LOCAL_SYNC_FAILED' });
        }
        return reply.status(200).send({
          data: result,
          journeyId,
          responderOwner,
          message: responderOwner === 'sos_sales'
            ? 'Controle tomado pelo SOS Sales para esta conversa.'
            : 'Controle liberado para o Meta Business Agent nesta conversa.',
        });
      }

      return reply.status(200).send({ data: result });
    } catch (error) {
      const upstream = error instanceof MetaBusinessAgentUpstreamError ? error : undefined;
      request.log.error({ statusCode: upstream?.statusCode, workspaceId: request.params.workspaceId }, 'Meta Business Agent thread control failed');
      return reply.status(503).send({ error: 'Não foi possível alterar o controle da conversa.', code: 'META_BUSINESS_AGENT_THREAD_CONTROL_FAILED' });
    }
  });
}
