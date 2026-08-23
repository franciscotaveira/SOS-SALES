/**
 * TX COMMERCIAL CORE — AGENT BOT CONTROL ROUTES
 * 
 * API para controle do agente receptionist por jornada:
 * - Pausar bot (humano assume)
 * - Retomar bot (volta ao automático)
 * - Status atual do bot
 */

import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { dbPool } from '../../../infrastructure/database/pool.js';
import { normalizeWorkspaceUuid } from './whatsapp-channel-routes.js';
import { OperatorAuthenticator } from '../../../application/ports/operator-authenticator.js';
import { WorkspaceDirectory } from '../../../application/ports/workspace-directory.js';
import { verifyOperatorAuth, assertTenantAccess, unauthorized } from '../helpers/auth-guard.js';

interface BotParams {
  workspaceId: string;
  journeyId: string;
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
      const requiredRole = request.method === 'GET' || request.method === 'HEAD'
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
   * GET /api/v1/workspaces/:workspaceId/journeys/:journeyId/bot/status
   * Retorna o estado atual do bot para a jornada
   */
  app.get<{ Params: BotParams }>(
    '/api/v1/workspaces/:workspaceId/journeys/:journeyId/bot/status',
    async (request: FastifyRequest<{ Params: BotParams }>, reply: FastifyReply) => {
      const workspaceId = normalizeWorkspaceUuid(request.params.workspaceId);
      const { journeyId } = request.params;

      try {
        const result = await dbPool.query(
          `SELECT id, bot_paused_at, bot_pause_reason, pipeline_stage
           FROM public.commercial_journeys
           WHERE id = $1 AND workspace_id = $2`,
          [journeyId, workspaceId]
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({ error: 'Journey not found' });
        }

        const journey = result.rows[0];
        const botActive = !journey.bot_paused_at;

        return reply.status(200).send({
          journeyId,
          botActive,
          pausedAt: journey.bot_paused_at || null,
          pauseReason: journey.bot_pause_reason || null,
          pipelineStage: journey.pipeline_stage,
          engine: 'nvidia_nim_nemotron',
          model: process.env.NVIDIA_NIM_MODEL || 'nvidia/llama-3.1-nemotron-70b-instruct',
          receptionistEnabled: process.env.RECEPTIONIST_ENABLED === 'true',
        });
      } catch (err) {
        request.log.error({ err }, 'Error fetching bot status');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  /**
   * POST /api/v1/workspaces/:workspaceId/journeys/:journeyId/bot/pause
   * Pausa o bot — humano assume o atendimento
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
           RETURNING id, bot_paused_at, bot_pause_reason`,
          [journeyId, workspaceId, reason]
        );

        if (result.rowCount === 0) {
          return reply.status(404).send({ error: 'Journey not found' });
        }

        return reply.status(200).send({
          journeyId,
          botActive: false,
          pausedAt: result.rows[0].bot_paused_at,
          pauseReason: result.rows[0].bot_pause_reason,
          message: '🤖 → 👤 Bot pausado. Atendimento humano ativado.',
        });
      } catch (err) {
        request.log.error({ err }, 'Error pausing bot');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  /**
   * POST /api/v1/workspaces/:workspaceId/journeys/:journeyId/bot/resume
   * Retoma o bot — volta ao atendimento automático
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
           RETURNING id`,
          [journeyId, workspaceId]
        );

        if (result.rowCount === 0) {
          return reply.status(404).send({ error: 'Journey not found' });
        }

        return reply.status(200).send({
          journeyId,
          botActive: true,
          pausedAt: null,
          pauseReason: null,
          message: '👤 → 🤖 Bot retomado. Atendimento automático ativo.',
        });
      } catch (err) {
        request.log.error({ err }, 'Error resuming bot');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
};
