/**
 * Meta Partner Routes — Messenger, Instagram Direct, NLP, m.me Links & Insights
 * 
 * Endpoints:
 * - GET/POST m.me tracking links
 * - Enable/configure Meta NLP (Wit.ai)
 * - Configure Welcome Screen / Get Started payload
 * - Configure Instagram Ice Breakers
 * - Private Replies execution and keyword configuration
 * - Messenger Insights & Conversations API
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { dbPool } from '../../../infrastructure/database/pool.js';
import { MessengerClient } from '../../../infrastructure/channels/meta/messenger-client.js';
import { InstagramDmClient } from '../../../infrastructure/channels/meta/instagram-dm-client.js';
import { MessengerInsightsClient } from '../../../infrastructure/channels/meta/messenger-insights-client.js';
import { ConversationsApiClient } from '../../../infrastructure/channels/meta/conversations-api-client.js';
import { MmeLinkService } from '../../../application/services/mme-link-service.js';
import { PrivateReplyService } from '../../../application/services/private-reply-service.js';
import { normalizeWorkspaceUuid } from './whatsapp-channel-routes.js';
import { OperatorAuthenticator } from '../../../application/ports/operator-authenticator.js';
import { WorkspaceDirectory } from '../../../application/ports/workspace-directory.js';
import { verifyOperatorAuth, assertTenantAccess, unauthorized } from '../helpers/auth-guard.js';

export interface MetaPartnerRouteDependencies {
  authenticator?: OperatorAuthenticator;
  workspaceDirectory?: WorkspaceDirectory;
}

export async function metaPartnerRoutes(
  app: FastifyInstance,
  dependencies: MetaPartnerRouteDependencies = {}
): Promise<void> {
  // Enforce JWT on all Meta Partner operational routes
  app.addHook('onRequest', async (request, reply) => {
    if (!dependencies?.authenticator) {
      return unauthorized(reply, 'Authenticator is required');
    }
    const actor = await verifyOperatorAuth(request, reply, dependencies.authenticator);
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
        dependencies.workspaceDirectory,
        requiredRole
      );
      if (!allowed) return;
    }
  });

  const messengerClient = new MessengerClient();
  const instagramClient = new InstagramDmClient();
  const insightsClient = new MessengerInsightsClient();
  const conversationsClient = new ConversationsApiClient();
  const mmeLinkService = new MmeLinkService();
  const privateReplyService = new PrivateReplyService();

  // Helper to extract page credentials from secure channel_connection_secrets
  const getPageCredentials = async (
    workspaceId: string,
    channelId?: string,
    expectedProvider: 'messenger' | 'instagram_dm' = 'messenger',
  ) => {
    let query = `
      SELECT cc.id, cc.public_config, cs.secret_payload
      FROM public.channel_connections cc
      LEFT JOIN public.channel_connection_secrets cs
        ON cs.channel_connection_id = cc.id AND cs.secret_kind = 'meta_bearer_token'
      WHERE cc.workspace_id = $1
        AND cc.provider = $2
        AND cc.status = 'CONNECTED'
    `;
    const params: any[] = [workspaceId, expectedProvider];
    if (channelId) {
      query += ` AND cc.id = $3`;
      params.push(channelId);
    }
    query += ' ORDER BY cc.created_at ASC';
    const res = await dbPool.query(query, params);
    if (res.rows.length === 0) {
      throw new Error('Nenhum canal Meta/Messenger configurado no workspace');
    }
    if (!channelId && res.rows.length !== 1) {
      throw new Error('Configuração Meta ambígua: selecione uma conexão específica');
    }
    const cfg = res.rows[0].public_config || {};
    const secretPayload = res.rows[0].secret_payload || {};
    const pageId = cfg.pageId || cfg.wabaId;
    const pageAccessToken = secretPayload.pageAccessToken || secretPayload.accessToken;
    const igUserId = cfg.igUserId;
    return { channelId: res.rows[0].id, pageId, pageAccessToken, igUserId, config: cfg };
  };

  // ─── 1. m.me Link Generator & Tracker ────────────────────────────

  app.post('/api/v1/workspaces/:workspaceId/channels/messenger/links', async (
    request: FastifyRequest<{ Params: { workspaceId: string }; Body: { pageName: string; refCode: string; label?: string } }>,
    reply: FastifyReply
  ) => {
    const workspaceId = normalizeWorkspaceUuid(request.params.workspaceId);
    if (!workspaceId) return reply.status(404).send({ error: 'Workspace não encontrado', statusCode: 404 });
    const { pageName, refCode, label } = request.body;

    if (!pageName || !refCode) {
      return reply.status(400).send({ error: 'pageName e refCode são obrigatórios' });
    }

    try {
      const link = await mmeLinkService.createTrackedLink({
        workspaceId,
        pageName,
        refCode,
        label,
      });
      return reply.status(201).send(link);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.get('/api/v1/workspaces/:workspaceId/channels/messenger/links', async (
    request: FastifyRequest<{ Params: { workspaceId: string } }>,
    reply: FastifyReply
  ) => {
    const workspaceId = normalizeWorkspaceUuid(request.params.workspaceId);
    if (!workspaceId) return reply.status(404).send({ error: 'Workspace não encontrado', statusCode: 404 });
    try {
      const links = await mmeLinkService.listTrackedLinks(workspaceId);
      return reply.send(links);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ─── 2. Built-in NLP Activation ──────────────────────────────────

  app.post('/api/v1/workspaces/:workspaceId/channels/messenger/nlp/enable', async (
    request: FastifyRequest<{ Params: { workspaceId: string }; Body: { enabled?: boolean; customModel?: string } }>,
    reply: FastifyReply
  ) => {
    const workspaceId = normalizeWorkspaceUuid(request.params.workspaceId);
    if (!workspaceId) return reply.status(404).send({ error: 'Workspace não encontrado', statusCode: 404 });
    const { enabled = true, customModel } = request.body || {};

    try {
      const { channelId, pageAccessToken } = await getPageCredentials(workspaceId);
      if (!pageAccessToken) {
        return reply.status(400).send({ error: 'Page Access Token não encontrado' });
      }

      const res = await messengerClient.enableNlp(pageAccessToken, enabled, customModel);
      if (!res.success) {
        return reply.status(502).send({ error: 'A Meta não confirmou a alteração do Built-in NLP.' });
      }

      await dbPool.query(
        `UPDATE public.channel_connections
         SET public_config = jsonb_set(
           COALESCE(public_config, '{}'::jsonb),
           '{nlpConfig}',
           $1::jsonb,
           true
         ), updated_at = NOW()
         WHERE id = $2 AND workspace_id = $3`,
        [JSON.stringify({ enabled: Boolean(enabled), ...(customModel ? { customModel } : {}), updatedAt: new Date().toISOString() }), channelId, workspaceId],
      );

      return reply.send({ success: true, enabled: Boolean(enabled), message: `Meta Built-in NLP ${enabled ? 'ativado' : 'desativado'} com sucesso.` });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // The Meta APIs do not expose a read endpoint for these page settings. Keep
  // the last confirmed state in the channel's non-secret public configuration
  // so the UI never presents a fabricated "active" status before loading.
  app.get('/api/v1/workspaces/:workspaceId/channels/messenger/config', async (
    request: FastifyRequest<{ Params: { workspaceId: string } }>,
    reply: FastifyReply,
  ) => {
    const workspaceId = normalizeWorkspaceUuid(request.params.workspaceId);
    if (!workspaceId) return reply.status(404).send({ error: 'Workspace não encontrado', statusCode: 404 });

    try {
      const { channelId, config } = await getPageCredentials(workspaceId);
      const nlp = config?.nlpConfig && typeof config.nlpConfig === 'object' ? config.nlpConfig : null;
      const privateReply = config?.privateReplyConfig && typeof config.privateReplyConfig === 'object'
        ? config.privateReplyConfig
        : null;
      return reply.send({
        channelConnectionId: channelId,
        nlp,
        privateReply,
      });
    } catch (err: any) {
      return reply.status(404).send({ error: err.message || 'Canal Messenger não configurado.' });
    }
  });

  // ─── 3. Welcome Screen & Get Started ─────────────────────────────

  app.post('/api/v1/workspaces/:workspaceId/channels/messenger/welcome-screen', async (
    request: FastifyRequest<{
      Params: { workspaceId: string };
      Body: {
        getStartedPayload?: string;
        greetings?: Array<{ locale: string; text: string }>;
      };
    }>,
    reply: FastifyReply
  ) => {
    const workspaceId = normalizeWorkspaceUuid(request.params.workspaceId);
    if (!workspaceId) return reply.status(404).send({ error: 'Workspace não encontrado', statusCode: 404 });
    const { getStartedPayload = 'GET_STARTED_DEFAULT', greetings } = request.body || {};

    try {
      const { pageId, pageAccessToken } = await getPageCredentials(workspaceId);
      if (!pageId || !pageAccessToken) {
        return reply.status(400).send({ error: 'Page ID ou Access Token ausente' });
      }

      if (getStartedPayload) {
        await messengerClient.setGetStartedPayload(pageId, pageAccessToken, getStartedPayload);
      }

      if (greetings && greetings.length > 0) {
        await messengerClient.setGreeting(pageId, pageAccessToken, greetings);
      }

      return reply.send({ success: true, message: 'Welcome Screen configurada com sucesso no Facebook Messenger.' });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ─── 4. Instagram Ice Breakers ───────────────────────────────────

  app.post('/api/v1/workspaces/:workspaceId/channels/instagram/icebreakers', async (
    request: FastifyRequest<{
      Params: { workspaceId: string };
      Body: {
        iceBreakers: Array<{ question: string; payload: string }>;
      };
    }>,
    reply: FastifyReply
  ) => {
    const workspaceId = normalizeWorkspaceUuid(request.params.workspaceId);
    if (!workspaceId) return reply.status(404).send({ error: 'Workspace não encontrado', statusCode: 404 });
    const { iceBreakers } = request.body || {};

    if (!iceBreakers || !Array.isArray(iceBreakers)) {
      return reply.status(400).send({ error: 'iceBreakers deve ser um array de perguntas' });
    }

    try {
      const { igUserId, pageAccessToken } = await getPageCredentials(workspaceId, undefined, 'instagram_dm');
      if (!igUserId || !pageAccessToken) {
        return reply.status(400).send({ error: 'Instagram User ID ou Page Access Token não configurado' });
      }

      const res = await instagramClient.setIceBreakers(igUserId, pageAccessToken, iceBreakers);
      return reply.send({ success: true, result: res.result });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ─── 5. Private Replies Configuration & Dispatch ─────────────────

  app.put('/api/v1/workspaces/:workspaceId/channels/comments/private-reply-config', async (
    request: FastifyRequest<{
      Params: { workspaceId: string };
      Body: {
        channelConnectionId?: string;
        enabled: boolean;
        keywords: string[];
        replyTemplate: string;
      };
    }>,
    reply: FastifyReply
  ) => {
    const workspaceId = normalizeWorkspaceUuid(request.params.workspaceId);
    if (!workspaceId) return reply.status(404).send({ error: 'Workspace não encontrado', statusCode: 404 });
    const { channelConnectionId, enabled, keywords, replyTemplate } = request.body;

    try {
      const { channelId } = await getPageCredentials(workspaceId, channelConnectionId, 'messenger');

      await dbPool.query(
        `UPDATE public.channel_connections 
         SET public_config = jsonb_set(
           COALESCE(public_config, '{}'::jsonb),
           '{privateReplyConfig}',
           $1::jsonb
         ), updated_at = NOW()
         WHERE id = $2 AND workspace_id = $3`,
        [
          JSON.stringify({
            enabled: Boolean(enabled),
            keywords: keywords || ['preço', 'quanto custa', 'valor', 'disponível', 'agenda'],
            replyTemplate: replyTemplate || 'Oi {{name}}! Vi seu comentário e te chamei aqui no privado para te passar todos os detalhes 😊',
            updatedAt: new Date().toISOString(),
          }),
          channelId,
          workspaceId,
        ]
      );

      return reply.send({ success: true, message: 'Configuração de Respostas Privadas salva com sucesso.' });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post('/api/v1/workspaces/:workspaceId/channels/comments/private-reply', async (
    request: FastifyRequest<{
      Params: { workspaceId: string };
      Body: {
        channelConnectionId?: string;
        commentId: string;
        commentText: string;
        authorName?: string;
        replyText: string;
      };
    }>,
    reply: FastifyReply
  ) => {
    const workspaceId = normalizeWorkspaceUuid(request.params.workspaceId);
    if (!workspaceId) return reply.status(404).send({ error: 'Workspace não encontrado', statusCode: 404 });
    const { channelConnectionId, commentId, commentText, authorName, replyText } = request.body;

    if (!commentId || !replyText) {
      return reply.status(400).send({ error: 'commentId e replyText são obrigatórios' });
    }

    try {
      const { channelId } = await getPageCredentials(workspaceId, channelConnectionId, 'messenger');
      const result = await privateReplyService.dispatchPrivateReply({
        workspaceId,
        channelConnectionId: channelId,
        commentId,
        commentText: commentText || '',
        authorName,
        replyText,
      });

      if (!result.success) {
        if (result.status === 'UNKNOWN') {
          return reply.status(503).send(result);
        }
        if (result.alreadyReplied) {
          return reply.status(409).send(result);
        }
        return reply.status(400).send(result);
      }
      return reply.send(result);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ─── 6. Messaging Insights API ───────────────────────────────────

  app.get('/api/v1/workspaces/:workspaceId/channels/messenger/insights', async (
    request: FastifyRequest<{ Params: { workspaceId: string }; Querystring: { since?: string; until?: string } }>,
    reply: FastifyReply
  ) => {
    const workspaceId = normalizeWorkspaceUuid(request.params.workspaceId);
    if (!workspaceId) return reply.status(404).send({ error: 'Workspace não encontrado', statusCode: 404 });
    const { since, until } = request.query;

    try {
      const { pageId, pageAccessToken } = await getPageCredentials(workspaceId);
      if (!pageId || !pageAccessToken) {
        return reply.status(400).send({ error: 'Page ID ou Access Token ausente' });
      }

      const sinceSec = since ? Math.floor(new Date(since).getTime() / 1000) : Math.floor(Date.now() / 1000) - 30 * 86400;
      const untilSec = until ? Math.floor(new Date(until).getTime() / 1000) : Math.floor(Date.now() / 1000);

      const metrics = await insightsClient.fetchMessagingMetrics({
        pageId,
        pageAccessToken,
        since: sinceSec,
        until: untilSec,
      });

      return reply.send({ data: metrics });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ─── 7. Conversations API ────────────────────────────────────────

  app.get('/api/v1/workspaces/:workspaceId/channels/messenger/conversations', async (
    request: FastifyRequest<{
      Params: { workspaceId: string };
      Querystring: { platform?: 'messenger' | 'instagram'; folder?: 'inbox' | 'done' | 'spam'; limit?: string };
    }>,
    reply: FastifyReply
  ) => {
    const workspaceId = normalizeWorkspaceUuid(request.params.workspaceId);
    if (!workspaceId) return reply.status(404).send({ error: 'Workspace não encontrado', statusCode: 404 });
    const { platform, folder, limit } = request.query;

    try {
      const { pageId, pageAccessToken } = await getPageCredentials(workspaceId);
      if (!pageId || !pageAccessToken) {
        return reply.status(400).send({ error: 'Page ID ou Access Token ausente' });
      }

      const result = await conversationsClient.listConversations({
        pageId,
        pageAccessToken,
        platform,
        folder,
        limit: limit ? parseInt(limit, 10) : 25,
      });

      return reply.send(result);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
