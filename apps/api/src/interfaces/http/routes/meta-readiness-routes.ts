import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { dbPool } from '../../../infrastructure/database/pool.js';
import { OperatorAuthenticator } from '../../../application/ports/operator-authenticator.js';
import { WorkspaceDirectory } from '../../../application/ports/workspace-directory.js';
import { assertTenantAccess, unauthorized, verifyOperatorAuth } from '../helpers/auth-guard.js';
import { normalizeWorkspaceUuid } from './whatsapp-channel-routes.js';

type ReadinessStatus = 'HEALTHY' | 'WARNING' | 'BLOCKED' | 'UNKNOWN';
type ReadinessSeverity = 'BLOCKER' | 'CRITICAL' | 'OPERATIONAL';

interface ReadinessControl {
  key: string;
  label: string;
  status: ReadinessStatus;
  severity: ReadinessSeverity;
  observedAt: string;
  source: 'LOCAL_CONFIGURATION';
  evidence: string;
  recommendation: string;
}

export interface MetaReadinessRouteDependencies {
  authenticator?: OperatorAuthenticator;
  workspaceDirectory?: WorkspaceDirectory;
  query?: typeof dbPool.query;
}

function control(
  key: string,
  label: string,
  status: ReadinessStatus,
  severity: ReadinessSeverity,
  evidence: string,
  recommendation: string,
  observedAt: string,
): ReadinessControl {
  return { key, label, status, severity, observedAt, source: 'LOCAL_CONFIGURATION', evidence, recommendation };
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return {};
}

function statusSummary(controls: ReadinessControl[]) {
  const counts = controls.reduce<Record<ReadinessStatus, number>>(
    (result, item) => ({ ...result, [item.status]: result[item.status] + 1 }),
    { HEALTHY: 0, WARNING: 0, BLOCKED: 0, UNKNOWN: 0 },
  );
  const weightedTotal = controls.reduce((sum, item) => sum + (item.severity === 'BLOCKER' ? 3 : item.severity === 'CRITICAL' ? 2 : 1), 0);
  const weightedHealthy = controls.reduce((sum, item) => {
    const weight = item.severity === 'BLOCKER' ? 3 : item.severity === 'CRITICAL' ? 2 : 1;
    return sum + (item.status === 'HEALTHY' ? weight : item.status === 'WARNING' ? weight * 0.5 : 0);
  }, 0);
  return { counts, score: Math.round((weightedHealthy / weightedTotal) * 100) };
}

/**
 * A deliberately read-only first slice of Meta Readiness.
 *
 * It only reports local, tenant-scoped evidence. It never claims that Meta
 * accepted a webhook, permission grant, billing state, or template solely
 * because a local credential exists; those controls stay UNKNOWN until their
 * provider-specific probes are implemented.
 */
export async function metaReadinessRoutes(
  app: FastifyInstance,
  dependencies: MetaReadinessRouteDependencies = {},
): Promise<void> {
  app.addHook('onRequest', async (request, reply) => {
    if (!dependencies.authenticator) return unauthorized(reply, 'Authenticator is required');
    const actor = await verifyOperatorAuth(request, reply, dependencies.authenticator);
    if (!actor) return;
  });

  app.get('/api/v1/workspaces/:workspaceId/meta-readiness', async (
    request: FastifyRequest<{ Params: { workspaceId: string } }>,
    reply: FastifyReply,
  ) => {
    const actor = request.operatorActor;
    if (!actor) return unauthorized(reply, 'Operador não autenticado');
    const workspaceId = normalizeWorkspaceUuid(request.params.workspaceId);
    if (!workspaceId) return reply.status(400).send({ error: 'Workspace inválido.' });
    const allowed = await assertTenantAccess(request, reply, workspaceId, actor, dependencies.workspaceDirectory, 'viewer');
    if (!allowed) return;

    const query = dependencies.query ?? dbPool.query.bind(dbPool);
    const observedAt = new Date().toISOString();

    try {
      const [channelsResult, agentResult] = await Promise.all([
        query<{
          id: string;
          status: string | null;
          public_config: unknown;
          bearer_token_available: boolean;
          capi_token_available: boolean;
        }>(
          `SELECT cc.id, cc.status, cc.public_config,
                  EXISTS (
                    SELECT 1 FROM public.channel_connection_secrets cs
                    WHERE cs.channel_connection_id = cc.id
                      AND cs.workspace_id = cc.workspace_id
                      AND cs.secret_kind = 'meta_bearer_token'
                  ) AS bearer_token_available,
                  EXISTS (
                    SELECT 1 FROM public.channel_connection_secrets cs
                    WHERE cs.channel_connection_id = cc.id
                      AND cs.workspace_id = cc.workspace_id
                      AND cs.secret_kind = 'meta_capi_token'
                  ) AS capi_token_available
             FROM public.channel_connections cc
            WHERE cc.workspace_id = $1 AND cc.provider = 'meta_cloud'
            ORDER BY cc.created_at ASC
            LIMIT 2`,
          [workspaceId],
        ),
        query<{
          runtime_enabled: boolean | null;
          responder_mode: string | null;
          meta_agent_eligibility_status: string | null;
          meta_agent_activation_status: string | null;
          meta_agent_ready_at: Date | null;
        }>(
          `SELECT runtime_enabled, responder_mode, meta_agent_eligibility_status,
                  meta_agent_activation_status, meta_agent_ready_at
             FROM public.workspace_agent_config
            WHERE workspace_id = $1
            LIMIT 1`,
          [workspaceId],
        ),
      ]);

      const channels = channelsResult.rows;
      const onlyChannel = channels.length === 1 ? channels[0] : null;
      const config = asObject(onlyChannel?.public_config);
      const phoneNumberId = typeof config.phoneNumberId === 'string' ? config.phoneNumberId : config.phone_number_id;
      const wabaId = typeof config.wabaId === 'string' ? config.wabaId : config.waba_id;
      const capiConfigured = Boolean(
        onlyChannel?.capi_token_available
        && (typeof config.metaPixelId === 'string' || typeof config.meta_capi_pixel_id === 'string' || typeof config.metaDatasetId === 'string' || typeof config.meta_capi_dataset_id === 'string'),
      );
      const agent = agentResult.rows[0];

      const controls: ReadinessControl[] = [
        control(
          'WABA_BINDING',
          'WABA e número vinculados',
          channels.length > 1 ? 'BLOCKED' : onlyChannel?.status === 'CONNECTED' && Boolean(phoneNumberId) && Boolean(wabaId) ? 'HEALTHY' : 'BLOCKED',
          'BLOCKER',
          channels.length > 1
            ? 'Há mais de um canal Meta Cloud conectado; o MVP não possui um número padrão determinístico.'
            : onlyChannel?.status === 'CONNECTED' && phoneNumberId && wabaId
              ? 'Canal Meta Cloud conectado com WABA e Phone Number ID locais.'
              : 'Não há um canal Meta Cloud conectado com vínculo completo.',
          channels.length > 1 ? 'Escolha ou desconecte o canal excedente antes de operar.' : 'Conecte e valide um número WABA oficial.',
          observedAt,
        ),
        control(
          'CLOUD_API_CREDENTIAL',
          'Credencial Cloud API disponível',
          onlyChannel?.bearer_token_available ? 'HEALTHY' : onlyChannel ? 'BLOCKED' : 'UNKNOWN',
          'BLOCKER',
          onlyChannel?.bearer_token_available ? 'Existe uma credencial Meta protegida para o canal conectado.' : onlyChannel ? 'O canal existe, mas não há credencial Meta protegida associada.' : 'Não há canal único para avaliar a credencial.',
          'Conecte novamente o canal com um token válido e de escopo correto.',
          observedAt,
        ),
        control(
          'WEBHOOK_AUTH_CONFIGURATION',
          'Autenticação do webhook configurada',
          process.env.META_VERIFY_TOKEN && process.env.META_APP_SECRET ? 'HEALTHY' : 'UNKNOWN',
          'CRITICAL',
          process.env.META_VERIFY_TOKEN && process.env.META_APP_SECRET
            ? 'O runtime possui os segredos necessários para autenticar o webhook.'
            : 'Não foi possível comprovar a configuração de segredo no runtime atual.',
          'Execute o teste de entrega do webhook para comprovar assinatura e recebimento.',
          observedAt,
        ),
        control(
          'CAPI_CONFIGURATION',
          'Configuração CAPI disponível',
          capiConfigured ? 'HEALTHY' : onlyChannel ? 'WARNING' : 'UNKNOWN',
          'OPERATIONAL',
          capiConfigured ? 'Há identificador de Pixel/Dataset e credencial CAPI protegida.' : onlyChannel ? 'Não há evidência local suficiente de Pixel/Dataset e token CAPI no mesmo canal.' : 'Não há canal Meta Cloud para avaliar CAPI.',
          'Configure Pixel ou Dataset e teste um evento em ambiente controlado.',
          observedAt,
        ),
        control(
          'BUSINESS_AGENT',
          'Meta Business Agent',
          agent?.meta_agent_activation_status === 'READY' && agent.meta_agent_eligibility_status === 'ELIGIBLE' ? 'HEALTHY'
            : agent?.meta_agent_eligibility_status === 'INELIGIBLE' ? 'WARNING'
              : 'UNKNOWN',
          'OPERATIONAL',
          agent?.meta_agent_activation_status === 'READY' && agent.meta_agent_eligibility_status === 'ELIGIBLE'
            ? 'Elegibilidade e ativação foram comprovadas pelo último teste útil salvo.'
            : agent?.meta_agent_eligibility_status === 'INELIGIBLE'
              ? 'A última consulta persistida informou que o número não é elegível.'
              : 'Não há elegibilidade e ativação válidas persistidas.',
          'Atualize a elegibilidade e conclua onboarding e teste antes de selecionar o agente Meta.',
          observedAt,
        ),
        control(
          'HUMAN_HANDOFF',
          'Handoff humano',
          agent?.responder_mode === 'manual' || Boolean(agent?.runtime_enabled) ? 'WARNING' : 'UNKNOWN',
          'CRITICAL',
          agent?.responder_mode === 'manual' ? 'O workspace está configurado para resposta humana.'
            : agent?.runtime_enabled ? 'A IA está habilitada, mas esta leitura não prova que cada jornada possua um handoff humano operável.'
              : 'Não há evidência suficiente de uma política de handoff ativa.',
          'Homologue take, pause, resolve e return-to-AI em uma jornada controlada.',
          observedAt,
        ),
      ];

      return reply.status(200).send({
        data: {
          observedAt,
          scope: 'LOCAL_CONFIGURATION_ONLY',
          summary: statusSummary(controls),
          controls,
          limitations: [
            'Esta leitura não comprova permissões concedidas pela Meta, billing, qualidade de template ou entrega real de webhook.',
            'Controles sem prova externa permanecem UNKNOWN e exigem teste autenticado específico.',
          ],
        },
      });
    } catch (error) {
      request.log.error({ error, workspaceId }, 'Meta readiness snapshot failed');
      return reply.status(503).send({ error: 'Não foi possível compor o diagnóstico Meta agora.', code: 'META_READINESS_UNAVAILABLE' });
    }
  });
}
