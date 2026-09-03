/**
 * TX COMMERCIAL CORE — AGENT BOT CONTROL ROUTES
 * 
 * API para controle do agente receptionist por jornada:
 * - Habilitar bot    (operador ativa explicitamente na jornada)
 * - Desabilitar bot  (operador desativa explicitamente na jornada)
 * - Pausar bot       (humano assume temporariamente)
 * - Retomar bot      (volta ao automático, mas só se bot_enabled=true)
 * - Status atual     (retorna estado completo: enabled + paused)
 */

import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { dbPool } from '../../../infrastructure/database/pool.js';
import { normalizeWorkspaceUuid } from './whatsapp-channel-routes.js';
import { OperatorAuthenticator } from '../../../application/ports/operator-authenticator.js';
import { WorkspaceDirectory } from '../../../application/ports/workspace-directory.js';
import { verifyOperatorAuth, assertTenantAccess, unauthorized } from '../helpers/auth-guard.js';
import {
  isMetaAgentReady as isMetaAgentReadyPolicy,
  shouldSosSalesRespond,
  type ResponderMode,
  type ResponderOwner,
} from '../../../application/agents/receptionist-agent.js';

interface BotParams {
  workspaceId: string;
  journeyId: string;
}

const autonomyModeSchema = z.enum([
  'copilot_supervised',
  'semi_autonomous',
  'autonomous_24_7',
]);

const responderModeSchema = z.enum([
  'sos_sales',
  'meta_business_agent',
  'auto_fallback',
  'manual',
]);

const behaviorConfigSchema = z.object({
  tone: z.enum([
    'elegante_acolhedor',
    'direto_objetivo',
    'tecnico_formal',
    'comercial_fechador',
    'empatico_cuidadoso',
  ]).optional(),
  rhythm: z.enum(['instantaneo', 'natural_humano', 'pausado_artesanal']).optional(),
  structure: z.enum(['picado_whatsapp', 'bloco_unico']).optional(),
  emojis: z.enum(['delicado_pontual', 'vibrante_expressivo', 'zero_emojis']).optional(),
  primaryGoal: z.enum(['agendamento', 'sinal_pix', 'orcamento', 'qualificacao_vendedor']).optional(),
  maxDiscountPercent: z.number().int().min(0).max(100).optional(),
  humanHandoffTriggers: z.object({
    quimicaSensivel: z.boolean(),
    reclamacoes: z.boolean(),
    pedidoHumano: z.boolean(),
    descontoAlto: z.boolean(),
  }).strict().optional(),
  typingDelaySeconds: z.number().int().min(0).max(120).optional(),
}).strict();

const agentConfigUpdateSchema = z.object({
  autonomyMode: autonomyModeSchema.optional(),
  runtimeEnabled: z.boolean().optional(),
  responderMode: responderModeSchema.optional(),
  behaviorConfig: behaviorConfigSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one agent configuration field is required',
});

interface WorkspaceAgentRuntimeConfig {
  autonomyMode: z.infer<typeof autonomyModeSchema>;
  runtimeEnabled: boolean;
  responderMode: z.infer<typeof responderModeSchema>;
  metaAgentId: string | null;
  metaAgentChannelConnectionId: string | null;
  metaAgentEnabled: boolean;
  metaAgentEligibilityStatus: 'ELIGIBLE' | 'INELIGIBLE' | 'UNKNOWN';
  metaAgentCheckedAt: string | null;
  metaAgentActivationStatus: 'NOT_STARTED' | 'PENDING' | 'READY' | 'FAILED';
  metaAgentOnboardingStartedAt: string | null;
  metaAgentReadyAt: string | null;
  metaAgentLastError: string | null;
  behaviorConfig: Record<string, unknown>;
  publishedAt: string | null;
  publishedBy: string | null;
}

type DatabaseQuery = typeof dbPool.query;
const defaultDatabaseQuery = dbPool.query.bind(dbPool) as DatabaseQuery;

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

function nonBlank(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasPublishedHours(value: unknown): boolean {
  if (nonBlank(value)) return true;
  const hours = asObject(value);
  return Object.values(hours).some((day) => {
    const item = asObject(day);
    return item.isOpen === true && (nonBlank(item.open) || nonBlank(item.close));
  });
}

function validateIntelligenceBundle(value: unknown): { ok: true; bundle: Record<string, unknown>; bytes: number } | { ok: false; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'Payload de inteligência inválido' };
  }
  const bundle = value as Record<string, unknown>;
  let serialized: string;
  try {
    serialized = JSON.stringify(bundle);
  } catch {
    return { ok: false, error: 'Payload de inteligência não serializável' };
  }
  const bytes = Buffer.byteLength(serialized, 'utf8');
  if (bytes > 200_000) {
    return { ok: false, error: 'Payload de inteligência excede o limite de 200 KB' };
  }

  for (const [key, expected] of [
    ['companyProfile', 'object'],
    ['agentConfig', 'object'],
    ['catalog', 'array'],
    ['documents', 'array'],
  ] as const) {
    if (bundle[key] === undefined) continue;
    const valid = expected === 'array'
      ? Array.isArray(bundle[key])
      : Boolean(bundle[key] && typeof bundle[key] === 'object' && !Array.isArray(bundle[key]));
    if (!valid) return { ok: false, error: `Campo ${key} possui formato inválido` };
  }
  if (bundle.schemaVersion !== undefined
    && (typeof bundle.schemaVersion !== 'string' || bundle.schemaVersion.trim().length > 32)) {
    return { ok: false, error: 'schemaVersion inválido' };
  }
  return { ok: true, bundle, bytes };
}

interface AgentPublishReadiness {
  missing: string[];
  connectedChannels: number;
}

/**
 * A runtime toggle is not a business profile. Before allowing autonomous
 * publication, prove that the prompt has a real identity, offer, hours,
 * booking destination and at least one connected WhatsApp channel.
 */
async function readAgentPublishReadiness(
  workspaceId: string,
  query: DatabaseQuery,
): Promise<AgentPublishReadiness> {
  const configResult = await query(
    `SELECT agent_name, business_type, services_json, working_hours, booking_url
     FROM public.workspace_agent_config
     WHERE workspace_id = $1
     LIMIT 1`,
    [workspaceId],
  );
  const base = configResult.rows[0] as Record<string, unknown> | undefined;
  let bundle: Record<string, unknown> = {};
  try {
    const bundleResult = await query(
      `SELECT bundle FROM public.workspace_intelligence_bundles WHERE workspace_id = $1 LIMIT 1`,
      [workspaceId],
    );
    bundle = asObject(bundleResult.rows[0]?.bundle);
  } catch {
    // The optional intelligence table is not required when the base profile
    // is complete; a missing table remains visible to deployment preflight.
    bundle = {};
  }

  const profile = asObject(bundle.companyProfile);
  const agentConfig = asObject(bundle.agentConfig);
  const catalog = Array.isArray(bundle.catalog) ? bundle.catalog : [];
  const services = Array.isArray(base?.services_json) ? base.services_json : [];
  const publishedServices = catalog.length > 0 ? catalog : services;
  const hours = profile.businessHours ?? base?.working_hours;
  const bookingUrl = profile.bookingUrl
    ?? agentConfig.bookingUrl
    ?? bundle.bookingUrl
    ?? base?.booking_url;

  const channelResult = await query(
    `SELECT COUNT(*)::int AS connected_channels
     FROM public.channel_connections
     WHERE workspace_id = $1
       AND provider IN ('meta_cloud', 'waha')
       AND status = 'CONNECTED'`,
    [workspaceId],
  );
  const connectedChannels = Number(channelResult.rows[0]?.connected_channels || 0);
  const missing: string[] = [];
  if (!nonBlank(agentConfig.name) && (!nonBlank(base?.agent_name) || base?.agent_name === 'Assistente')) {
    missing.push('identidade do agente');
  }
  if (!nonBlank(profile.segment) && !nonBlank(base?.business_type)) missing.push('segmento da empresa');
  if (publishedServices.length === 0) missing.push('pelo menos um serviço/produto');
  if (!hasPublishedHours(hours)) missing.push('horário de atendimento');
  if (!nonBlank(bookingUrl)) missing.push('link de agendamento');
  if (connectedChannels === 0) missing.push('um canal WhatsApp conectado');

  return { missing, connectedChannels };
}

async function readWorkspaceAgentRuntimeConfig(
  workspaceId: string,
  query: DatabaseQuery = defaultDatabaseQuery,
): Promise<WorkspaceAgentRuntimeConfig> {
  const result = await query(
    `SELECT autonomy_mode, runtime_enabled, responder_mode, meta_agent_id,
            meta_agent_channel_connection_id,
            meta_agent_enabled, meta_agent_eligibility_status, meta_agent_checked_at,
            meta_agent_activation_status, meta_agent_onboarding_started_at,
            meta_agent_ready_at, meta_agent_last_error,
            behavior_config, published_at, published_by
     FROM public.workspace_agent_config
     WHERE workspace_id = $1`,
    [workspaceId]
  );

  if (result.rows.length === 0) {
    return {
      autonomyMode: 'copilot_supervised',
      runtimeEnabled: false,
      responderMode: 'sos_sales',
      metaAgentId: null,
      metaAgentChannelConnectionId: null,
      metaAgentEnabled: false,
      metaAgentEligibilityStatus: 'UNKNOWN',
      metaAgentCheckedAt: null,
      metaAgentActivationStatus: 'NOT_STARTED',
      metaAgentOnboardingStartedAt: null,
      metaAgentReadyAt: null,
      metaAgentLastError: null,
      behaviorConfig: {},
      publishedAt: null,
      publishedBy: null,
    };
  }

  const row = result.rows[0];
  return {
    autonomyMode: autonomyModeSchema.safeParse(row.autonomy_mode).success
      ? row.autonomy_mode
      : 'copilot_supervised',
    runtimeEnabled: row.runtime_enabled === true,
    responderMode: responderModeSchema.safeParse(row.responder_mode).success
      ? row.responder_mode
      : 'sos_sales',
    metaAgentId: row.meta_agent_id ? String(row.meta_agent_id) : null,
    metaAgentChannelConnectionId: row.meta_agent_channel_connection_id
      ? String(row.meta_agent_channel_connection_id)
      : null,
    metaAgentEnabled: row.meta_agent_enabled === true,
    metaAgentEligibilityStatus: row.meta_agent_eligibility_status === 'ELIGIBLE'
      || row.meta_agent_eligibility_status === 'INELIGIBLE'
      ? row.meta_agent_eligibility_status
      : 'UNKNOWN',
    metaAgentCheckedAt: row.meta_agent_checked_at ? new Date(row.meta_agent_checked_at).toISOString() : null,
    metaAgentActivationStatus: row.meta_agent_activation_status === 'PENDING'
      || row.meta_agent_activation_status === 'READY'
      || row.meta_agent_activation_status === 'FAILED'
      ? row.meta_agent_activation_status
      : 'NOT_STARTED',
    metaAgentOnboardingStartedAt: row.meta_agent_onboarding_started_at ? new Date(row.meta_agent_onboarding_started_at).toISOString() : null,
    metaAgentReadyAt: row.meta_agent_ready_at ? new Date(row.meta_agent_ready_at).toISOString() : null,
    metaAgentLastError: row.meta_agent_last_error ? String(row.meta_agent_last_error) : null,
    behaviorConfig: row.behavior_config && typeof row.behavior_config === 'object'
      ? row.behavior_config
      : {},
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    publishedBy: row.published_by ? String(row.published_by) : null,
  };
}

function isRuntimeAvailable(config: WorkspaceAgentRuntimeConfig): boolean {
  return config.runtimeEnabled
    && config.autonomyMode === 'autonomous_24_7'
    && Boolean(config.publishedAt)
    && isProviderConfigured();
}

function isProviderConfigured(): boolean {
  const enabled = process.env.RECEPTIONIST_ENABLED?.trim().toLowerCase() === 'true';
  const apiKey = process.env.NVIDIA_API_KEY?.trim() || '';
  const baseUrl = process.env.NVIDIA_NIM_BASE_URL?.trim() || 'https://integrate.api.nvidia.com/v1';
  const model = process.env.NVIDIA_NIM_MODEL?.trim() || 'meta/llama-3.1-70b-instruct';
  let validBaseUrl = false;
  try {
    validBaseUrl = new URL(baseUrl).protocol === 'https:';
  } catch {
    validBaseUrl = false;
  }
  return enabled && apiKey.startsWith('nvapi-') && validBaseUrl && model.length > 0;
}

function isMetaAgentReady(config: WorkspaceAgentRuntimeConfig): boolean {
  return isMetaAgentReadyPolicy({
    metaAgentEnabled: config.metaAgentEnabled,
    metaAgentId: config.metaAgentId,
    metaAgentEligibilityStatus: config.metaAgentEligibilityStatus,
    metaAgentCheckedAt: config.metaAgentCheckedAt,
    metaAgentActivationStatus: config.metaAgentActivationStatus,
  });
}

function isRuntimeEffective(config: WorkspaceAgentRuntimeConfig): boolean {
  const metaOwnsByDefault = config.responderMode === 'auto_fallback' && isMetaAgentReady(config);
  return isRuntimeAvailable(config)
    && !metaOwnsByDefault
    && config.responderMode !== 'manual'
    && config.responderMode !== 'meta_business_agent';
}

function isJourneyRuntimeEffective(
  config: WorkspaceAgentRuntimeConfig,
  responderOwner: ResponderOwner,
  responderChangedAt: string | Date | null,
  responderChangeReason?: string | null,
  journeyChannelConnectionId?: string | null,
): boolean {
  const metaChannelMatches = !config.metaAgentChannelConnectionId
    || !journeyChannelConnectionId
    || config.metaAgentChannelConnectionId === journeyChannelConnectionId;
  if (responderOwner === 'meta_business_agent' && !metaChannelMatches) return false;
  return isRuntimeAvailable(config) && shouldSosSalesRespond({
    responderMode: config.responderMode as ResponderMode,
    responderOwner,
    responderChangedAt,
    responderChangeReason,
    metaAgentEnabled: config.metaAgentEnabled && metaChannelMatches,
    metaAgentId: config.metaAgentId,
    metaAgentEligibilityStatus: config.metaAgentEligibilityStatus,
    metaAgentActivationStatus: config.metaAgentActivationStatus,
  });
}

export interface AgentRoutesOptions {
  authenticator?: OperatorAuthenticator;
  workspaceDirectory?: WorkspaceDirectory;
  /** Deployment-owned pool query; avoids the development singleton in production. */
  query?: DatabaseQuery;
}

export const agentRoutes: FastifyPluginAsync<AgentRoutesOptions> = async (app: FastifyInstance, options = {}) => {
  const query = options.query ?? defaultDatabaseQuery;
  // Enforce JWT on all agent bot routes
  app.addHook('onRequest', async (request, reply) => {
    if (!options?.authenticator) {
      return unauthorized(reply, 'Authenticator is required');
    }
    const actor = await verifyOperatorAuth(request, reply, options.authenticator);
    if (!actor) return;
  });

  app.addHook('preHandler', async (request, reply) => {
    const params = request.params as { workspaceId?: string };
    const query = request.query as { workspaceId?: string };
    const body = request.body as { workspaceId?: string };
    const targetWs = params?.workspaceId || query?.workspaceId || body?.workspaceId;

    if (targetWs && request.operatorActor) {
      const isOwnerMutation = (
        request.url.includes('/agent/config')
        || request.url.includes('/intelligence')
        || request.url.includes('/knowledge-docs')
      ) && request.method !== 'GET' && request.method !== 'HEAD';
      const requiredRole = isOwnerMutation
        ? 'owner'
        : request.method === 'GET' || request.method === 'HEAD'
          ? 'viewer'
          : 'operator';
      const allowed = await assertTenantAccess(
        request,
        reply,
        targetWs,
        request.operatorActor,
        options.workspaceDirectory,
        requiredRole
      );
      if (!allowed) return;
    }
  });

  /**
   * Backend source of truth for the workspace-wide AI runtime switch and the
   * behavior configuration published by an administrator.
   */
  app.get<{ Params: { workspaceId: string } }>(
    '/api/v1/workspaces/:workspaceId/agent/config',
    async (request, reply) => {
      const workspaceId = normalizeWorkspaceUuid(request.params.workspaceId);
      if (!workspaceId) return reply.status(404).send({ error: 'Workspace not found' });

      try {
        const config = await readWorkspaceAgentRuntimeConfig(workspaceId, query);
        return reply.status(200).send({
          ...config,
          runtimeEffective: isRuntimeEffective(config),
          providerConfigured: isProviderConfigured(),
          metaAgentReady: isMetaAgentReady(config),
        });
      } catch (err) {
        request.log.error({ err }, 'Error fetching workspace agent config');
        return reply.status(503).send({ error: 'Workspace agent configuration unavailable' });
      }
    }
  );

  app.put<{ Params: { workspaceId: string }; Body: unknown }>(
    '/api/v1/workspaces/:workspaceId/agent/config',
    async (request, reply) => {
      const workspaceId = normalizeWorkspaceUuid(request.params.workspaceId);
      if (!workspaceId) return reply.status(404).send({ error: 'Workspace not found' });

      const parsed = agentConfigUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Invalid agent configuration',
          details: parsed.error.flatten(),
        });
      }

      const actorId = request.operatorActor?.userId;
      if (!actorId) return reply.status(401).send({ error: 'Unauthorized' });

      const { autonomyMode, runtimeEnabled, responderMode, behaviorConfig } = parsed.data;
      try {
        const currentRuntime = await readWorkspaceAgentRuntimeConfig(workspaceId, query);
        const desiredAutonomyMode = autonomyMode ?? currentRuntime.autonomyMode;
        const desiredRuntimeEnabled = runtimeEnabled ?? currentRuntime.runtimeEnabled;

        if (desiredRuntimeEnabled && desiredAutonomyMode === 'autonomous_24_7') {
          if (!isProviderConfigured()) {
            return reply.status(409).send({
              error: 'O provedor de IA não está configurado no runtime de produção.',
              code: 'AI_PROVIDER_NOT_CONFIGURED',
            });
          }
          const readiness = await readAgentPublishReadiness(workspaceId, query);
          if (readiness.missing.length > 0) {
            return reply.status(422).send({
              error: 'Complete o perfil comercial antes de publicar o atendimento autônomo.',
              code: 'AGENT_PROFILE_INCOMPLETE',
              missing: readiness.missing,
            });
          }
        }
        if (responderMode === 'meta_business_agent') {
          const metaReady = isMetaAgentReady(currentRuntime);
          if (!metaReady) {
            return reply.status(409).send({
              error: 'O Meta Business Agent ainda não está elegível e ativado para este workspace.',
              code: 'META_BUSINESS_AGENT_NOT_READY',
            });
          }
        }
        await query(
          `INSERT INTO public.workspace_agent_config (
             workspace_id, autonomy_mode, runtime_enabled, responder_mode, behavior_config,
             published_at, published_by, updated_at
           ) VALUES (
             $1,
             COALESCE($2, 'copilot_supervised'),
             COALESCE($3, false),
             COALESCE($4, 'sos_sales'),
             COALESCE($5::jsonb, '{}'::jsonb),
             NOW(), $6, NOW()
           )
           ON CONFLICT (workspace_id) DO UPDATE SET
             autonomy_mode = COALESCE($2, workspace_agent_config.autonomy_mode),
             runtime_enabled = COALESCE($3, workspace_agent_config.runtime_enabled),
             responder_mode = COALESCE($4, workspace_agent_config.responder_mode),
             behavior_config = COALESCE($5::jsonb, workspace_agent_config.behavior_config),
             published_at = NOW(),
             published_by = $6,
             updated_at = NOW()`,
          [
            workspaceId,
            autonomyMode ?? null,
            runtimeEnabled ?? null,
            responderMode ?? null,
            behaviorConfig ? JSON.stringify(behaviorConfig) : null,
            actorId,
          ]
        );

        const config = await readWorkspaceAgentRuntimeConfig(workspaceId, query);
        const desiredOwner: ResponderOwner = config.responderMode === 'manual'
          ? 'human'
          : isMetaAgentReady(config)
            && (config.responderMode === 'meta_business_agent' || config.responderMode === 'auto_fallback')
            ? 'meta_business_agent'
            : 'sos_sales';
        // Configuration is workspace-wide. Reconcile journeys still following
        // the old default, but preserve explicit per-thread takeovers.
        await query(
          `UPDATE public.commercial_journeys
           SET responder_owner = $2,
               responder_changed_at = NOW(),
               responder_change_reason = 'workspace_agent_config_published',
               updated_at = NOW()
           WHERE workspace_id = $1
             AND responder_owner <> 'human'
             AND COALESCE(responder_change_reason, '') NOT LIKE 'meta_thread_control_%'
             AND COALESCE(responder_change_reason, '') NOT LIKE '%operator%'
             AND COALESCE(responder_change_reason, '') NOT LIKE '%human%'`,
          [workspaceId, desiredOwner],
        );
        return reply.status(200).send({
          success: true,
          ...config,
          runtimeEffective: isRuntimeEffective(config),
          providerConfigured: isProviderConfigured(),
          metaAgentReady: isMetaAgentReady(config),
        });
      } catch (err) {
        request.log.error({ err }, 'Error publishing workspace agent config');
        return reply.status(503).send({ error: 'Workspace agent configuration could not be published' });
      }
    }
  );

  /**
   * GET /api/v1/workspaces/:workspaceId/journeys/:journeyId/bot/status
   * Retorna o estado completo do bot para a jornada:
   * - botEnabled: operador habilitou o bot nesta jornada (freio principal)
   * - botPaused: humano está atendendo temporariamente (freio secundário)
   * - botActive: true somente quando enabled/paused, runtime publicado e
   *   owner da conversa permitem que a IA própria responda
   */
  app.get<{ Params: BotParams }>(
    '/api/v1/workspaces/:workspaceId/journeys/:journeyId/bot/status',
    async (request: FastifyRequest<{ Params: BotParams }>, reply: FastifyReply) => {
      const workspaceId = normalizeWorkspaceUuid(request.params.workspaceId);
      const { journeyId } = request.params;

      try {
        const result = await query(
           `SELECT id, channel_connection_id, bot_enabled, bot_paused_at, bot_pause_reason, pipeline_stage,
                  responder_owner, responder_changed_at, responder_change_reason
           FROM public.commercial_journeys
           WHERE id = $1 AND workspace_id = $2`,
          [journeyId, workspaceId]
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({ error: 'Journey not found' });
        }

        const journey = result.rows[0];
        const botEnabled: boolean = journey.bot_enabled === true;
        const botPaused: boolean = !!journey.bot_paused_at;
        const responderOwner: ResponderOwner = journey.responder_owner === 'meta_business_agent'
          || journey.responder_owner === 'human'
          ? journey.responder_owner
          : 'sos_sales';
        const responderChangedAt = journey.responder_changed_at || null;
        const responderChangeReason = journey.responder_change_reason || null;
        const runtimeConfig = await readWorkspaceAgentRuntimeConfig(workspaceId!, query);
        const botActive: boolean = botEnabled
          && !botPaused
          && isJourneyRuntimeEffective(runtimeConfig, responderOwner, responderChangedAt, responderChangeReason, journey.channel_connection_id);

        return reply.status(200).send({
          journeyId,
          botEnabled,
          botPaused,
          botActive,
          pausedAt: journey.bot_paused_at || null,
          pauseReason: journey.bot_pause_reason || null,
          pipelineStage: journey.pipeline_stage,
          responderOwner,
          responderChangedAt,
          responderChangeReason,
          engine: 'nvidia_nim',
          model: process.env.NVIDIA_NIM_MODEL || 'meta/llama-3.1-70b-instruct',
          receptionistEnabled: process.env.RECEPTIONIST_ENABLED === 'true',
          autonomyMode: runtimeConfig.autonomyMode,
          workspaceRuntimeEnabled: runtimeConfig.runtimeEnabled,
          runtimeEffective: isRuntimeEffective(runtimeConfig),
          responderMode: runtimeConfig.responderMode,
          metaAgentId: runtimeConfig.metaAgentId,
          metaAgentChannelConnectionId: runtimeConfig.metaAgentChannelConnectionId,
          metaAgentEnabled: runtimeConfig.metaAgentEnabled,
          metaAgentEligibilityStatus: runtimeConfig.metaAgentEligibilityStatus,
          metaAgentActivationStatus: runtimeConfig.metaAgentActivationStatus,
          metaAgentOnboardingStartedAt: runtimeConfig.metaAgentOnboardingStartedAt,
          metaAgentReadyAt: runtimeConfig.metaAgentReadyAt,
          metaAgentLastError: runtimeConfig.metaAgentLastError,
          metaAgentReady: isMetaAgentReady(runtimeConfig),
        });
      } catch (err) {
        request.log.error({ err }, 'Error fetching bot status');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  /**
   * POST /api/v1/workspaces/:workspaceId/journeys/:journeyId/bot/enable
   * Habilita o bot nesta jornada (freio principal ON).
   * Operador está dizendo: "quero atendimento automático aqui".
   */
  app.post<{ Params: BotParams }>(
    '/api/v1/workspaces/:workspaceId/journeys/:journeyId/bot/enable',
    async (request: FastifyRequest<{ Params: BotParams }>, reply: FastifyReply) => {
      const workspaceId = normalizeWorkspaceUuid(request.params.workspaceId);
      const { journeyId } = request.params;

      try {
        const result = await query(
          `UPDATE public.commercial_journeys
           SET bot_enabled = true, bot_paused_at = NULL, bot_pause_reason = NULL, updated_at = NOW()
           WHERE id = $1 AND workspace_id = $2
           RETURNING id, channel_connection_id, bot_enabled, responder_owner, responder_changed_at, responder_change_reason`,
          [journeyId, workspaceId]
        );

        if (result.rowCount === 0) {
          return reply.status(404).send({ error: 'Journey not found' });
        }

        const runtimeConfig = await readWorkspaceAgentRuntimeConfig(workspaceId!, query);
        const runtimeEffective = isRuntimeEffective(runtimeConfig);
        const responderOwner: ResponderOwner = result.rows[0].responder_owner === 'meta_business_agent'
          || result.rows[0].responder_owner === 'human'
          ? result.rows[0].responder_owner
          : 'sos_sales';
        const responderChangedAt = result.rows[0].responder_changed_at || null;
        const responderChangeReason = result.rows[0].responder_change_reason || null;
        const botActive = isJourneyRuntimeEffective(runtimeConfig, responderOwner, responderChangedAt, responderChangeReason, result.rows[0].channel_connection_id);

        return reply.status(200).send({
          journeyId,
          botEnabled: true,
          botPaused: false,
          botActive,
          responderOwner,
          responderChangedAt,
          responderChangeReason,
          autonomyMode: runtimeConfig.autonomyMode,
          workspaceRuntimeEnabled: runtimeConfig.runtimeEnabled,
          runtimeEffective,
          message: botActive
            ? 'Bot habilitado. Atendimento automático 24/7 ativo.'
            : responderOwner === 'meta_business_agent'
              ? 'Jornada habilitada, mas o Meta Business Agent é o responsável desta conversa.'
              : responderOwner === 'human'
                ? 'Jornada habilitada, mas o atendimento automático está em modo manual.'
            : 'Bot habilitado para a jornada, mas o runtime autônomo do workspace está desativado.',
        });
      } catch (err) {
        request.log.error({ err }, 'Error enabling bot');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  /**
   * POST /api/v1/workspaces/:workspaceId/journeys/:journeyId/bot/disable
   * Desabilita o bot nesta jornada (freio principal OFF).
   * Operador está dizendo: "não quero mais bot automático aqui".
   */
  app.post<{ Params: BotParams }>(
    '/api/v1/workspaces/:workspaceId/journeys/:journeyId/bot/disable',
    async (request: FastifyRequest<{ Params: BotParams }>, reply: FastifyReply) => {
      const workspaceId = normalizeWorkspaceUuid(request.params.workspaceId);
      const { journeyId } = request.params;

      try {
        const result = await query(
          `UPDATE public.commercial_journeys
           SET bot_enabled = false, bot_paused_at = NULL, bot_pause_reason = NULL, updated_at = NOW()
           WHERE id = $1 AND workspace_id = $2
           RETURNING id, bot_enabled, responder_owner, responder_changed_at, responder_change_reason`,
          [journeyId, workspaceId]
        );

        if (result.rowCount === 0) {
          return reply.status(404).send({ error: 'Journey not found' });
        }

        return reply.status(200).send({
          journeyId,
          botEnabled: false,
          botPaused: false,
          botActive: false,
          message: '🟢 → 🔴 Bot desabilitado. Nenhum outbound automático.',
        });
      } catch (err) {
        request.log.error({ err }, 'Error disabling bot');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  /**
   * POST /api/v1/workspaces/:workspaceId/journeys/:journeyId/bot/pause
   * Pausa o bot — humano assume o atendimento (freio secundário).
   * Bot continua habilitado (bot_enabled=true), apenas pausado temporariamente.
   */
  app.post<{ Params: BotParams; Body: { reason?: string } }>(
    '/api/v1/workspaces/:workspaceId/journeys/:journeyId/bot/pause',
    async (request: FastifyRequest<{ Params: BotParams; Body: { reason?: string } }>, reply: FastifyReply) => {
      const workspaceId = normalizeWorkspaceUuid(request.params.workspaceId);
      const { journeyId } = request.params;
      const reason = (request.body as { reason?: string })?.reason || 'Pausado manualmente pelo operador';

      try {
        const result = await query(
          `UPDATE public.commercial_journeys
           SET bot_paused_at = NOW(), bot_pause_reason = $3, updated_at = NOW()
           WHERE id = $1 AND workspace_id = $2
           RETURNING id, bot_enabled, bot_paused_at, bot_pause_reason`,
          [journeyId, workspaceId, reason]
        );

        if (result.rowCount === 0) {
          return reply.status(404).send({ error: 'Journey not found' });
        }

        return reply.status(200).send({
          journeyId,
          botEnabled: result.rows[0].bot_enabled,
          botPaused: true,
          botActive: false,
          pausedAt: result.rows[0].bot_paused_at,
          pauseReason: result.rows[0].bot_pause_reason,
          message: '🟢 → 🟡 Bot pausado. Atendimento humano ativado.',
        });
      } catch (err) {
        request.log.error({ err }, 'Error pausing bot');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  /**
   * POST /api/v1/workspaces/:workspaceId/journeys/:journeyId/bot/resume
   * Retoma o bot após pausa humana (freio secundário OFF).
   * Só faz efeito se bot_enabled=true.
   */
  app.post<{ Params: BotParams }>(
    '/api/v1/workspaces/:workspaceId/journeys/:journeyId/bot/resume',
    async (request: FastifyRequest<{ Params: BotParams }>, reply: FastifyReply) => {
      const workspaceId = normalizeWorkspaceUuid(request.params.workspaceId);
      const { journeyId } = request.params;

      try {
        const result = await query(
          `UPDATE public.commercial_journeys
           SET bot_paused_at = NULL, bot_pause_reason = NULL, updated_at = NOW()
           WHERE id = $1 AND workspace_id = $2
           RETURNING id, channel_connection_id, bot_enabled, responder_owner, responder_changed_at`,
          [journeyId, workspaceId]
        );

        if (result.rowCount === 0) {
          return reply.status(404).send({ error: 'Journey not found' });
        }

        const botEnabled: boolean = result.rows[0].bot_enabled === true;
        const runtimeConfig = await readWorkspaceAgentRuntimeConfig(workspaceId!, query);
        const responderOwner: ResponderOwner = result.rows[0].responder_owner === 'meta_business_agent'
          || result.rows[0].responder_owner === 'human'
          ? result.rows[0].responder_owner
          : 'sos_sales';
        const responderChangedAt = result.rows[0].responder_changed_at || null;
        const responderChangeReason = result.rows[0].responder_change_reason || null;
        const botActive = botEnabled && isJourneyRuntimeEffective(runtimeConfig, responderOwner, responderChangedAt, responderChangeReason, result.rows[0].channel_connection_id);
        return reply.status(200).send({
          journeyId,
          botEnabled,
          botPaused: false,
          botActive,
          autonomyMode: runtimeConfig.autonomyMode,
          workspaceRuntimeEnabled: runtimeConfig.runtimeEnabled,
          runtimeEffective: isRuntimeEffective(runtimeConfig),
          responderOwner,
          responderChangedAt,
          responderChangeReason,
          message: botActive
            ? 'Bot retomado. Atendimento automático ativo.'
            : botEnabled
              ? 'Pausa removida, mas o runtime autônomo do workspace está desativado.'
              : 'Pausa removida. Bot ainda desabilitado para a jornada.',
        });
      } catch (err) {
        request.log.error({ err }, 'Error resuming bot');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  /**
   * GET /api/v1/workspaces/:workspaceId/intelligence
   * Retorna o bundle completo de inteligência do workspace (Perfil, Especialistas, Catálogo, Guardrails).
   */
  app.get<{ Params: { workspaceId: string } }>(
    '/api/v1/workspaces/:workspaceId/intelligence',
    async (request, reply) => {
      const workspaceId = normalizeWorkspaceUuid(request.params.workspaceId);
      if (!workspaceId) return reply.status(404).send({ error: 'Workspace not found' });

      try {
        const result = await query(
          `SELECT bundle, schema_version, published_at, published_by, updated_at
             FROM public.workspace_intelligence_bundles
            WHERE workspace_id = $1`,
          [workspaceId]
        );

        if (result.rows.length === 0) {
          return reply.status(200).send({
            workspaceId,
            bundle: null,
            isDefault: true,
            schemaVersion: null,
            publishedAt: null,
            publishedBy: null,
          });
        }

        return reply.status(200).send({
          workspaceId,
          bundle: result.rows[0].bundle,
          updatedAt: result.rows[0].updated_at,
          schemaVersion: result.rows[0].schema_version || null,
          publishedAt: result.rows[0].published_at || null,
          publishedBy: result.rows[0].published_by || null,
          isDefault: false,
        });
      } catch (err) {
        request.log.error({ err }, 'Error fetching workspace intelligence bundle');
        return reply.status(500).send({ error: 'Falha ao buscar inteligência do workspace' });
      }
    }
  );

  /**
   * PUT /api/v1/workspaces/:workspaceId/intelligence
   * Salva o bundle de inteligência do workspace no PostgreSQL.
   */
  app.put<{ Params: { workspaceId: string }; Body: { bundle: Record<string, unknown> } }>(
    '/api/v1/workspaces/:workspaceId/intelligence',
    async (request, reply) => {
      const workspaceId = normalizeWorkspaceUuid(request.params.workspaceId);
      if (!workspaceId) return reply.status(404).send({ error: 'Workspace not found' });

      const bundle = (request.body as any)?.bundle || request.body;
      const validatedBundle = validateIntelligenceBundle(bundle);
      if (!validatedBundle.ok) return reply.status(400).send({ error: validatedBundle.error, code: 'INTELLIGENCE_BUNDLE_INVALID' });
      const actorId = request.operatorActor?.userId;
      if (!actorId) return reply.status(401).send({ error: 'Unauthorized' });

      try {
        await query(
          `INSERT INTO public.workspace_intelligence_bundles (
             workspace_id, bundle, schema_version, published_at, published_by, updated_at
           ) VALUES ($1, $2::jsonb, $3, NOW(), $4, NOW())
           ON CONFLICT (workspace_id) DO UPDATE SET
             bundle = $2::jsonb,
             schema_version = $3,
             published_at = NOW(),
             published_by = $4,
             updated_at = NOW()`,
          [
            workspaceId,
            JSON.stringify(validatedBundle.bundle),
            typeof validatedBundle.bundle.schemaVersion === 'string' && validatedBundle.bundle.schemaVersion.trim()
              ? validatedBundle.bundle.schemaVersion.trim()
              : '1.0',
            actorId,
          ]
        );

        return reply.status(200).send({
          success: true,
          workspaceId,
          schemaVersion: typeof validatedBundle.bundle.schemaVersion === 'string' && validatedBundle.bundle.schemaVersion.trim()
            ? validatedBundle.bundle.schemaVersion.trim()
            : '1.0',
          publishedAt: new Date().toISOString(),
          message: 'Inteligência comercial do agente salva com sucesso!',
        });
      } catch (err) {
        request.log.error({ err }, 'Error saving workspace intelligence bundle');
        return reply.status(500).send({ error: 'Falha ao salvar inteligência do workspace' });
      }
    }
  );

  /**
   * GET /api/v1/workspaces/:workspaceId/intelligence/diagnosis
   * Returns only facts that can be calculated from persisted messages. There
   * is intentionally no seeded "historical analysis" or synthetic KPI.
   */
  app.get<{ Params: { workspaceId: string } }>(
    '/api/v1/workspaces/:workspaceId/intelligence/diagnosis',
    async (request, reply) => {
      const workspaceId = normalizeWorkspaceUuid(request.params.workspaceId);
      if (!workspaceId) return reply.status(404).send({ error: 'Workspace not found' });

      try {
        const result = await query(
          `SELECT
             COUNT(*)::int AS total_messages,
             COUNT(*) FILTER (WHERE direction = 'inbound')::int AS inbound_messages,
             COUNT(*) FILTER (WHERE direction = 'outbound')::int AS outbound_messages,
             COUNT(*) FILTER (
               WHERE EXTRACT(HOUR FROM sent_at AT TIME ZONE 'America/Sao_Paulo') >= 20
                  OR EXTRACT(HOUR FROM sent_at AT TIME ZONE 'America/Sao_Paulo') < 9
             )::int AS out_of_hours_messages,
             COUNT(*) FILTER (WHERE media_payload IS NOT NULL AND media_payload <> '{}'::jsonb)::int AS media_messages,
             MIN(sent_at) AS first_message_at,
             MAX(sent_at) AS last_message_at
           FROM public.conversation_messages
           WHERE workspace_id = $1`,
          [workspaceId],
        );
        const row = result.rows[0] || {};
        return reply.status(200).send({
          workspaceId,
          hasData: Number(row.total_messages || 0) > 0,
          totalMessages: Number(row.total_messages || 0),
          inboundMessages: Number(row.inbound_messages || 0),
          outboundMessages: Number(row.outbound_messages || 0),
          outOfHoursMessages: Number(row.out_of_hours_messages || 0),
          mediaMessages: Number(row.media_messages || 0),
          firstMessageAt: row.first_message_at || null,
          lastMessageAt: row.last_message_at || null,
        });
      } catch (err) {
        request.log.error({ err }, 'Error fetching persisted intelligence diagnosis');
        return reply.status(503).send({ error: 'Diagnóstico histórico indisponível' });
      }
    },
  );

  /**
   * GET /api/v1/workspaces/:workspaceId/knowledge-docs
   * Lista documentos da base de conhecimento do workspace.
   */
  app.get<{ Params: { workspaceId: string } }>(
    '/api/v1/workspaces/:workspaceId/knowledge-docs',
    async (request, reply) => {
      const workspaceId = normalizeWorkspaceUuid(request.params.workspaceId);
      if (!workspaceId) return reply.status(404).send({ error: 'Workspace not found' });

      try {
        const result = await query(
          `SELECT id, workspace_id, title, category, file_name, file_size, chunks_count, status, created_at, updated_at
           FROM public.workspace_knowledge_documents
           WHERE workspace_id = $1
           ORDER BY created_at DESC`,
          [workspaceId]
        );

        return reply.status(200).send({
          success: true,
          workspaceId,
          documents: result.rows,
        });
      } catch (err) {
        request.log.error({ err }, 'Error listing knowledge documents');
        return reply.status(500).send({ error: 'Falha ao listar documentos da base de conhecimento' });
      }
    }
  );

  /**
   * POST /api/v1/workspaces/:workspaceId/knowledge-docs
   * Cria ou adiciona novo documento à base de conhecimento.
   */
  app.post<{ Params: { workspaceId: string }; Body: any }>(
    '/api/v1/workspaces/:workspaceId/knowledge-docs',
    async (request, reply) => {
      const workspaceId = normalizeWorkspaceUuid(request.params.workspaceId);
      if (!workspaceId) return reply.status(404).send({ error: 'Workspace not found' });

      const parsed = z.object({
        title: z.string().trim().min(1).max(240),
        category: z.string().trim().min(1).max(80),
        content: z.string().trim().min(1).max(500_000),
        fileName: z.string().trim().max(240).optional(),
        fileSize: z.string().trim().max(40).optional(),
        chunksCount: z.number().int().min(0).max(10_000).optional(),
      }).strict().safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Documento inválido: título, categoria e conteúdo não podem ficar vazios.' });
      }

      const { title, category, content, fileName, fileSize } = parsed.data;
      const chunksCount = parsed.data.chunksCount ?? Math.max(1, Math.ceil(content.length / 300));

      try {
        const result = await query(
          `INSERT INTO public.workspace_knowledge_documents (
             id, workspace_id, title, category, content, file_name, file_size, chunks_count, status, created_at, updated_at
           ) VALUES (
             gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'ready', NOW(), NOW()
           ) RETURNING *`,
          [workspaceId, title, category, content, fileName || null, fileSize || null, chunksCount]
        );

        return reply.status(201).send({
          success: true,
          document: result.rows[0],
        });
      } catch (err) {
        request.log.error({ err }, 'Error creating knowledge document');
        return reply.status(500).send({ error: 'Falha ao criar documento na base de conhecimento' });
      }
    }
  );

  /**
   * DELETE /api/v1/workspaces/:workspaceId/knowledge-docs/:docId
   */
  app.delete<{ Params: { workspaceId: string; docId: string } }>(
    '/api/v1/workspaces/:workspaceId/knowledge-docs/:docId',
    async (request, reply) => {
      const workspaceId = normalizeWorkspaceUuid(request.params.workspaceId);
      const { docId } = request.params;

      try {
        const result = await query(
          `DELETE FROM public.workspace_knowledge_documents WHERE id = $1 AND workspace_id = $2`,
          [docId, workspaceId]
        );

        if (result.rowCount !== 1) {
          return reply.status(404).send({ error: 'Documento não encontrado neste workspace.' });
        }

        return reply.status(200).send({ success: true, message: 'Documento removido com sucesso' });
      } catch (err) {
        request.log.error({ err }, 'Error deleting knowledge document');
        return reply.status(500).send({ error: 'Falha ao remover documento' });
      }
    }
  );
};
