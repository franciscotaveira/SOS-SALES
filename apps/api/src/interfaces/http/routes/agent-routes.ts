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
  metaAgentEnabled: boolean;
  metaAgentEligibilityStatus: 'ELIGIBLE' | 'INELIGIBLE' | 'UNKNOWN';
  metaAgentCheckedAt: string | null;
  behaviorConfig: Record<string, unknown>;
  publishedAt: string | null;
  publishedBy: string | null;
}

async function readWorkspaceAgentRuntimeConfig(workspaceId: string): Promise<WorkspaceAgentRuntimeConfig> {
  const result = await dbPool.query(
    `SELECT autonomy_mode, runtime_enabled, responder_mode, meta_agent_id,
            meta_agent_enabled, meta_agent_eligibility_status, meta_agent_checked_at,
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
      metaAgentEnabled: false,
      metaAgentEligibilityStatus: 'UNKNOWN',
      metaAgentCheckedAt: null,
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
    metaAgentEnabled: row.meta_agent_enabled === true,
    metaAgentEligibilityStatus: row.meta_agent_eligibility_status === 'ELIGIBLE'
      || row.meta_agent_eligibility_status === 'INELIGIBLE'
      ? row.meta_agent_eligibility_status
      : 'UNKNOWN',
    metaAgentCheckedAt: row.meta_agent_checked_at ? new Date(row.meta_agent_checked_at).toISOString() : null,
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
  return process.env.RECEPTIONIST_ENABLED === 'true'
    && Boolean(process.env.NVIDIA_API_KEY);
}

function isRuntimeEffective(config: WorkspaceAgentRuntimeConfig): boolean {
  const metaActivationUnknown = config.metaAgentEnabled
    && config.metaAgentEligibilityStatus === 'UNKNOWN';
  const metaOwnsByDefault = config.responderMode === 'meta_business_agent'
    || (config.responderMode === 'auto_fallback'
      && (metaActivationUnknown
        || (config.metaAgentEnabled
          && Boolean(config.metaAgentId)
          && config.metaAgentEligibilityStatus === 'ELIGIBLE')));
  return isRuntimeAvailable(config)
    && !metaOwnsByDefault
    && config.responderMode !== 'manual'
}

function isJourneyRuntimeEffective(
  config: WorkspaceAgentRuntimeConfig,
  responderOwner: ResponderOwner,
  responderChangedAt: string | Date | null,
): boolean {
  return isRuntimeAvailable(config) && shouldSosSalesRespond({
    responderMode: config.responderMode as ResponderMode,
    responderOwner,
    responderChangedAt,
    metaAgentEnabled: config.metaAgentEnabled,
    metaAgentId: config.metaAgentId,
    metaAgentEligibilityStatus: config.metaAgentEligibilityStatus,
  });
}

export interface AgentRoutesOptions {
  authenticator?: OperatorAuthenticator;
  workspaceDirectory?: WorkspaceDirectory;
}

export const agentRoutes: FastifyPluginAsync<AgentRoutesOptions> = async (app: FastifyInstance, options = {}) => {
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
      const isAgentConfigMutation = request.url.includes('/agent/config')
        && request.method !== 'GET'
        && request.method !== 'HEAD';
      const requiredRole = isAgentConfigMutation
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
        const config = await readWorkspaceAgentRuntimeConfig(workspaceId);
        return reply.status(200).send({
          ...config,
          runtimeEffective: isRuntimeEffective(config),
          providerConfigured: isProviderConfigured(),
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
        if (responderMode === 'meta_business_agent') {
          const current = await readWorkspaceAgentRuntimeConfig(workspaceId);
          const metaReady = current.metaAgentEnabled
            && Boolean(current.metaAgentId)
            && current.metaAgentEligibilityStatus === 'ELIGIBLE';
          if (!metaReady) {
            return reply.status(409).send({
              error: 'O Meta Business Agent ainda não está elegível e ativado para este workspace.',
              code: 'META_BUSINESS_AGENT_NOT_READY',
            });
          }
        }
        await dbPool.query(
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

        const config = await readWorkspaceAgentRuntimeConfig(workspaceId);
        return reply.status(200).send({
          success: true,
          ...config,
          runtimeEffective: isRuntimeEffective(config),
          providerConfigured: process.env.RECEPTIONIST_ENABLED === 'true',
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
        const result = await dbPool.query(
          `SELECT id, bot_enabled, bot_paused_at, bot_pause_reason, pipeline_stage,
                  responder_owner, responder_changed_at
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
        const runtimeConfig = await readWorkspaceAgentRuntimeConfig(workspaceId!);
        const botActive: boolean = botEnabled
          && !botPaused
          && isJourneyRuntimeEffective(runtimeConfig, responderOwner, responderChangedAt);

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
          engine: 'nvidia_nim',
          model: process.env.NVIDIA_NIM_MODEL || 'meta/llama-3.1-70b-instruct',
          receptionistEnabled: process.env.RECEPTIONIST_ENABLED === 'true',
          autonomyMode: runtimeConfig.autonomyMode,
          workspaceRuntimeEnabled: runtimeConfig.runtimeEnabled,
          runtimeEffective: isRuntimeEffective(runtimeConfig),
          responderMode: runtimeConfig.responderMode,
          metaAgentId: runtimeConfig.metaAgentId,
          metaAgentEnabled: runtimeConfig.metaAgentEnabled,
          metaAgentEligibilityStatus: runtimeConfig.metaAgentEligibilityStatus,
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
        const result = await dbPool.query(
          `UPDATE public.commercial_journeys
           SET bot_enabled = true, bot_paused_at = NULL, bot_pause_reason = NULL, updated_at = NOW()
           WHERE id = $1 AND workspace_id = $2
           RETURNING id, bot_enabled, responder_owner, responder_changed_at`,
          [journeyId, workspaceId]
        );

        if (result.rowCount === 0) {
          return reply.status(404).send({ error: 'Journey not found' });
        }

        const runtimeConfig = await readWorkspaceAgentRuntimeConfig(workspaceId!);
        const runtimeEffective = isRuntimeEffective(runtimeConfig);
        const responderOwner: ResponderOwner = result.rows[0].responder_owner === 'meta_business_agent'
          || result.rows[0].responder_owner === 'human'
          ? result.rows[0].responder_owner
          : 'sos_sales';
        const responderChangedAt = result.rows[0].responder_changed_at || null;
        const botActive = isJourneyRuntimeEffective(runtimeConfig, responderOwner, responderChangedAt);

        return reply.status(200).send({
          journeyId,
          botEnabled: true,
          botPaused: false,
          botActive,
          responderOwner,
          responderChangedAt,
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
        const result = await dbPool.query(
          `UPDATE public.commercial_journeys
           SET bot_enabled = false, bot_paused_at = NULL, bot_pause_reason = NULL, updated_at = NOW()
           WHERE id = $1 AND workspace_id = $2
           RETURNING id, bot_enabled, responder_owner, responder_changed_at`,
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
        const result = await dbPool.query(
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
        const result = await dbPool.query(
          `UPDATE public.commercial_journeys
           SET bot_paused_at = NULL, bot_pause_reason = NULL, updated_at = NOW()
           WHERE id = $1 AND workspace_id = $2
           RETURNING id, bot_enabled, responder_owner, responder_changed_at`,
          [journeyId, workspaceId]
        );

        if (result.rowCount === 0) {
          return reply.status(404).send({ error: 'Journey not found' });
        }

        const botEnabled: boolean = result.rows[0].bot_enabled === true;
        const runtimeConfig = await readWorkspaceAgentRuntimeConfig(workspaceId!);
        const responderOwner: ResponderOwner = result.rows[0].responder_owner === 'meta_business_agent'
          || result.rows[0].responder_owner === 'human'
          ? result.rows[0].responder_owner
          : 'sos_sales';
        const responderChangedAt = result.rows[0].responder_changed_at || null;
        const botActive = botEnabled && isJourneyRuntimeEffective(runtimeConfig, responderOwner, responderChangedAt);
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
        const result = await dbPool.query(
          `SELECT bundle, updated_at FROM public.workspace_intelligence_bundles WHERE workspace_id = $1`,
          [workspaceId]
        );

        if (result.rows.length === 0) {
          return reply.status(200).send({
            workspaceId,
            bundle: null,
            isDefault: true,
          });
        }

        return reply.status(200).send({
          workspaceId,
          bundle: result.rows[0].bundle,
          updatedAt: result.rows[0].updated_at,
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
      if (!bundle || typeof bundle !== 'object') {
        return reply.status(400).send({ error: 'Payload de inteligência inválido' });
      }

      try {
        await dbPool.query(
          `INSERT INTO public.workspace_intelligence_bundles (workspace_id, bundle, updated_at)
           VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (workspace_id) DO UPDATE SET
             bundle = $2::jsonb,
             updated_at = NOW()`,
          [workspaceId, JSON.stringify(bundle)]
        );

        return reply.status(200).send({
          success: true,
          workspaceId,
          message: 'Inteligência comercial do agente salva com sucesso!',
        });
      } catch (err) {
        request.log.error({ err }, 'Error saving workspace intelligence bundle');
        return reply.status(500).send({ error: 'Falha ao salvar inteligência do workspace' });
      }
    }
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
        const result = await dbPool.query(
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

      const body = request.body as any;
      const title = body?.title || body?.fileName || 'Documento sem título';
      const category = body?.category || 'Geral';
      const content = body?.content || '';
      const fileName = body?.fileName || body?.file_name || null;
      const fileSize = body?.fileSize || body?.file_size || '100 KB';
      const chunksCount = body?.chunksCount || Math.max(1, Math.ceil((content.length || 500) / 300));

      try {
        const result = await dbPool.query(
          `INSERT INTO public.workspace_knowledge_documents (
             id, workspace_id, title, category, content, file_name, file_size, chunks_count, status, created_at, updated_at
           ) VALUES (
             gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'ready', NOW(), NOW()
           ) RETURNING *`,
          [workspaceId, title, category, content, fileName, fileSize, chunksCount]
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
        await dbPool.query(
          `DELETE FROM public.workspace_knowledge_documents WHERE id = $1 AND workspace_id = $2`,
          [docId, workspaceId]
        );

        return reply.status(200).send({ success: true, message: 'Documento removido com sucesso' });
      } catch (err) {
        request.log.error({ err }, 'Error deleting knowledge document');
        return reply.status(500).send({ error: 'Falha ao remover documento' });
      }
    }
  );
};
