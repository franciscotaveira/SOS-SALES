import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { WahaSyncService } from '../../../infrastructure/channels/waha/waha-sync-service.js';
import { WabaClient } from '../../../infrastructure/channels/meta/waba-client.js';
import { FlowCrypto } from '../../../infrastructure/channels/meta/flow-crypto.js';
import { dbPool } from '../../../infrastructure/database/pool.js';
import { AttributionService } from '../../../application/services/attribution-service.js';
import { OperatorAuthenticator } from '../../../application/ports/operator-authenticator.js';
import { WorkspaceDirectory } from '../../../application/ports/workspace-directory.js';
import { WabaChannelInfoGateway } from '../../../application/ports/waba-channel-info-gateway.js';
import { verifyOperatorAuth, assertTenantAccess, unauthorized, forbidden } from '../helpers/auth-guard.js';
import crypto from 'node:crypto';
import { z } from 'zod';
import { isSyntheticTestDataEnabled } from '../../../infrastructure/security/runtime-safety.js';

const WAHA_BASE_URL = process.env.WAHA_BASE_URL || 'http://sos-sales-waha:3000';
const PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'http://sos-sales-api:4334';

const trackingSettingsBodySchema = z.object({
  metaPixelId: z.string().trim().max(80).optional(),
  metaDatasetId: z.string().trim().max(80).optional(),
  metaAccessToken: z.string().trim().max(4096).optional(),
  metaCapiEnabled: z.boolean().optional(),
  googleAdsCustomerId: z.string().trim().max(80).optional(),
  googleConversionId: z.string().trim().max(80).optional(),
  googleGclidTracking: z.boolean().optional(),
  campaignMappings: z.array(z.record(z.string(), z.unknown())).max(100).optional(),
}).strict();

export function getWahaApiKey(): string {
  const key = process.env.WAHA_API_KEY;
  if (!key || !key.trim()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[FATAL SECURITY] WAHA_API_KEY environment variable is mandatory in production');
    }
    return 'mct_sos_waha_dev_secret_2026';
  }
  return key.trim();
}

export function verifyWahaApiKeyTimingSafe(incomingApiKey: string | undefined): boolean {
  if (!incomingApiKey || typeof incomingApiKey !== 'string' || incomingApiKey.trim().length === 0) {
    return false;
  }
  let expectedKey: string;
  try {
    expectedKey = getWahaApiKey();
  } catch {
    return false;
  }
  if (!expectedKey) return false;

  const incomingBuf = Buffer.from(incomingApiKey.trim(), 'utf8');
  const expectedBuf = Buffer.from(expectedKey, 'utf8');

  if (incomingBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(incomingBuf, expectedBuf);
}

const PROCESSED_WEBHOOK_EVENT_IDS = new Map<string, number>();
const EVENT_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function isEventReplayed(eventId: string): boolean {
  const now = Date.now();
  if (PROCESSED_WEBHOOK_EVENT_IDS.size > 5000) {
    for (const [id, timestamp] of PROCESSED_WEBHOOK_EVENT_IDS.entries()) {
      if (now - timestamp > EVENT_TTL_MS) {
        PROCESSED_WEBHOOK_EVENT_IDS.delete(id);
      }
    }
  }
  if (PROCESSED_WEBHOOK_EVENT_IDS.has(eventId)) {
    return true;
  }
  PROCESSED_WEBHOOK_EVENT_IDS.set(eventId, now);
  return false;
}

const KNOWN_EXACT_ALIASES: Record<string, string> = {
  haven: '22222222-2222-2222-2222-222222222222',
  haven_main: 'a0000000-0000-0000-0000-000000000001',
  sora: '33333333-3333-3333-3333-333333333333',
  matriz: '11111111-1111-1111-1111-111111111111',
  default: '11111111-1111-1111-1111-111111111111',
};

const KNOWN_SESSIONS: Record<string, string> = {
  '22222222-2222-2222-2222-222222222222': 'haven',
  '33333333-3333-3333-3333-333333333333': 'sora',
  '11111111-1111-1111-1111-111111111111': 'default',
};

export function normalizeWorkspaceUuid(workspaceId: string): string | null {
  if (!workspaceId) return null;
  const lower = String(workspaceId).toLowerCase().trim();
  if (KNOWN_EXACT_ALIASES[lower]) {
    return KNOWN_EXACT_ALIASES[lower];
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lower)) {
    return lower;
  }
  return null;
}

export function getSessionName(workspaceId: string): string | null {
  const norm = normalizeWorkspaceUuid(workspaceId);
  if (!norm) return null;
  return KNOWN_SESSIONS[norm] ?? `ws_${norm.replace(/-/g, '')}`;
}

export function getWorkspaceIdFromSession(sessionName: string): string | null {
  if (!sessionName) return null;
  const s = String(sessionName).trim().toLowerCase();
  if (s === 'haven_main') return 'a0000000-0000-0000-0000-000000000001';
  if (s === 'haven') return '22222222-2222-2222-2222-222222222222';
  if (s === 'sora') return '33333333-3333-3333-3333-333333333333';
  if (s === 'default' || s === 'sos_sales' || s === 'matriz') return '11111111-1111-1111-1111-111111111111';
  if (s.startsWith('ws_')) {
    const hex = s.replace('ws_', '');
    if (hex.length === 32 && /^[0-9a-f]{32}$/i.test(hex)) {
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    return s;
  }
  return null;
}

export interface WhatsappChannelRouteDependencies {
  authenticator?: OperatorAuthenticator;
  workspaceDirectory?: WorkspaceDirectory;
  wabaChannelInfoGateway?: WabaChannelInfoGateway;
  /**
   * Supervised durable outbound lifecycle. Legacy cockpit routes enqueue here
   * instead of choosing a provider and sending synchronously.
   */
  outboundDispatchGateway?: import('../../../application/ports/outbound-dispatch-gateway.js').OutboundDispatchGateway;
}

export async function whatsappChannelRoutes(
  app: FastifyInstance,
  dependencies: WhatsappChannelRouteDependencies = {}
): Promise<void> {
  // Enforce JWT on all operational WhatsApp routes (allow media-proxy for public tag rendering)
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/api/v1/channels/waha/media-proxy')) {
      return;
    }
    if (!dependencies?.authenticator) {
      return unauthorized(reply, 'Authenticator is required');
    }
    const actor = await verifyOperatorAuth(request, reply, dependencies.authenticator);
    if (!actor) {
      return reply;
    }
  });

  app.addHook('preHandler', async (request, reply) => {
    if (reply.sent) return;
    if (request.url.startsWith('/api/v1/channels/waha/media-proxy')) {
      return;
    }
    const params = request.params as { workspaceId?: string };
    const query = request.query as { workspaceId?: string };
    const body = request.body as { workspaceId?: string };
    const targetWs = params?.workspaceId || query?.workspaceId || body?.workspaceId;

    if (targetWs && request.operatorActor) {
      const isMutation = request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS';
      // Deleting either an entire workspace history or a single conversation is
      // irreversible.  Operators may handle conversations, but only the
      // workspace owner may erase their audit trail.
      const isOwnerOnly = request.url.includes('/clear-history')
        || request.url.includes('/clear-journey')
        || request.url.includes('/tracking')
        || request.url.includes('/channels/waba/configure')
        || request.url.includes('/channels/waba/oauth-connect')
        || request.url.includes('/channels/waba/list-accounts');
      const requiredRole = isOwnerOnly ? 'owner' : (isMutation ? 'operator' : 'viewer');

      const allowed = await assertTenantAccess(
        request,
        reply,
        targetWs,
        request.operatorActor,
        dependencies.workspaceDirectory,
        requiredRole
      );
      if (!allowed) {
        return reply;
      }
    }
  });

  // 1. Get Live QR Code
  app.get('/api/v1/workspaces/:workspaceId/channels/whatsapp/qr', async (request: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const sessionName = getSessionName(workspaceId);
    if (!sessionName) {
      return reply.status(404).send({ error: 'Workspace não encontrado', statusCode: 404 });
    }

    try {
      const listRes = await fetch(`${WAHA_BASE_URL}/api/sessions?all=true`, {
        headers: { 'x-api-key': getWahaApiKey() },
      });

      if (!listRes.ok) {
        return reply.status(502).send({ error: 'WAHA connection failed', statusCode: 502 });
      }

      const sessions = (await listRes.json()) as Array<{ name: string; status: string; me?: any }>;
      let session = sessions.find((s) => s.name === sessionName);

      if (!session || session.status === 'STOPPED' || session.status === 'FAILED') {
        const startRes = await fetch(`${WAHA_BASE_URL}/api/sessions/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': getWahaApiKey() },
          body: JSON.stringify({
            name: sessionName,
            config: {
              webhooks: [{
                url: `${PUBLIC_API_URL}/api/v1/channels/waha/webhook`,
                events: ['message', 'message.any', 'session.status'],
                customHeaders: [{
                  name: 'x-api-key',
                  value: getWahaApiKey(),
                }],
              }],
            },
          }),
        });
        session = (await startRes.json()) as { name: string; status: string; me?: any };
      }

      if (session.status === 'WORKING') {
        WahaSyncService.syncWorkspaceChats(workspaceId, sessionName, 35).catch((err) => {
          request.log.error({ err }, 'Background sync error');
        });

        return {
          status: 'WORKING',
          session: sessionName,
          me: session.me || null,
          message: 'WhatsApp já conectado e operacional.',
        };
      }

      if (session.status === 'STARTING') {
        return {
          status: 'STARTING',
          session: sessionName,
          qr: null,
          message: 'Iniciando WhatsApp... aguarde alguns segundos.',
        };
      }

      const qrRes = await fetch(`${WAHA_BASE_URL}/api/${sessionName}/auth/qr`, {
        headers: { 'x-api-key': getWahaApiKey(), Accept: 'image/png' },
      });

      if (!qrRes.ok) {
        return {
          status: session.status || 'STARTING',
          session: sessionName,
          qr: null,
          message: 'Gerando QR Code... aguarde 2 segundos.',
        };
      }

      const arrayBuffer = await qrRes.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const dataUrl = `data:image/png;base64,${base64}`;

      return {
        status: 'SCAN_QR_CODE',
        session: sessionName,
        qr: dataUrl,
      };
    } catch (err: any) {
      request.log.error({ err: err.message }, 'Failed to fetch WAHA QR code');
      return reply.status(500).send({ error: err.message, statusCode: 500 });
    }
  });

  // 2. WhatsApp Channel Status (WAHA)
  app.get('/api/v1/workspaces/:workspaceId/channels/whatsapp/status', async (request: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const sessionName = getSessionName(workspaceId);
    if (!sessionName) {
      return reply.status(404).send({ error: 'Workspace não encontrado', statusCode: 404 });
    }

    try {
      const listRes = await fetch(`${WAHA_BASE_URL}/api/sessions?all=true`, {
        headers: { 'x-api-key': getWahaApiKey() },
      });

      if (!listRes.ok) {
        return reply.status(502).send({ error: 'WAHA connection failed', statusCode: 502 });
      }

      const sessions = (await listRes.json()) as Array<{ name: string; status: string; me?: any }>;
      // STRICT TENANT ISOLATION: Only check the exact session for this workspace
      let session = sessions.find((s) => s.name === sessionName);

      return {
        session: sessionName,
        status: session ? session.status : 'SCAN_QR_CODE',
        me: session?.me || null,
        phone: session?.me?.id ? session.me.id.split('@')[0] : null,
        pushName: session?.me?.pushName || null,
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message, statusCode: 500 });
    }
  });

  // 3. Logout / Disconnect WhatsApp Session (WAHA)
  app.post('/api/v1/workspaces/:workspaceId/channels/whatsapp/logout', async (request: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const sessionName = getSessionName(workspaceId);
    if (!sessionName) {
      return reply.status(404).send({ error: 'Workspace não encontrado', statusCode: 404 });
    }

    try {
      // 1. Delete session completely in WAHA (wipes auth directory & unlinks phone)
      try {
        await fetch(`${WAHA_BASE_URL}/api/sessions/${sessionName}`, {
          method: 'DELETE',
          headers: { 'x-api-key': getWahaApiKey() },
        });
      } catch {
        // ignore
      }

      // 2. Re-create a fresh session ready to scan
      try {
        await fetch(`${WAHA_BASE_URL}/api/sessions/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': getWahaApiKey() },
          body: JSON.stringify({
            name: sessionName,
            config: {
              webhooks: [{
                url: `${PUBLIC_API_URL}/api/v1/channels/waha/webhook`,
                events: ['message', 'message.any', 'session.status'],
                customHeaders: [{
                  name: 'x-api-key',
                  value: getWahaApiKey(),
                }],
              }],
            },
          }),
        });
      } catch {
        // ignore
      }

      // 3. Update database status
      const client = await dbPool.connect();
      try {
        await client.query(`
          UPDATE public.channel_connections
          SET status = 'DISCONNECTED', updated_at = NOW()
          WHERE workspace_id = $1 AND provider = 'waha'
        `, [workspaceId]);
      } finally {
        client.release();
      }

      return {
        success: true,
        session: sessionName,
        message: 'WhatsApp desconectado com sucesso. A sessão foi limpa e está pronta para escanear novo QR Code.',
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message, statusCode: 500 });
    }
  });

  // 4. Manual Sync Trigger
  app.post('/api/v1/workspaces/:workspaceId/channels/whatsapp/sync', async (request: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const sessionName = getSessionName(workspaceId);
    if (!sessionName) {
      return reply.status(404).send({ error: 'Workspace não encontrado', statusCode: 404 });
    }

    try {
      const result = await WahaSyncService.syncWorkspaceChats(workspaceId, sessionName, 35);
      return {
        success: true,
        workspaceId,
        session: sessionName,
        ...result,
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message, statusCode: 500 });
    }
  });

  // 5. Contact WhatsApp Profile Picture
  app.get('/api/v1/workspaces/:workspaceId/contacts/:phone/profile-picture', async (request: FastifyRequest<{ Params: { workspaceId: string; phone: string } }>, reply: FastifyReply) => {
    const { workspaceId, phone } = request.params;
    const cleanPhone = phone.replace(/\D/g, '');
    const sessionName = getSessionName(workspaceId);
    if (!sessionName) {
      return reply.status(404).send({ error: 'Workspace não encontrado', statusCode: 404 });
    }

    if (!cleanPhone) {
      return reply.send({ success: true, url: null });
    }

    try {
      const contactId = cleanPhone.includes('@') ? cleanPhone : `${cleanPhone}@c.us`;
      const wahaRes = await fetch(`${WAHA_BASE_URL}/api/${sessionName}/contacts/profile-picture?contactId=${encodeURIComponent(contactId)}`, {
        headers: { 'x-api-key': getWahaApiKey() },
      });

      if (wahaRes.ok) {
        const data = await wahaRes.json() as { url?: string; profilePicture?: string };
        const url = data?.url || data?.profilePicture || null;
        return reply.send({ success: true, url });
      }
      return reply.send({ success: true, url: null });
    } catch {
      return reply.send({ success: true, url: null });
    }
  });

  // 5. Clear / Reset Workspace History
  app.post('/api/v1/workspaces/:workspaceId/channels/whatsapp/clear-history', async (request: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const confirmHeader = request.headers['x-confirm-destruction'];
    if (confirmHeader !== 'CONFIRM_DATA_DELETION') {
      return reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Irreversible data deletion requires header x-confirm-destruction: CONFIRM_DATA_DELETION',
      });
    }
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_catalog.set_config('sales_os.allow_redaction', 'true', true)");
      await client.query('DELETE FROM public.conversation_message_events WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.conversation_messages WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.known_fact_supersessions WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.known_fact_commands WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.known_facts WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.decision_events WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.decision_states WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.recommended_actions WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.executed_actions WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.handoff_case_events WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.handoff_cases WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.commercial_outcomes WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.commercial_appointments WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.operational_notes WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.outbound_dispatch_events WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.outbound_dispatches WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.pipeline_stage_events WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.follow_up_tasks WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.outbox_events WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.commercial_journeys WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.contacts WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.inbound_channel_events WHERE workspace_id = $1', [workspaceId]);
      await client.query('DELETE FROM public.acquisition_contexts WHERE workspace_id = $1', [workspaceId]);
      await client.query('COMMIT');

      return {
        success: true,
        workspaceId,
        message: 'Histórico de conversas, jornadas e contatos limpo com sucesso!',
      };
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => undefined);
      return reply.status(500).send({ error: err.message, statusCode: 500 });
    } finally {
      client.release();
    }
  });

  // 5.1 Clear / Reset Single Journey
  app.post('/api/v1/workspaces/:workspaceId/channels/whatsapp/clear-journey', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: { journeyId: string };
  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const { journeyId } = (request.body || {}) as { journeyId: string };
    const confirmHeader = request.headers['x-confirm-destruction'];
    if (confirmHeader !== 'CONFIRM_DATA_DELETION') {
      return reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Irreversible data deletion requires header x-confirm-destruction: CONFIRM_DATA_DELETION',
      });
    }
    if (!journeyId) {
      return reply.status(400).send({ error: 'journeyId is required in request body', statusCode: 400 });
    }
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_catalog.set_config('sales_os.allow_redaction', 'true', true)");
      await client.query('DELETE FROM public.conversation_message_events WHERE workspace_id = $1 AND message_id IN (SELECT id FROM public.conversation_messages WHERE journey_id = $2)', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.conversation_messages WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.known_fact_supersessions WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.known_fact_commands WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.known_facts WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.decision_events WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.decision_states WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.recommended_actions WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.executed_actions WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.handoff_case_events WHERE workspace_id = $1 AND handoff_case_id IN (SELECT id FROM public.handoff_cases WHERE journey_id = $2)', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.handoff_cases WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.commercial_outcomes WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.commercial_appointments WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.outbound_dispatch_events WHERE workspace_id = $1 AND outbound_dispatch_id IN (SELECT id FROM public.outbound_dispatches WHERE journey_id = $2)', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.outbound_dispatches WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.pipeline_stage_events WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.follow_up_tasks WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.acquisition_contexts WHERE workspace_id = $1 AND journey_id = $2', [workspaceId, journeyId]);
      await client.query('DELETE FROM public.commercial_journeys WHERE workspace_id = $1 AND id = $2', [workspaceId, journeyId]);
      await client.query('COMMIT');

      return {
        success: true,
        workspaceId,
        journeyId,
        message: 'Conversa limpa com sucesso!',
      };
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => undefined);
      return reply.status(500).send({ error: err.message, statusCode: 500 });
    } finally {
      client.release();
    }
  });

  // 6. Configure Meta Cloud API (WABA)
  app.post('/api/v1/workspaces/:workspaceId/channels/waba/configure', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: { phoneNumberId: string; wabaId: string; accessToken?: string; verifyToken?: string };
  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    let { phoneNumberId, wabaId, accessToken } = request.body || {};

    if (!accessToken || accessToken === 'use_server_default') {
      accessToken = process.env.META_SYSTEM_USER_TOKEN || '';
    }

    if (!phoneNumberId || !wabaId || !accessToken) {
      return reply.status(400).send({
        error: 'Campos obrigatórios: phoneNumberId, wabaId e accessToken (ou configure META_SYSTEM_USER_TOKEN no servidor)',
      });
    }

    try {
      let displayPhone = phoneNumberId;
      let verifiedName = 'WhatsApp Business Oficial';
      let providerVerified = false;

      try {
        const metaRes = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(phoneNumberId)}?access_token=${encodeURIComponent(accessToken)}`);


      if (metaRes.ok) {
        const metaData = (await metaRes.json()) as { display_phone_number?: string; verified_name?: string; id?: string };
        // A successful HTTP response alone is not proof that this token can
        // operate the requested number. Require Meta to echo the exact
        // Phone Number ID before persisting a connected channel.
        providerVerified = metaData.id === phoneNumberId;
        displayPhone = metaData.display_phone_number || displayPhone;
        verifiedName = metaData.verified_name || verifiedName;
      } else {
        // Fallback: try fetching WABA info
        const wabaRes = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(wabaId)}?fields=name,id,phone_numbers&access_token=${encodeURIComponent(accessToken)}`);
        if (wabaRes.ok) {
          const wabaData = (await wabaRes.json()) as any;
          if (wabaData.name) verifiedName = wabaData.name;
          if (Array.isArray(wabaData.phone_numbers?.data)) {
            const match = wabaData.phone_numbers.data.find((p: any) => p.id === phoneNumberId);
            if (match) {
              providerVerified = true;
              displayPhone = match.display_phone_number || displayPhone;
              verifiedName = match.verified_name || verifiedName;
            }
          }
        }
      }
    } catch {
      // Keep the channel unverified; the request below fails closed.
    }

      if (!providerVerified) {
        return reply.status(401).send({
          error: 'A Meta não confirmou este Phone Number ID com o token informado. A conexão não foi criada.',
          code: 'META_WABA_VALIDATION_FAILED',
        });
      }

      const client = await dbPool.connect();
    try {
      // A phone number has one authoritative responder. Do not let a WABA
      // configuration silently coexist with an active WAHA session for the
      // same number, otherwise inbound/outbound traffic becomes ambiguous.
      const wahaConflict = await client.query(
        `SELECT 1
         FROM public.channel_connections
         WHERE provider = 'waha'
           AND status = 'CONNECTED'
           AND NULLIF(regexp_replace(COALESCE(phone_number, ''), '\\D', '', 'g'), '')
             = NULLIF(regexp_replace($1, '\\D', '', 'g'), '')
         LIMIT 1`,
        [displayPhone]
      );
      if (wahaConflict.rowCount && wahaConflict.rowCount > 0) {
        return reply.status(409).send({
          error: 'Este número já possui uma conexão WAHA ativa. Desconecte ou migre o número antes de ativar a Meta Cloud API.',
          code: 'CHANNEL_PROVIDER_CONFLICT',
        });
      }

      // Public configuration (never store secrets here)
      const publicConfig = {
        wabaId,
        phoneNumberId,
        verifiedName,
        engine: 'META_CLOUD',
      };

      const existing = await client.query(`
        SELECT id FROM public.channel_connections
        WHERE workspace_id = $1 AND provider = 'meta_cloud' AND status = 'CONNECTED'
        ORDER BY created_at ASC
        LIMIT 2
      `, [workspaceId]);
      if (existing.rows.length > 1) {
        return reply.status(409).send({
          error: 'Este workspace possui mais de um número WABA conectado. O MVP exige um único número oficial por workspace; desconecte o excedente antes de continuar.',
          code: 'MULTIPLE_WABA_CHANNELS_UNSUPPORTED',
        });
      }

      let channelId: string;
      if (existing.rowCount && existing.rowCount > 0) {
        channelId = existing.rows[0].id;
        await client.query(`
          UPDATE public.channel_connections
          SET phone_number = $1, name = $2, public_config = $3, status = 'CONNECTED', updated_at = NOW()
          WHERE id = $4
        `, [displayPhone, verifiedName, JSON.stringify(publicConfig), channelId]);
      } else {
        const insertRes = await client.query(`
          INSERT INTO public.channel_connections (
            id, workspace_id, provider, phone_number, name, public_config, status, created_at, updated_at
          ) VALUES (
            gen_random_uuid(), $1, 'meta_cloud', $2, $3, $4, 'CONNECTED', NOW(), NOW()
          ) RETURNING id
        `, [workspaceId, displayPhone, verifiedName, JSON.stringify(publicConfig)]);
        channelId = insertRes.rows[0].id;
      }

      // Store credentials securely in channel_connection_secrets
      if (accessToken) {
        await client.query(`
          INSERT INTO public.channel_connection_secrets (
            channel_connection_id, workspace_id, secret_kind, secret_payload, created_at, updated_at
          ) VALUES (
            $1, $2, 'meta_bearer_token', $3::jsonb, NOW(), NOW()
          )
          ON CONFLICT (channel_connection_id, secret_kind)
          DO UPDATE SET secret_payload = EXCLUDED.secret_payload, updated_at = NOW()
        `, [channelId, workspaceId, JSON.stringify({ accessToken })]);
      }

      return {
        success: true,
        channelId,
        verifiedPhone: displayPhone,
        verifiedName,
        wabaId,
        phoneNumberId,
        status: 'CONNECTED',
        message: 'Canal Meta Cloud API (WABA) conectado e salvo com sucesso!',
      };
    } finally {
      client.release();
    }

    } catch (err: any) {
      return reply.status(500).send({ error: err.message, statusCode: 500 });
    }
  });

  // 6.1. Login Auth / OAuth Embedded Signup Auto-Connect
  app.post('/api/v1/workspaces/:workspaceId/channels/waba/oauth-connect', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: { accessToken?: string; code?: string; wabaId?: string; phoneNumberId?: string; appId?: string; appSecret?: string };
  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    let { accessToken, code, wabaId, phoneNumberId, appId, appSecret } = request.body || {};

    // 1. If authorization code is provided, exchange for access token
    if (code && appId && appSecret) {
      try {
        const tokenExchangeRes = await fetch(
          `https://graph.facebook.com/v20.0/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}`
        );
        if (tokenExchangeRes.ok) {
          const tokenData = (await tokenExchangeRes.json()) as any;
          accessToken = tokenData.access_token;
        }
      } catch (err: any) {
        return reply.status(400).send({ error: `Erro ao trocar código por token Meta: ${err.message}` });
      }
    }

    if (!accessToken || accessToken === 'use_server_default') {
      accessToken = process.env.META_SYSTEM_USER_TOKEN || '';
    }

    if (!accessToken) {
      return reply.status(400).send({ error: 'Access Token ou Código de Autorização é obrigatório para o Login Auth Meta.' });
    }

    try {
      // 2. Auto-discover WABA and Phone Number if missing
      if (!phoneNumberId && wabaId) {
        const phonesRes = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(wabaId)}/phone_numbers?access_token=${encodeURIComponent(accessToken)}`);
        if (phonesRes.ok) {
          const phonesData = (await phonesRes.json()) as any;
          if (Array.isArray(phonesData.data) && phonesData.data.length > 1) {
            return reply.status(409).send({
              error: 'A Meta retornou mais de um número WABA. Informe explicitamente o Phone Number ID para evitar conectar o telefone errado.',
              code: 'MULTIPLE_WABA_PHONES_REQUIRE_SELECTION',
              phones: phonesData.data.map((phone: any) => ({
                id: typeof phone?.id === 'string' ? phone.id : undefined,
                displayPhoneNumber: typeof phone?.display_phone_number === 'string' ? phone.display_phone_number : undefined,
                verifiedName: typeof phone?.verified_name === 'string' ? phone.verified_name : undefined,
              })).filter((phone: any) => phone.id),
            });
          }
          if (Array.isArray(phonesData.data) && phonesData.data.length === 1) {
            phoneNumberId = phonesData.data[0].id;
          }
        }
      }

      if (!phoneNumberId) {
        return reply.status(400).send({
          error: 'Não foi possível detectar o ID do Número de Telefone automaticamente. Por favor informe o Phone Number ID retornado pelo Facebook Login.',
        });
      }

      // 3. Validate Phone Number ID with Meta
      let displayPhone = phoneNumberId;
      let verifiedName = 'WhatsApp Business Oficial';
      let providerVerified = false;

      try {
        const metaRes = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name,whatsapp_business_account&access_token=${encodeURIComponent(accessToken)}`);
        if (metaRes.ok) {
          const metaData = (await metaRes.json()) as { display_phone_number?: string; verified_name?: string; id?: string; whatsapp_business_account?: { id?: string } };
          providerVerified = metaData.id === phoneNumberId;
          displayPhone = metaData.display_phone_number || displayPhone;
          verifiedName = metaData.verified_name || verifiedName;
          if (!wabaId && metaData.whatsapp_business_account?.id) {
            wabaId = metaData.whatsapp_business_account.id;
          }
        } else if (wabaId) {
          const wabaRes = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(wabaId)}?fields=name,id,phone_numbers&access_token=${encodeURIComponent(accessToken)}`);
          if (wabaRes.ok) {
            const wabaData = (await wabaRes.json()) as any;
            if (wabaData.name) verifiedName = wabaData.name;
            if (Array.isArray(wabaData.phone_numbers?.data)) {
              const match = wabaData.phone_numbers.data.find((p: any) => p.id === phoneNumberId);
              if (match) {
                providerVerified = true;
                displayPhone = match.display_phone_number || displayPhone;
                verifiedName = match.verified_name || verifiedName;
              }
            }
          }
        }
      } catch {
        // Keep the channel unverified; the request below fails closed.
      }

      if (!providerVerified) {
        return reply.status(401).send({
          error: 'A Meta não confirmou este Phone Number ID com o token informado. A conexão não foi criada.',
          code: 'META_WABA_VALIDATION_FAILED',
        });
      }

      if (!wabaId) {
        return reply.status(400).send({
          error: 'A Meta confirmou o telefone, mas não devolveu o WABA ID. Informe o WABA ID para concluir a conexão.',
          code: 'META_WABA_ID_REQUIRED',
        });
      }


      // 4. Persist in Database
      const client = await dbPool.connect();
      try {
        const wahaConflict = await client.query(
          `SELECT 1
           FROM public.channel_connections
           WHERE provider = 'waha'
             AND status = 'CONNECTED'
             AND NULLIF(regexp_replace(COALESCE(phone_number, ''), '\\D', '', 'g'), '')
               = NULLIF(regexp_replace($1, '\\D', '', 'g'), '')
           LIMIT 1`,
          [displayPhone],
        );
        if (wahaConflict.rowCount && wahaConflict.rowCount > 0) {
          return reply.status(409).send({
            error: 'Este número já possui uma conexão WAHA ativa. Desconecte ou migre o número antes de ativar a Meta Cloud API.',
            code: 'CHANNEL_PROVIDER_CONFLICT',
          });
        }

        // Public configuration (never store secrets here)
        const publicConfig = {
          wabaId,
          phoneNumberId,
          verifiedName,
          engine: 'META_CLOUD',
          connectedVia: 'LOGIN_AUTH_OAUTH',
        };

        const existing = await client.query(`
          SELECT id, public_config FROM public.channel_connections
          WHERE workspace_id = $1 AND provider = 'meta_cloud' AND status = 'CONNECTED'
          ORDER BY created_at ASC
          LIMIT 2
        `, [workspaceId]);
        if (existing.rows.length > 1) {
          return reply.status(409).send({
            error: 'Este workspace possui mais de um número WABA conectado. O MVP exige um único número oficial por workspace; desconecte o excedente antes de continuar.',
            code: 'MULTIPLE_WABA_CHANNELS_UNSUPPORTED',
          });
        }

        await client.query('BEGIN');
        let channelId: string;
        let previousPhoneNumberId: string | null = null;
        if (existing.rowCount && existing.rowCount > 0) {
          channelId = existing.rows[0].id;
          const previousConfig = typeof existing.rows[0].public_config === 'string'
            ? JSON.parse(existing.rows[0].public_config)
            : existing.rows[0].public_config || {};
          previousPhoneNumberId = typeof previousConfig?.phoneNumberId === 'string'
            ? previousConfig.phoneNumberId
            : typeof previousConfig?.phone_number_id === 'string'
              ? previousConfig.phone_number_id
              : null;
          await client.query(`
            UPDATE public.channel_connections
            SET phone_number = $1, name = $2, public_config = $3, status = 'CONNECTED', updated_at = NOW()
            WHERE id = $4
          `, [displayPhone, verifiedName, JSON.stringify(publicConfig), channelId]);
        } else {
          const insertRes = await client.query(`
            INSERT INTO public.channel_connections (
              id, workspace_id, provider, phone_number, name, public_config, status, created_at, updated_at
            ) VALUES (
              gen_random_uuid(), $1, 'meta_cloud', $2, $3, $4, 'CONNECTED', NOW(), NOW()
            ) RETURNING id
          `, [workspaceId, displayPhone, verifiedName, JSON.stringify(publicConfig)]);
          channelId = insertRes.rows[0].id;
        }

        // Store credentials securely in channel_connection_secrets
        if (accessToken) {
          await client.query(`
            INSERT INTO public.channel_connection_secrets (
              channel_connection_id, workspace_id, secret_kind, secret_payload, created_at, updated_at
            ) VALUES (
              $1, $2, 'meta_bearer_token', $3::jsonb, NOW(), NOW()
            )
            ON CONFLICT (channel_connection_id, secret_kind)
            DO UPDATE SET secret_payload = EXCLUDED.secret_payload, updated_at = NOW()
          `, [channelId, workspaceId, JSON.stringify({ accessToken })]);
        }

        // A channel replacement invalidates every Meta-agent proof attached to
        // the old phone.  Keep the business profile, but force a fresh
        // eligibility/onboarding/test cycle and return existing threads to the
        // deterministic SOS owner until Meta confirms the new number.
        const phoneBindingChanged = previousPhoneNumberId !== phoneNumberId;
        if (phoneBindingChanged) {
          await client.query(
            `UPDATE public.workspace_agent_config
             SET meta_agent_id = NULL,
                 meta_agent_enabled = false,
                 meta_agent_channel_connection_id = NULL,
                 meta_agent_eligibility_status = 'UNKNOWN',
                 meta_agent_checked_at = NULL,
                 meta_agent_activation_status = 'NOT_STARTED',
                 meta_agent_onboarding_started_at = NULL,
                 meta_agent_ready_at = NULL,
                 meta_agent_last_error = NULL,
                 responder_mode = 'sos_sales',
                 updated_at = NOW()
             WHERE workspace_id = $1`,
            [workspaceId],
          );
          await client.query(
            `UPDATE public.commercial_journeys
             SET responder_owner = 'sos_sales',
                 responder_changed_at = NOW(),
                 responder_change_reason = 'meta_phone_replaced',
                 updated_at = NOW()
             WHERE workspace_id = $1
               AND responder_owner = 'meta_business_agent'`,
            [workspaceId],
          );
        }

        await client.query('COMMIT');

        return {
          success: true,
          channelId,
          verifiedPhone: displayPhone,
          verifiedName,
          wabaId,
          phoneNumberId,
          status: 'CONNECTED',
          message: 'WhatsApp Oficial (WABA) conectado via Login Auth com sucesso!',
        };
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    } catch (err: any) {
      return reply.status(500).send({ error: err.message, statusCode: 500 });
    }
  });

  // Helper to fetch WABA credentials for a workspace securely from channel_connection_secrets
  async function getWabaCreds(workspaceId: string) {
    const normWsId = normalizeWorkspaceUuid(workspaceId);
    const client = await dbPool.connect();
    try {
      const res = await client.query(`
        SELECT cc.id, cc.public_config, cs.secret_payload
        FROM public.channel_connections cc
        LEFT JOIN public.channel_connection_secrets cs
          ON cs.channel_connection_id = cc.id AND cs.secret_kind = 'meta_bearer_token'
        WHERE cc.workspace_id = $1 AND cc.provider = 'meta_cloud' AND cc.status = 'CONNECTED'
        ORDER BY cc.created_at ASC
        LIMIT 2
      `, [normWsId]);
      if (res.rowCount !== 1) return null;
      const publicConfig = typeof res.rows[0].public_config === 'string' ? JSON.parse(res.rows[0].public_config) : (res.rows[0].public_config || {});
      const secretPayload = typeof res.rows[0].secret_payload === 'string' ? JSON.parse(res.rows[0].secret_payload) : (res.rows[0].secret_payload || {});
      return {
        phoneNumberId: publicConfig?.phoneNumberId as string,
        wabaId: publicConfig?.wabaId as string,
        accessToken: ((secretPayload?.accessToken || process.env.META_SYSTEM_USER_TOKEN || '') as string),
      };
    } finally {
      client.release();
    }
  }

  // 6.2. List WABA accounts associated with an access token (for account picker)
  app.post('/api/v1/workspaces/:workspaceId/channels/waba/list-accounts', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: { accessToken?: string };
  }>, reply: FastifyReply) => {
    let { accessToken } = request.body || {};
    if (!accessToken || accessToken === 'use_server_default') {
      accessToken = process.env.META_SYSTEM_USER_TOKEN || '';
    }
    if (!accessToken) {
      return reply.status(400).send({ error: 'accessToken obrigatório ou configure META_SYSTEM_USER_TOKEN no servidor.' });
    }
    const token = accessToken.trim();
    const accounts: Array<{ id: string; name: string; phoneNumbers?: Array<{ id: string; display_phone_number: string; verified_name: string }> }> = [];
    const seenWabaIds = new Set<string>();

    try {
      // Do not treat an empty account list as a valid token by inference. The
      // UI uses this result to decide whether it can safely offer manual IDs.
      let identityRes: Response;
      try {
        identityRes = await fetch(
          `https://graph.facebook.com/v20.0/me?fields=id&access_token=${encodeURIComponent(token)}`,
        );
      } catch {
        return reply.status(502).send({
          error: 'Não foi possível alcançar a Meta para validar o token. Tente novamente antes de inserir os IDs manualmente.',
          code: 'META_TOKEN_VALIDATION_UNAVAILABLE',
        });
      }
      if (!identityRes.ok) {
        if ([400, 401, 403].includes(identityRes.status)) {
          return reply.status(401).send({
            error: 'Não foi possível validar o token Meta. Gere um token com acesso à conta WhatsApp Business e tente novamente.',
            code: 'META_TOKEN_INVALID_OR_UNAUTHORIZED',
          });
        }
        return reply.status(502).send({
          error: 'A Meta não respondeu à validação do token. Tente novamente antes de inserir os IDs manualmente.',
          code: 'META_TOKEN_VALIDATION_UNAVAILABLE',
        });
      }

      // Strategy 1: debug_token to get granular scopes target_ids
      try {
        const debugRes = await fetch(`https://graph.facebook.com/v20.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`);
        if (debugRes.ok) {
          const debugData = (await debugRes.json()) as any;
          const scopes = debugData?.data?.granular_scopes || [];
          for (const s of scopes) {
            if (Array.isArray(s.target_ids)) {
              for (const targetId of s.target_ids) {
                if (!seenWabaIds.has(targetId)) {
                  // Probe as WABA phone numbers
                  const phonesRes = await fetch(`https://graph.facebook.com/v20.0/${targetId}/phone_numbers?access_token=${encodeURIComponent(token)}&fields=id,display_phone_number,verified_name`);
                  if (phonesRes.ok) {
                    const phonesData = (await phonesRes.json()) as any;
                    const phoneNumbers = phonesData?.data || [];
                    seenWabaIds.add(targetId);
                    accounts.push({ id: targetId, name: `WhatsApp Business Account (${targetId})`, phoneNumbers });
                  }
                }
              }
            }
          }
        }
      } catch {}

      // Strategy 2: /me/businesses (owned and client WABAs)
      try {
        const meRes = await fetch(`https://graph.facebook.com/v20.0/me/businesses?access_token=${encodeURIComponent(token)}&fields=id,name,whatsapp_business_accounts{id,name},owned_whatsapp_business_accounts{id,name},client_whatsapp_business_accounts{id,name}`);
        if (meRes.ok) {
          const bizData = (await meRes.json()) as any;
          if (Array.isArray(bizData?.data)) {
            for (const biz of bizData.data) {
              const allWabas = [
                ...(biz.whatsapp_business_accounts?.data || []),
                ...(biz.owned_whatsapp_business_accounts?.data || []),
                ...(biz.client_whatsapp_business_accounts?.data || []),
              ];
              for (const waba of allWabas) {
                if (waba.id && !seenWabaIds.has(waba.id)) {
                  seenWabaIds.add(waba.id);
                  const phonesRes = await fetch(`https://graph.facebook.com/v20.0/${waba.id}/phone_numbers?access_token=${encodeURIComponent(token)}&fields=id,display_phone_number,verified_name`);
                  let phoneNumbers: any[] = [];
                  if (phonesRes.ok) {
                    const phonesData = (await phonesRes.json()) as any;
                    phoneNumbers = phonesData?.data || [];
                  }
                  accounts.push({ id: waba.id, name: waba.name || biz.name, phoneNumbers });
                }
              }
            }
          }
        }
      } catch {}

      // Strategy 3: Probe known default WABAs if accounts array is still empty (common for System User tokens)
      if (accounts.length === 0) {
        const candidateWabaIds = ['1749193841879179'];
        for (const candidateId of candidateWabaIds) {
          if (!seenWabaIds.has(candidateId)) {
            try {
              const probeRes = await fetch(
                `https://graph.facebook.com/v20.0/${encodeURIComponent(candidateId)}?fields=id,name,phone_numbers{id,display_phone_number,verified_name}&access_token=${encodeURIComponent(token)}`
              );
              if (probeRes.ok) {
                const probeData = (await probeRes.json()) as any;
                seenWabaIds.add(candidateId);
                const phoneNumbers = Array.isArray(probeData.phone_numbers?.data) ? probeData.phone_numbers.data : [];
                accounts.push({ id: candidateId, name: probeData.name || `WABA ${candidateId}`, phoneNumbers });
              }
            } catch {}
          }
        }
      }

      return { success: true, tokenValidated: true, accounts };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });


  // 6.9. WABA: Get public channel info (verified phone for campaign links)
  const handleWabaChannelInfo = async (workspaceId: string, reply: FastifyReply) => {
    const normWsId = normalizeWorkspaceUuid(workspaceId);
    if (!normWsId) return reply.status(400).send({ error: 'Workspace inválido' });
    if (!dependencies.wabaChannelInfoGateway) {
      return reply.status(503).send({ error: 'Consulta WABA indisponível' });
    }
    const cfg = await dependencies.wabaChannelInfoGateway.findConnectedByWorkspaceId(normWsId);
    if (!cfg) return reply.status(404).send({ error: 'Canal WABA não configurado' });
    const creds = await getWabaCreds(normWsId);
    const credentialsAvailable = Boolean(creds?.phoneNumberId && creds?.wabaId && creds?.accessToken);
    return {
      success: true,
      configured: true,
      connected: credentialsAvailable,
      credentialsAvailable,
      accountStatus: credentialsAvailable ? 'CONNECTED' : 'CREDENTIALS_MISSING',
      phoneNumber: cfg.verifiedPhone || cfg.displayPhone || null,
      displayPhoneNumber: cfg.verifiedPhone || cfg.displayPhone || null,
      verifiedPhone: cfg.verifiedPhone || cfg.displayPhone || null,
      verifiedName: cfg.verifiedName || null,
      phoneNumberId: cfg.phoneNumberId || null,
      wabaId: cfg.wabaId || null,
      qualityRating: cfg.qualityRating || null,
    };
  };

  app.get('/api/v1/workspaces/:workspaceId/channels/waba/channel-info', async (request: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) => {
    return handleWabaChannelInfo(request.params.workspaceId, reply);
  });

  // 6.10. WABA: Get server-side Meta App and System Configuration (Configuração Simplificada)
  app.get('/api/v1/workspaces/:workspaceId/channels/waba/server-config', async (
    _request: FastifyRequest<{ Params: { workspaceId: string } }>,
    reply: FastifyReply
  ) => {
    const hasServerToken = Boolean(process.env.META_SYSTEM_USER_TOKEN);
    const configuredAppId = process.env.META_ID_APP || '2294262161340902';

    return reply.status(200).send({
      success: true,
      serverTokenAvailable: hasServerToken,
      appId: configuredAppId,
      appName: configuredAppId === '2294262161340902' ? 'CRM TX APP' : 'Meta Business App',
      defaultWabaId: '1749193841879179',
      defaultPhoneNumberId: '2498930403536552',
      defaultDisplayPhone: '+55 49 8837-0054',
      defaultVerifiedName: 'Haven Escovaria',
      webhookUrl: 'https://crm.iaparavendas.tech/api/v1/channels/waba/webhook',
      webhookLegacyUrl: 'https://crm.iaparavendas.tech/api/meta/webhook',
    });
  });

  // Explicit backend contract for the Arsenal UI. Unsupported actions are
  // fail-closed instead of being inferred from a connected WABA account.
  app.get('/api/v1/workspaces/:workspaceId/channels/waba/capabilities', async (
    request: FastifyRequest<{ Params: { workspaceId: string } }>,
    reply: FastifyReply
  ) => {
    const normWsId = normalizeWorkspaceUuid(request.params.workspaceId);
    if (!normWsId) return reply.status(400).send({ error: 'Workspace inválido' });
    if (!dependencies.wabaChannelInfoGateway) {
      return reply.status(503).send({ error: 'Capabilities WABA indisponíveis' });
    }

    const channel = await dependencies.wabaChannelInfoGateway.findConnectedByWorkspaceId(normWsId);
    const creds = await getWabaCreds(normWsId);
    const connected = Boolean(channel?.phoneNumberId && channel?.wabaId && creds?.phoneNumberId && creds?.accessToken);

    return {
      connected,
      capabilities: {
        flow: connected,
        buttons: connected,
        // The current send-buttons endpoint creates quick replies, not a
        // phone-number CTA. Advertising call=true would be a false contract.
        call: false,
        orderDetails: false,
        locationRequest: false,
        product: false,
        multiProduct: false,
        carousel: false,
      },
    };
  });

  const unsupportedWabaAction = async (_request: FastifyRequest, reply: FastifyReply) => reply.status(501).send({
    error: 'Ação WABA ainda não homologada no backend',
    code: 'WABA_CAPABILITY_NOT_IMPLEMENTED',
  });

  app.post('/api/v1/workspaces/:workspaceId/channels/waba/send-order-details', unsupportedWabaAction);
  app.post('/api/v1/workspaces/:workspaceId/channels/waba/send-location-request', unsupportedWabaAction);
  app.post('/api/v1/workspaces/:workspaceId/channels/waba/send-product', unsupportedWabaAction);
  app.post('/api/v1/workspaces/:workspaceId/channels/waba/send-multi-product', unsupportedWabaAction);
  app.post('/api/v1/workspaces/:workspaceId/channels/waba/send-carousel', unsupportedWabaAction);

  app.get('/api/v1/channels/waba/channel-info', async (request: FastifyRequest<{ Querystring: { workspaceId?: string } }>, reply: FastifyReply) => {
    const wsId = request.query?.workspaceId?.trim();
    if (!wsId) return reply.status(400).send({ error: 'workspaceId é obrigatório' });
    return handleWabaChannelInfo(wsId, reply);
  });

  // 7. WABA: List Approved Message Templates
  app.get('/api/v1/workspaces/:workspaceId/channels/waba/templates', async (request: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const creds = await getWabaCreds(workspaceId);
    if (!creds || !creds.wabaId || !creds.accessToken) {
      return reply.status(404).send({ error: 'Canal WABA não configurado ou desconectado para este workspace' });
    }
    try {
      const waba = new WabaClient();
      const templates = await waba.listTemplates(creds.wabaId, creds.accessToken);
      return { success: true, templates };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // 7.1. WABA: Create New Message Template (Direct Meta Graph API submission)
  app.post('/api/v1/workspaces/:workspaceId/channels/waba/create-template', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: {
      name: string;
      category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
      language?: string;
      bodyText: string;
      headerText?: string;
      footerText?: string;
      buttons?: Array<{ type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; text: string; url?: string; phoneNumber?: string }>;
    };
  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const { name, category, language = 'pt_BR', bodyText, headerText, footerText, buttons } = request.body || {};

    if (!name || !category || !bodyText) {
      return reply.status(400).send({ error: 'Campos obrigatórios: name, category, bodyText' });
    }

    const creds = await getWabaCreds(workspaceId);
    if (!creds || !creds.wabaId || !creds.accessToken) {
      return reply.status(404).send({ error: 'Canal WABA não configurado para este workspace' });
    }

    try {
      const waba = new WabaClient();
      const result = await waba.createTemplate({
        wabaId: creds.wabaId,
        accessToken: creds.accessToken,
        name,
        category,
        language,
        bodyText,
        headerText,
        footerText,
        buttons,
      });
      return { success: true, ...result, message: 'Template enviado com sucesso para aprovação na Meta!' };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // 7.2. WABA: Delete Message Template from Meta
  app.delete('/api/v1/workspaces/:workspaceId/channels/waba/templates/:templateName', async (request: FastifyRequest<{
    Params: { workspaceId: string; templateName: string };
  }>, reply: FastifyReply) => {
    const { workspaceId, templateName } = request.params;
    const creds = await getWabaCreds(workspaceId);
    if (!creds || !creds.wabaId || !creds.accessToken) {
      return reply.status(404).send({ error: 'Canal WABA não configurado' });
    }
    try {
      const waba = new WabaClient();
      const success = await waba.deleteTemplate(creds.wabaId, creds.accessToken, templateName);
      return { success, message: 'Template excluído com sucesso na Meta!' };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });


  // 8. WABA: Send Approved Template (HSM)
  app.post('/api/v1/workspaces/:workspaceId/channels/waba/send-template', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: { recipientPhone: string; templateName: string; languageCode?: string; headerMediaUrl?: string; bodyParameters?: string[] };
  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const { recipientPhone, templateName, languageCode = 'pt_BR', headerMediaUrl, bodyParameters = [] } = request.body || {};
    if (!recipientPhone || !templateName) {
      return reply.status(400).send({ error: 'recipientPhone e templateName são obrigatórios' });
    }
    const creds = await getWabaCreds(workspaceId);
    if (!creds || !creds.phoneNumberId || !creds.accessToken) {
      return reply.status(404).send({ error: 'Canal WABA não configurado para este workspace' });
    }
    try {
      const waba = new WabaClient();
      const result = await waba.sendTemplate({
        phoneNumberId: creds.phoneNumberId,
        accessToken: creds.accessToken,
        recipientPhone,
        templateName,
        languageCode,
        headerMediaUrl,
        bodyParameters,
      });
      return { success: true, ...result };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // 9. WABA: Send Interactive Quick Reply Buttons
  app.post('/api/v1/workspaces/:workspaceId/channels/waba/send-buttons', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: { recipientPhone: string; bodyText: string; headerText?: string; footerText?: string; buttons: Array<{ id: string; title: string }> };
  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const { recipientPhone, bodyText, headerText, footerText, buttons } = request.body || {};
    if (!recipientPhone || !bodyText || !Array.isArray(buttons) || buttons.length === 0) {
      return reply.status(400).send({ error: 'recipientPhone, bodyText e buttons são obrigatórios' });
    }
    const creds = await getWabaCreds(workspaceId);
    if (!creds || !creds.phoneNumberId || !creds.accessToken) {
      return reply.status(404).send({ error: 'Canal WABA não configurado para este workspace' });
    }
    try {
      const waba = new WabaClient();
      const result = await waba.sendInteractiveButtons({
        phoneNumberId: creds.phoneNumberId,
        accessToken: creds.accessToken,
        recipientPhone,
        bodyText,
        headerText,
        footerText,
        buttons,
      });
      return { success: true, ...result };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // 10. WABA: Send Interactive List Menu
  app.post('/api/v1/workspaces/:workspaceId/channels/waba/send-list', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: { recipientPhone: string; bodyText: string; buttonLabel: string; headerText?: string; footerText?: string; sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }> };
  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const { recipientPhone, bodyText, buttonLabel, headerText, footerText, sections } = request.body || {};
    if (!recipientPhone || !bodyText || !buttonLabel || !Array.isArray(sections) || sections.length === 0) {
      return reply.status(400).send({ error: 'recipientPhone, bodyText, buttonLabel e sections são obrigatórios' });
    }
    const creds = await getWabaCreds(workspaceId);
    if (!creds || !creds.phoneNumberId || !creds.accessToken) {
      return reply.status(404).send({ error: 'Canal WABA não configurado para este workspace' });
    }
    try {
      const waba = new WabaClient();
      const result = await waba.sendInteractiveList({
        phoneNumberId: creds.phoneNumberId,
        accessToken: creds.accessToken,
        recipientPhone,
        bodyText,
        buttonLabel,
        headerText,
        footerText,
        sections,
      });
      return { success: true, ...result };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // 11. WABA: Send Rich Media (Image, Audio PTT, Video, Document)
  app.post('/api/v1/workspaces/:workspaceId/channels/waba/send-media', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: { recipientPhone: string; mediaType: 'image' | 'audio' | 'video' | 'document'; mediaUrl: string; caption?: string; filename?: string };
  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const { recipientPhone, mediaType, mediaUrl, caption, filename } = request.body || {};
    if (!recipientPhone || !mediaType || !mediaUrl) {
      return reply.status(400).send({ error: 'recipientPhone, mediaType e mediaUrl são obrigatórios' });
    }
    const creds = await getWabaCreds(workspaceId);
    if (!creds || !creds.phoneNumberId || !creds.accessToken) {
      return reply.status(404).send({ error: 'Canal WABA não configurado para este workspace' });
    }
    try {
      const waba = new WabaClient();
      const result = await waba.sendMedia({
        phoneNumberId: creds.phoneNumberId,
        accessToken: creds.accessToken,
        recipientPhone,
        mediaType,
        mediaUrl,
        caption,
        filename,
      });
      return { success: true, ...result };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // 11.1. WABA: Send Interactive WhatsApp Flow (Native In-App Forms)
  app.post('/api/v1/workspaces/:workspaceId/channels/waba/send-flow', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: {
      recipientPhone: string;
      flowId: string;
      flowCta: string;
      bodyText: string;
      headerText?: string;
      footerText?: string;
      screenId?: string;
      flowData?: Record<string, unknown>;
    };
  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const { recipientPhone, flowId, flowCta, bodyText, headerText, footerText, screenId, flowData } = request.body || {};

    if (!recipientPhone || !flowId || !flowCta || !bodyText) {
      return reply.status(400).send({ error: 'Campos obrigatórios: recipientPhone, flowId, flowCta, bodyText' });
    }

    const creds = await getWabaCreds(workspaceId);
    if (!creds || !creds.phoneNumberId || !creds.accessToken) {
      return reply.status(404).send({ error: 'Canal WABA não configurado para este workspace' });
    }

    try {
      const waba = new WabaClient();
      const result = await waba.sendFlow({
        phoneNumberId: creds.phoneNumberId,
        accessToken: creds.accessToken,
        recipientPhone,
        flowId,
        flowCta,
        bodyText,
        headerText,
        footerText,
        screenId,
        flowData,
      });
      return { success: true, ...result, message: 'WhatsApp Flow disparado com sucesso!' };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });



  // 14. Group Broadcast Dispatcher
  app.post('/api/v1/workspaces/:workspaceId/groups/broadcast', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: {
      message: string;
      engine?: 'waha' | 'waba';
      targetGroupIds?: string[];
    };
  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const { message, engine = 'waha', targetGroupIds = [] } = request.body || {};

    if (!message || !message.trim()) {
      return reply.status(400).send({ error: 'Mensagem de broadcast não pode ser vazia.' });
    }
    if (engine !== 'waha') {
      return reply.status(422).send({
        error: 'A API Cloud da Meta não oferece broadcast para grupos. Use um canal WAHA conectado.',
        code: 'WABA_GROUP_BROADCAST_UNSUPPORTED',
      });
    }
    if (targetGroupIds.length === 0) {
      return reply.status(400).send({ error: 'Selecione ao menos um grupo para o broadcast.' });
    }

    const sessionName = getSessionName(workspaceId);
    let sentCount = 0;
    const errors: string[] = [];

    for (const groupId of targetGroupIds) {
      try {
        const wahaUrl = `${WAHA_BASE_URL}/api/sendText`;
        const res = await fetch(wahaUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': getWahaApiKey(),
          },
          body: JSON.stringify({
            session: sessionName,
            chatId: groupId.includes('@') ? groupId : `${groupId}@g.us`,
            text: message.trim(),
          }),
        });
        if (res.ok) {
          sentCount++;
        } else {
          const errData = await res.text();
          errors.push(`Grupo ${groupId}: ${errData}`);
        }
      } catch (e: any) {
        errors.push(`Grupo ${groupId}: ${e.message}`);
      }
    }

    return reply.status(200).send({
      success: true,
      workspaceId,
      engine,
      totalTargets: targetGroupIds.length,
      sentCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  });

  // 14.1 Mass Contact Broadcast Dispatcher with Throttle
  app.post('/api/v1/workspaces/:workspaceId/channels/broadcast', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: {
      targets: Array<{ phone: string; name?: string; id?: string }>;
      message: string;
      engine?: 'waha' | 'waba';
      templateName?: string;
      delaySeconds?: number;
    };
  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const { targets = [], message, engine = 'waha', templateName, delaySeconds = 5 } = request.body || {};

    if (!message && !templateName) {
      return reply.status(400).send({ error: 'Mensagem ou template é obrigatório para disparo em massa.' });
    }

    if (!Array.isArray(targets) || targets.length === 0) {
      return reply.status(400).send({ error: 'Lista de contatos alvo não pode ser vazia.' });
    }
    if (engine !== 'waha') {
      return reply.status(501).send({
        error: 'Broadcast Meta Cloud ainda não possui fila, template e rastreio homologados.',
        code: 'WABA_BROADCAST_NOT_IMPLEMENTED',
      });
    }

    const sessionName = getSessionName(workspaceId);
    let sentCount = 0;
    let failedCount = 0;
    const errors: string[] = [];
    const effectiveDelayMs = Math.max(0, Math.min(60, Number(delaySeconds) || 0)) * 1000;

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const rawPhone = (target.phone || '').replace(/\D/g, '');
      if (!rawPhone) {
        failedCount++;
        continue;
      }

      // Apply throttle delay between messages (skip before first message)
      if (i > 0 && effectiveDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, effectiveDelayMs));
      }

      try {
        const chatId = `${rawPhone}@c.us`;
        const wahaUrl = `${WAHA_BASE_URL}/api/sendText`;
        const res = await fetch(wahaUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': getWahaApiKey(),
          },
          body: JSON.stringify({
            session: sessionName,
            chatId,
            text: message.trim(),
          }),
        });
        if (res.ok) {
          sentCount++;
        } else {
          failedCount++;
          const errData = await res.text();
          errors.push(`Contato +${rawPhone}: ${errData}`);
        }
      } catch (err: any) {
        failedCount++;
        errors.push(`Contato +${rawPhone}: ${err.message}`);
      }
    }

    return reply.status(200).send({
      success: true,
      workspaceId,
      engine,
      totalTargets: targets.length,
      sentCount,
      failedCount,
      delaySeconds: effectiveDelayMs / 1000,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    });
  });

  // 15. Get Live WhatsApp Groups
  app.get('/api/v1/workspaces/:workspaceId/groups', async (request: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const sessionName = getSessionName(workspaceId);
    try {
      const res = await fetch(`${WAHA_BASE_URL}/api/${sessionName}/chats?limit=60`, {
        headers: { 'x-api-key': getWahaApiKey() },
      });
      if (!res.ok) {
        return { groups: [] };
      }
      const chats = (await res.json()) as any[];
      if (!Array.isArray(chats)) return { groups: [] };

      const rawGroups = chats.filter((c) => {
        const id = typeof c.id === 'string' ? c.id : (c.id?._serialized || '');
        return c.isGroup || id.endsWith('@g.us');
      });

      const groups = rawGroups.map((g, idx) => {
        const id = typeof g.id === 'string' ? g.id : (g.id?._serialized || `group_${idx}`);
        const groupName = g.name || `Grupo #${idx + 1}`;
        const lastMsgText = typeof g.lastMessage?.body === 'string'
          ? g.lastMessage.body
          : (g.lastMessage?.caption || (g.lastMessage?.hasMedia ? '[Mídia / Anexo]' : 'Grupo WhatsApp ativo'));
        const lastMsgSender = g.lastMessage?._data?.notifyName || (g.lastMessage?.author ? `+${g.lastMessage.author.split('@')[0]}` : 'Participante');
        const lastMsgTime = g.lastMessage?.timestamp
          ? new Date(g.lastMessage.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : 'Hoje';

        return {
          id,
          name: groupName,
          clientName: groupName.split('+')[0]?.trim() || groupName,
          category: 'client_account',
          engine: 'waha',
          healthStatus: g.unreadCount && g.unreadCount > 0 ? 'pending_action' : 'active',
          participantCount: g.participants?.length || g.groupMetadata?.participants?.length || 12,
          unreadCount: g.unreadCount || 0,
          lastMessage: {
            sender: lastMsgSender,
            text: lastMsgText,
            timestamp: lastMsgTime,
            isClient: true,
          },
          pendingTaskCount: g.unreadCount ? 1 : 0,
          assignedManagerName: 'Gestor da Conta',
          pinned: Boolean(g.pinned),
          tags: ['WhatsApp', 'Operação'],
          notes: 'Grupo sincronizado via WAHA',
        };
      });

      return { groups };
    } catch (err: any) {
      return { groups: [], error: err.message };
    }
  });

  // 15b. Send Direct Message to a WhatsApp Group (WAHA)
  app.post('/api/v1/workspaces/:workspaceId/groups/:groupId/send-message', async (request: FastifyRequest<{
    Params: { workspaceId: string; groupId: string };
    Body: { text: string };
  }>, reply: FastifyReply) => {
    const { workspaceId, groupId } = request.params;
    const { text } = (request.body || {}) as { text: string };

    if (!text || !text.trim()) {
      return reply.status(400).send({ error: 'Texto da mensagem não pode ser vazio.' });
    }

    const sessionName = getSessionName(workspaceId);
    try {
      const wahaRes = await fetch(`${WAHA_BASE_URL}/api/sendText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': getWahaApiKey() },
        body: JSON.stringify({
          session: sessionName,
          chatId: groupId,
          text: text.trim(),
        }),
      });

      if (!wahaRes.ok) {
        const errJson: unknown = await wahaRes.json().catch(() => ({}));
        const providerMessage = errJson
          && typeof errJson === 'object'
          && typeof (errJson as { message?: unknown }).message === 'string'
          ? (errJson as { message: string }).message
          : 'Falha ao enviar mensagem ao grupo via WAHA.';
        return reply.status(wahaRes.status).send({ error: providerMessage });
      }

      return { success: true, sentAt: new Date().toISOString() };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // 15c. Mark a WhatsApp Group as Resolved (WAHA sendSeen & status update)
  app.post('/api/v1/workspaces/:workspaceId/groups/:groupId/resolve', async (request: FastifyRequest<{
    Params: { workspaceId: string; groupId: string };
    Body: { resolved?: boolean };
  }>, reply: FastifyReply) => {
    const { workspaceId, groupId } = request.params;
    const { resolved = true } = (request.body || {}) as { resolved?: boolean };
    const sessionName = getSessionName(workspaceId);

    try {
      // Clear unread badge in WAHA if resolving
      if (resolved) {
        await fetch(`${WAHA_BASE_URL}/api/sendSeen`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': getWahaApiKey() },
          body: JSON.stringify({
            session: sessionName,
            chatId: groupId,
          }),
        }).catch(() => {});
      }

      return reply.code(200).send({
        success: true,
        groupId,
        resolved,
        resolvedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      return reply.code(200).send({
        success: true,
        groupId,
        resolved,
        resolvedAt: new Date().toISOString(),
        warning: err.message,
      });
    }
  });

  // 16. Queue a message to a Journey Contact through the supervised outbound
  // lifecycle. This endpoint intentionally does not call WABA or WAHA itself:
  // a direct fallback could silently use another business number and an
  // ambiguous provider failure must never appear as a successful send.
  app.post('/api/v1/workspaces/:workspaceId/journeys/:journeyId/send-message', async (request: FastifyRequest<{
    Params: { workspaceId: string; journeyId: string };
    Body: { text: string };
  }>, reply: FastifyReply) => {
    const { workspaceId, journeyId } = request.params;
    const { text } = (request.body || {}) as { text: string };

    if (!text || !text.trim()) {
      return reply.status(400).send({ error: 'Texto da mensagem não pode ser vazio.' });
    }

    const actor = request.operatorActor;
    if (!actor) return reply.status(401).send({ error: 'Operador não autenticado.', statusCode: 401 });
    if (!dependencies.outboundDispatchGateway) {
      return reply.status(503).send({ error: 'Fila segura de envio indisponível.', statusCode: 503 });
    }

    try {
      const draft = await dependencies.outboundDispatchGateway.createDraft(actor, {
        workspaceId,
        journeyId,
        textContent: text.trim(),
        idempotencyKey: crypto.randomUUID(),
      });
      if (!draft) return reply.status(404).send({ error: 'Jornada não encontrada.', statusCode: 404 });

      const approved = await dependencies.outboundDispatchGateway.approve(actor, {
        workspaceId,
        dispatchId: draft.dispatchId,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!approved) return reply.status(404).send({ error: 'Mensagem não encontrada.', statusCode: 404 });

      return reply.code(202).send({
        success: true,
        dispatchId: approved.dispatchId,
        status: approved.status,
        message: 'Mensagem enfileirada para envio pelo canal da conversa.',
      });
    } catch (err: any) {
      request.log.warn({ err, workspaceId, journeyId }, 'Unable to queue supervised outbound message');
      return reply.status(409).send({
        error: 'Não foi possível enfileirar a mensagem com segurança.',
        statusCode: 409,
      });
    }
  });

  // 17. List Workspace Contacts from Database (for Starting New Conversations)
  app.get('/api/v1/workspaces/:workspaceId/contacts', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Querystring: { search?: string; limit?: string };

  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const { search = '', limit = '50' } = request.query || {};
    const client = await dbPool.connect();
    try {
      const query = `
        SELECT 
          c.id, c.phone, c.name, c.whatsapp_id, c.created_at, c.updated_at,
          j.id AS journey_id, j.status AS journey_status, j.pipeline_stage,
          (
            SELECT m.text_content 
            FROM public.conversation_messages m 
            WHERE m.contact_id = c.id AND m.workspace_id = $1 
            ORDER BY m.sent_at DESC 
            LIMIT 1
          ) AS last_message,
          (
            SELECT m.sent_at 
            FROM public.conversation_messages m 
            WHERE m.contact_id = c.id AND m.workspace_id = $1 
            ORDER BY m.sent_at DESC 
            LIMIT 1
          ) AS last_message_at
        FROM public.contacts c
        LEFT JOIN public.commercial_journeys j 
          ON j.contact_id = c.id AND j.workspace_id = $1 AND j.status = 'OPEN'
        WHERE c.workspace_id = $1
          AND ($2 = '' OR c.name ILIKE $3 OR c.phone ILIKE $3)
        ORDER BY COALESCE((
          SELECT m.sent_at FROM public.conversation_messages m 
          WHERE m.contact_id = c.id AND m.workspace_id = $1 
          ORDER BY m.sent_at DESC LIMIT 1
        ), c.updated_at) DESC
        LIMIT $4
      `;
      const searchPattern = `%${search.trim()}%`;
      const res = await client.query(query, [workspaceId, search.trim(), searchPattern, parseInt(limit, 10) || 50]);
      return { success: true, contacts: res.rows };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message, statusCode: 500 });
    } finally {
      client.release();
    }
  });

  // 18. Start New Conversation with Contact / Database Phone
  app.post('/api/v1/workspaces/:workspaceId/conversations/start', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: { phone: string; name?: string; message?: string; templateName?: string; templateParams?: string[] };
  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const { phone, name, message, templateName, templateParams = [] } = request.body || {};

    if (!phone || !phone.trim()) {
      return reply.status(400).send({ error: 'Número de telefone é obrigatório.' });
    }
    if (message?.trim() && !dependencies.outboundDispatchGateway) {
      return reply.status(503).send({ error: 'Fila segura de envio indisponível.', statusCode: 503 });
    }

    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length === 10 || cleanPhone.length === 11) {
      cleanPhone = `55${cleanPhone}`;
    }
    const whatsappTarget = `${cleanPhone}@c.us`;
    const contactName = name?.trim() || `Lead ${cleanPhone.slice(-4)}`;

    const client = await dbPool.connect();
    try {
      // 1. Get channel connection
      const chRes = await client.query(`
        SELECT id, provider FROM public.channel_connections 
        WHERE workspace_id = $1 AND status = 'CONNECTED' 
        ORDER BY CASE WHEN provider = 'meta_cloud' THEN 1 WHEN provider = 'waha' THEN 2 ELSE 3 END
        LIMIT 1
      `, [workspaceId]);

      let channelConnectionId = chRes.rowCount && chRes.rowCount > 0 ? chRes.rows[0].id : null;
      if (!channelConnectionId) {
        const anyCh = await client.query(`
          SELECT id FROM public.channel_connections
          WHERE workspace_id = $1
          ORDER BY CASE WHEN provider = 'meta_cloud' THEN 1 WHEN provider = 'waha' THEN 2 ELSE 3 END
          LIMIT 1
        `, [workspaceId]);
        channelConnectionId = anyCh.rowCount && anyCh.rowCount > 0 ? anyCh.rows[0].id : null;
      }

      // 2. Upsert Contact
      const contactRes = await client.query(`
        INSERT INTO public.contacts (id, workspace_id, phone, name, whatsapp_id, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())
        ON CONFLICT (workspace_id, phone) DO UPDATE 
        SET name = COALESCE(NULLIF(EXCLUDED.name, ''), public.contacts.name), updated_at = NOW()
        RETURNING id, phone, name
      `, [workspaceId, cleanPhone, contactName, whatsappTarget]);

      const contactId = contactRes.rows[0].id;

      // 3. Find or Create Open Commercial Journey
      let journeyId: string;
      const existingJourney = await client.query(`
        SELECT id FROM public.commercial_journeys WHERE workspace_id = $1 AND contact_id = $2 AND status = 'OPEN' LIMIT 1
      `, [workspaceId, contactId]);

      if (existingJourney.rowCount && existingJourney.rowCount > 0) {
        journeyId = existingJourney.rows[0].id;
        await client.query(`UPDATE public.commercial_journeys SET updated_at = NOW() WHERE id = $1`, [journeyId]);
      } else {
        const newJourney = await client.query(`
          INSERT INTO public.commercial_journeys (
            id, workspace_id, contact_id, channel_connection_id, status, pipeline_stage,
            total_revenue_minor, currency, started_at, created_at, updated_at
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, 'OPEN', 'NEW', 0, 'BRL', NOW(), NOW(), NOW()
          )
          ON CONFLICT (workspace_id, contact_id) WHERE status = 'OPEN' DO UPDATE SET updated_at = NOW()
          RETURNING id
        `, [workspaceId, contactId, channelConnectionId]);
        journeyId = newJourney.rows[0].id;
      }

      // 4. Queue an initial text through the same durable lifecycle used by
      // the cockpit. The worker selects the journey's persisted channel; this
      // route never falls back across WABA/WAHA or manufactures a message ID.
      let dispatchId: string | null = null;
      let templateMessageId: string | null = null;
      if (message && message.trim()) {
        const actor = request.operatorActor;
        if (!actor || !dependencies.outboundDispatchGateway) {
          return reply.status(503).send({ error: 'Fila segura de envio indisponível.', statusCode: 503 });
        }
        const draft = await dependencies.outboundDispatchGateway.createDraft(actor, {
          workspaceId,
          journeyId,
          textContent: message.trim(),
          idempotencyKey: crypto.randomUUID(),
        });
        if (!draft) return reply.status(409).send({ error: 'Não foi possível preparar a mensagem.', statusCode: 409 });
        const approved = await dependencies.outboundDispatchGateway.approve(actor, {
          workspaceId,
          dispatchId: draft.dispatchId,
          idempotencyKey: crypto.randomUUID(),
        });
        if (!approved) return reply.status(409).send({ error: 'Não foi possível liberar a mensagem.', statusCode: 409 });
        dispatchId = approved.dispatchId;
      }

      // Templates are an explicit Meta Cloud operation. They are never
      // rerouted through WAHA, and the local message record is created only
      // after Meta returns a provider message id.
      if (templateName) {
        const selectedChannel = await client.query(`
          SELECT cc.id
          FROM public.commercial_journeys j
          JOIN public.channel_connections cc ON cc.id = j.channel_connection_id
          WHERE j.id = $1
            AND j.workspace_id = $2
            AND cc.workspace_id = $2
            AND cc.provider = 'meta_cloud'
            AND cc.status = 'CONNECTED'
          LIMIT 1
        `, [journeyId, workspaceId]);
        if (!selectedChannel.rowCount) {
          return reply.status(409).send({
            error: 'Esta conversa não está vinculada a um canal Meta Cloud conectado para envio de template.',
            statusCode: 409,
          });
        }
        const creds = await getWabaCreds(workspaceId);
        if (!creds?.phoneNumberId || !creds.accessToken) {
          return reply.status(409).send({ error: 'Credenciais Meta Cloud indisponíveis para este workspace.', statusCode: 409 });
        }
        const result = await new WabaClient().sendTemplate({
          phoneNumberId: creds.phoneNumberId,
          accessToken: creds.accessToken,
          recipientPhone: cleanPhone,
          templateName,
          languageCode: 'pt_BR',
          bodyParameters: templateParams,
        });
        templateMessageId = result?.messageId || null;
        if (!templateMessageId) {
          return reply.status(502).send({ error: 'A Meta não confirmou o envio do template.', statusCode: 502 });
        }
        await client.query(`
          INSERT INTO public.conversation_messages (
            id, workspace_id, channel_connection_id, journey_id, contact_id,
            direction, sender_type, provider_message_id, text_content, sent_at
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4,
            'outbound', 'operator', $5, $6, NOW()
          )
          ON CONFLICT (channel_connection_id, provider_message_id) DO NOTHING
        `, [workspaceId, selectedChannel.rows[0].id, journeyId, contactId, templateMessageId, `[Template] ${templateName}`]);
      }

      return {
        success: true,
        journeyId,
        contactId,
        phone: cleanPhone,
        name: contactName,
        dispatchId,
        templateMessageId,
        message: dispatchId
          ? 'Conversa criada e mensagem enfileirada para envio seguro.'
          : templateMessageId
            ? 'Conversa criada e template aceito pela Meta.'
          : 'Conversa iniciada com sucesso!',
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message, statusCode: 500 });
    } finally {
      client.release();
    }
  });

  // ==========================================
  // 12. TRACKING & ATTRIBUTION (CAPI + UTM)
  // ==========================================


  // 12.1. GET tracking settings for a workspace
  app.get('/api/v1/workspaces/:workspaceId/tracking', async (request: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const client = await dbPool.connect();
    try {
      const res = await client.query(`
        SELECT cc.public_config,
               EXISTS (
                 SELECT 1
                 FROM public.channel_connection_secrets cs
                 WHERE cs.channel_connection_id = cc.id
                   AND cs.secret_kind IN ('meta_capi_token', 'meta_bearer_token')
                   AND COALESCE(cs.secret_payload->>'accessToken', '') <> ''
               ) AS meta_token_configured
        FROM public.channel_connections cc
        WHERE cc.workspace_id = $1
          AND cc.provider IN ('meta_cloud', 'waha')
          AND cc.status = 'CONNECTED'
          AND cc.phone_number <> 'Meta CAPI Tracking'
        ORDER BY CASE WHEN provider = 'meta_cloud' THEN 1 ELSE 2 END
        LIMIT 1
      `, [workspaceId]);

      if (res.rowCount && res.rowCount > 0) {
        const raw = res.rows[0].public_config;
        const cfg = typeof raw === 'string' ? JSON.parse(raw) : raw || {};
        return {
          success: true,
          tracking: {
            metaPixelId: cfg.metaPixelId || cfg.meta_capi_pixel_id || cfg.pixelId || '',
            metaDatasetId: cfg.metaDatasetId || cfg.meta_capi_dataset_id || cfg.datasetId || '',
            metaAccessTokenConfigured: Boolean(res.rows[0].meta_token_configured),
            metaCapiEnabled: cfg.metaCapiEnabled !== false,
            googleAdsCustomerId: cfg.googleAdsCustomerId || '',
            googleConversionId: cfg.googleConversionId || '',
            googleGclidTracking: cfg.googleGclidTracking !== false,
            campaignMappings: cfg.campaignMappings || [],
          },
        };
      }

      return {
        success: true,
        tracking: null,
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    } finally {
      client.release();
    }
  });

  // 12.2. POST / SAVE tracking settings for a workspace
  app.post('/api/v1/workspaces/:workspaceId/tracking', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: {
      metaPixelId?: string;
      metaDatasetId?: string;
      metaAccessToken?: string;
      metaCapiEnabled?: boolean;
      googleAdsCustomerId?: string;
      googleConversionId?: string;
      googleGclidTracking?: boolean;
      campaignMappings?: any[];
    };
  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const parsedBody = trackingSettingsBodySchema.safeParse(request.body || {});
    if (!parsedBody.success) {
      return reply.status(422).send({
        success: false,
        code: 'INVALID_TRACKING_SETTINGS',
        error: 'Configuração de rastreamento inválida.',
      });
    }
    const body = parsedBody.data;
    const tokenToStore = body.metaAccessToken?.trim() || '';
    const client = await dbPool.connect();
    try {
      // Tracking is metadata of a real messaging connection. Never create a
      // fake CONNECTED meta_cloud row: that makes the UI report a duplicated
      // WABA channel and breaks provider ownership.
      const existing = await client.query(`
        SELECT id, provider, public_config
        FROM public.channel_connections
        WHERE workspace_id = $1
          AND provider IN ('meta_cloud', 'waha')
          AND status = 'CONNECTED'
          AND phone_number <> 'Meta CAPI Tracking'
        ORDER BY CASE WHEN provider = 'meta_cloud' THEN 1 ELSE 2 END
        LIMIT 1
      `, [workspaceId]);

      if (!existing.rowCount) {
        return reply.status(409).send({
          success: false,
          code: 'WHATSAPP_CHANNEL_REQUIRED',
          error: 'Conecte primeiro um número WhatsApp oficial ou WAHA neste workspace.',
        });
      }

      const connectionId = existing.rows[0].id as string;
      const raw = existing.rows[0].public_config;
      let publicConfig: Record<string, any> = typeof raw === 'string' ? JSON.parse(raw) : raw || {};

      // Remove any legacy secret-bearing keys before persisting public config.
      const {
        metaAccessToken: _legacyMetaAccessToken,
        meta_capi_access_token: _legacyCapiAccessToken,
        _secret_token: _legacySecretToken,
        pageAccessToken: _legacyPageAccessToken,
        verifyToken: _legacyVerifyToken,
        ...safePublicConfig
      } = publicConfig;

      // Merge non-secret tracking config only.
      publicConfig = {
        ...safePublicConfig,
        metaPixelId: body.metaPixelId ?? safePublicConfig.metaPixelId,
        metaDatasetId: body.metaDatasetId ?? safePublicConfig.metaDatasetId,
        // Pixel and Dataset are distinct Meta identifiers. Never copy one into
        // the other: doing so makes a syntactically valid configuration point
        // at the wrong data source and is impossible to audit later.
        meta_capi_pixel_id: body.metaPixelId ?? safePublicConfig.meta_capi_pixel_id,
        meta_capi_dataset_id: body.metaDatasetId ?? safePublicConfig.meta_capi_dataset_id,
        metaCapiEnabled: body.metaCapiEnabled ?? safePublicConfig.metaCapiEnabled ?? true,
        googleAdsCustomerId: body.googleAdsCustomerId ?? safePublicConfig.googleAdsCustomerId,
        googleConversionId: body.googleConversionId ?? safePublicConfig.googleConversionId,
        googleGclidTracking: body.googleGclidTracking ?? safePublicConfig.googleGclidTracking ?? true,
        campaignMappings: body.campaignMappings ?? safePublicConfig.campaignMappings ?? [],
      };

      await client.query(`
        UPDATE public.channel_connections
        SET public_config = $1, updated_at = NOW()
        WHERE id = $2
      `, [JSON.stringify(publicConfig), connectionId]);

      if (tokenToStore) {
        await client.query(`
          INSERT INTO public.channel_connection_secrets (
            channel_connection_id, workspace_id, secret_kind, secret_payload, created_at, updated_at
          ) VALUES (
            $1, $2, 'meta_capi_token', $3::jsonb, NOW(), NOW()
          )
          ON CONFLICT (channel_connection_id, secret_kind)
          DO UPDATE SET secret_payload = EXCLUDED.secret_payload, updated_at = NOW()
        `, [connectionId, workspaceId, JSON.stringify({ accessToken: tokenToStore })]);
      }

      return {
        success: true,
        message: 'Configurações de Atribuição & Ads (CAPI) salvas no banco com sucesso!',
        config: {
          metaPixelId: publicConfig.metaPixelId,
          metaDatasetId: publicConfig.metaDatasetId,
          metaCapiEnabled: publicConfig.metaCapiEnabled,
          googleAdsCustomerId: publicConfig.googleAdsCustomerId,
        },
      };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    } finally {
      client.release();
    }
  });

  // 12.3. Test live CAPI event dispatch directly with Meta
  app.post('/api/v1/workspaces/:workspaceId/tracking/test-capi', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: {
      pixelId?: string;
      datasetId?: string;
      accessToken?: string;
      testEventCode?: string;
      eventName?: string;
      phone?: string;
    };
  }>, reply: FastifyReply) => {
    const { pixelId, datasetId, accessToken, testEventCode, eventName, phone } = request.body || {};
    const targetPixelId = (pixelId || datasetId || '').trim();
    const token = (accessToken || '').trim();

    // This endpoint sends a deliberately synthetic event directly to Meta.
    // Without a Test Events code it would become a real Lead/Purchase and
    // contaminate campaign optimisation. Keep the guard server-side because
    // the browser cannot be trusted to enforce an optional UI field.
    if (!testEventCode?.trim()) {
      return reply.status(409).send({
        success: false,
        code: 'CAPI_TEST_EVENT_CODE_REQUIRED',
        error: 'Informe o Test Event Code da Meta. Eventos de teste sem esse código poderiam contaminar a atribuição real.',
      });
    }

    if (!targetPixelId || !token) {
      return reply.status(400).send({
        success: false,
        error: 'Meta Dataset/Pixel ID e Access Token são obrigatórios para testar o CAPI.',
      });
    }

    const cleanPhone = (phone || '').replace(/\D/g, '');
    if (cleanPhone.length < 8) {
      return reply.status(400).send({
        success: false,
        code: 'CAPI_TEST_PHONE_REQUIRED',
        error: 'Informe o telefone real de um contato de teste antes de disparar o evento.',
      });
    }
    const phoneHash = crypto.createHash('sha256').update(cleanPhone).digest('hex');
    const selectedEvent = eventName || 'Lead';

    const testPayload = {
      data: [
        {
          event_name: selectedEvent,
          event_time: Math.floor(Date.now() / 1000),
          action_source: 'system_generated',
          user_data: {
            ph: [phoneHash],
          },
          custom_data: {
            content_name: `SOS Sales CAPI test (${selectedEvent})`,
            content_category: 'whatsapp_crm_tracking',
          },
        },
      ],
      test_event_code: testEventCode.trim(),
    };

    try {
      const metaRes = await fetch(
        `https://graph.facebook.com/v20.0/${encodeURIComponent(targetPixelId)}/events?access_token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testPayload),
        }
      );

      const metaData = (await metaRes.json().catch(() => ({}))) as any;

      if (!metaRes.ok || metaData?.error) {
        return reply.status(400).send({
          success: false,
          error: metaData?.error?.message || 'Falha no disparo do evento CAPI para a Meta.',
          metaDetails: metaData,
        });
      }

      return {
        success: true,
        eventsReceived: metaData?.events_received || 1,
        fbtraceId: metaData?.fbtrace_id,
        messages: metaData?.messages || [],
        raw: metaData,
        message: `Evento CAPI "${selectedEvent}" enviado e recebido com sucesso pela Meta!`,
      };
    } catch (err: any) {
      return reply.status(500).send({
        success: false,
        error: `Erro de conexão com a Meta Graph API: ${err.message}`,
      });
    }
  });

  // 12.4. Discover and list Meta Datasets / Pixels via Access Token (for Login Auth)
  app.post('/api/v1/workspaces/:workspaceId/tracking/meta/list-datasets', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: { accessToken?: string };
  }>, reply: FastifyReply) => {
    const { accessToken } = request.body || {};
    const token = (accessToken || '').trim();

    if (!token) {
      return reply.status(400).send({
        success: false,
        error: 'Access Token da Meta é obrigatório para listar conjuntos de dados.',
      });
    }

    try {
      const foundDatasets: Array<{
        id: string;
        name: string;
        type: 'dataset' | 'pixel';
        owner?: string;
      }> = [];
      const seenIds = new Set<string>();

      // 1. Inspect token via debug_token
      try {
        const debugRes = await fetch(`https://graph.facebook.com/v20.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`);
        if (debugRes.ok) {
          const debugData = (await debugRes.json()) as any;
          const granularScopes = debugData?.data?.granular_scopes;
          const appName = debugData?.data?.application || 'Meta Application';
          if (Array.isArray(granularScopes)) {
            for (const scopeItem of granularScopes) {
              if (Array.isArray(scopeItem.target_ids)) {
                for (const targetId of scopeItem.target_ids) {
                  if (!seenIds.has(targetId)) {
                    seenIds.add(targetId);
                    foundDatasets.push({
                      id: targetId,
                      name: `Conjunto de Dados / Pixel (${targetId})`,
                      type: 'dataset',
                      owner: appName || 'Meta Business',
                    });
                  }
                }
              }
            }
          }
        }
      } catch {}

      // 2. Fetch Ad Accounts and Pixels / Datasets
      try {
        const adAccountsRes = await fetch(`https://graph.facebook.com/v20.0/me/adaccounts?fields=id,name,account_id,pixels{id,name}&access_token=${encodeURIComponent(token)}`);
        if (adAccountsRes.ok) {
          const adData = (await adAccountsRes.json()) as any;
          if (Array.isArray(adData?.data)) {
            for (const acc of adData.data) {
              const pixels = acc?.pixels?.data;
              if (Array.isArray(pixels)) {
                for (const px of pixels) {
                  if (px.id && !seenIds.has(px.id)) {
                    seenIds.add(px.id);
                    foundDatasets.push({
                      id: px.id,
                      name: px.name || `Pixel ${px.id}`,
                      type: 'pixel',
                      owner: acc.name || `Conta de Anúncios ${acc.account_id}`,
                    });
                  }
                }
              }
            }
          }
        }
      } catch {}

      // 3. Fetch Businesses and Owned Pixels / Datasets
      try {
        const bizRes = await fetch(`https://graph.facebook.com/v20.0/me/businesses?fields=id,name,owned_pixels{id,name},client_pixels{id,name}&access_token=${encodeURIComponent(token)}`);
        if (bizRes.ok) {
          const bizData = (await bizRes.json()) as any;
          if (Array.isArray(bizData?.data)) {
            for (const biz of bizData.data) {
              const owned = [...(biz.owned_pixels?.data || []), ...(biz.client_pixels?.data || [])];
              for (const px of owned) {
                if (px.id && !seenIds.has(px.id)) {
                  seenIds.add(px.id);
                  foundDatasets.push({
                    id: px.id,
                    name: px.name || `Pixel ${px.id}`,
                    type: 'dataset',
                    owner: biz.name,
                  });
                }
              }
            }
          }
        }
      } catch {}

      return {
        success: true,
        datasets: foundDatasets,
        count: foundDatasets.length,
      };
    } catch (err: any) {
      return reply.status(500).send({
        success: false,
        error: `Erro ao buscar conjuntos de dados da Meta: ${err.message}`,
      });
    }
  });

  // 12.5. Simulate & Verify Real Meta Ads / UTM Lead Ingestion
  app.post('/api/v1/workspaces/:workspaceId/tracking/simulate-lead-attribution', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body: {
      messageText: string;
      phone?: string;
      contactName?: string;
      referralPayload?: any;
    };
  }>, reply: FastifyReply) => {
    // This route exists only for an explicitly enabled lab/test harness. It
    // must not be discoverable as a production data-writing primitive.
    if (!isSyntheticTestDataEnabled()) {
      return reply.status(404).send({
        success: false,
        code: 'SYNTHETIC_TEST_DATA_DISABLED',
        error: 'A simulação de lead está desabilitada fora de um ambiente de teste explícito.',
      });
    }

    const { workspaceId } = request.params;
    const {
      messageText,
      phone,
      contactName,
      referralPayload,
    } = request.body || {};

    if (!messageText?.trim() || !phone?.trim() || !contactName?.trim()) {
      return reply.status(400).send({
        success: false,
        code: 'SYNTHETIC_INPUT_REQUIRED',
        error: 'messageText, phone e contactName são obrigatórios para uma simulação explícita.',
      });
    }

    const client = await dbPool.connect();
    try {
      // 1. Fetch channel connection and campaigns
      let channelConnectionId: string;
      const chRes = await client.query(`
        SELECT id, public_config
        FROM public.channel_connections
        WHERE workspace_id = $1
          AND status = 'CONNECTED'
          AND provider IN ('meta_cloud', 'waha')
          AND phone_number <> 'Meta CAPI Tracking'
        ORDER BY CASE WHEN provider = 'meta_cloud' THEN 1 ELSE 2 END, created_at ASC
        LIMIT 1
      `, [workspaceId]);
      if (!chRes.rowCount) {
        return reply.status(409).send({
          success: false,
          code: 'WHATSAPP_CHANNEL_REQUIRED',
          error: 'A simulação exige um canal WhatsApp conectado no workspace; nenhum canal sintético será criado.',
        });
      }
      channelConnectionId = chRes.rows[0].id;
      const pubCfg: any = chRes.rows[0].public_config || {};

          const campaigns = Array.isArray(pubCfg?.campaignMappings)
            ? pubCfg.campaignMappings
            : Array.isArray(pubCfg?.trackingConfig?.campaigns)
              ? pubCfg.trackingConfig.campaigns
              : [];

      // 2. Upsert Contact
      const contactRes = await client.query(`
        INSERT INTO public.contacts (id, workspace_id, phone, whatsapp_id, name, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())
        ON CONFLICT (workspace_id, phone) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
        RETURNING id
      `, [workspaceId, phone, `${phone}@s.whatsapp.net`, contactName]);
      const contactId = contactRes.rows[0].id;

      // 3. Create or get Journey
      let journeyId: string;
      const existingJourney = await client.query(`
        SELECT id FROM public.commercial_journeys WHERE workspace_id = $1 AND contact_id = $2 LIMIT 1
      `, [workspaceId, contactId]);

      if (existingJourney.rowCount && existingJourney.rowCount > 0) {
        journeyId = existingJourney.rows[0].id;
      } else {
        const newJ = await client.query(`
          INSERT INTO public.commercial_journeys (id, workspace_id, contact_id, channel_connection_id, status, pipeline_stage, total_revenue_minor, currency, started_at, created_at, updated_at)
          VALUES (gen_random_uuid(), $1, $2, $3, 'OPEN', 'NEW', 0, 'BRL', NOW(), NOW(), NOW())
          RETURNING id
        `, [workspaceId, contactId, channelConnectionId]);
        journeyId = newJ.rows[0].id;
      }

      // 4. Insert Conversation Message
      const msgId = `synthetic_${Date.now()}`;
      await client.query(`
        INSERT INTO public.conversation_messages (
          id, workspace_id, channel_connection_id, journey_id, contact_id,
          direction, sender_type, provider_message_id, text_content, sent_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, 'inbound', 'customer', $5, $6, NOW()
        )
      `, [workspaceId, channelConnectionId, journeyId, contactId, msgId, messageText]);

      // 5. Extract & Persist Attribution
      const attr = AttributionService.extractAttribution(messageText, referralPayload, campaigns);
      let contextId = null;
      if (attr) {
        contextId = await AttributionService.persistAttribution(client, workspaceId, journeyId, attr, new Date());
      }

      return {
        success: true,
        message: 'Lead sintético criado no ambiente de teste explícito.',
        journeyId,
        contactId,
        attribution: attr,
        contextId,
      };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });

  // 12.6. Retroactive Attribution Reconciliation & Batch History Scan
  app.post('/api/v1/workspaces/:workspaceId/tracking/reconcile-retroactive', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Body?: {
      limit?: number;
      forceRescan?: boolean;
    };
  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const { limit = 200, forceRescan = false } = request.body || {};

    const client = await dbPool.connect();
    try {
      // 1. Fetch campaigns config
      const chRes = await client.query(
        `SELECT public_config
         FROM public.channel_connections
         WHERE workspace_id = $1
           AND provider IN ('meta_cloud', 'waha')
           AND status = 'CONNECTED'
           AND phone_number <> 'Meta CAPI Tracking'
         ORDER BY CASE WHEN provider = 'meta_cloud' THEN 1 ELSE 2 END, created_at ASC
         LIMIT 1`,
        [workspaceId]
      );
      const pubCfg = chRes.rows[0]?.public_config || {};
      const campaigns = Array.isArray(pubCfg?.campaignMappings)
        ? pubCfg.campaignMappings
        : Array.isArray(pubCfg?.trackingConfig?.campaigns)
          ? pubCfg.trackingConfig.campaigns
          : [];

      // 2. Fetch journeys that either don't have acquisition_contexts or need rescan
      const journeysQuery = forceRescan
        ? `SELECT j.id, j.status, j.total_revenue_minor, j.started_at 
           FROM public.commercial_journeys j 
           WHERE j.workspace_id = $1 
           ORDER BY j.created_at DESC LIMIT $2`
        : `SELECT j.id, j.status, j.total_revenue_minor, j.started_at 
           FROM public.commercial_journeys j 
           WHERE j.workspace_id = $1 
             AND NOT EXISTS (
               SELECT 1 FROM public.acquisition_contexts ac WHERE ac.journey_id = j.id
             )
           ORDER BY j.created_at DESC LIMIT $2`;

      const journeysRes = await client.query(journeysQuery, [workspaceId, limit]);
      const journeys = journeysRes.rows;

      let reconciledCount = 0;
      let totalAttributedRevenueMinor = 0;
      const campaignBreakdown: Record<string, { leads: number; revenueMinor: number }> = {};

      for (const j of journeys) {
        // Fetch first inbound message
        const msgRes = await client.query(
          `SELECT text_content, sent_at, provider_message_id 
           FROM public.conversation_messages 
           WHERE journey_id = $1 AND direction = 'inbound' 
           ORDER BY sent_at ASC LIMIT 1`,
          [j.id]
        );

        if (msgRes.rowCount && msgRes.rowCount > 0) {
          const firstMsg = msgRes.rows[0];
          const attr = AttributionService.extractAttribution(
            firstMsg.text_content,
            {},
            campaigns
          );

          if (attr) {
            await AttributionService.persistAttribution(
              client,
              workspaceId,
              j.id,
              attr,
              firstMsg.sent_at || j.started_at || new Date()
            );

            reconciledCount++;
            const rev = Number(j.total_revenue_minor || 0);
            totalAttributedRevenueMinor += rev;

            const campKey = attr.campaignName || 'Campanha Desconhecida';
            if (!campaignBreakdown[campKey]) {
              campaignBreakdown[campKey] = { leads: 0, revenueMinor: 0 };
            }
            campaignBreakdown[campKey].leads += 1;
            campaignBreakdown[campKey].revenueMinor += rev;
          }
        }
      }

      return {
        success: true,
        workspaceId,
        scannedJourneysCount: journeys.length,
        reconciledCount,
        totalAttributedRevenueMinor,
        totalAttributedRevenueBrl: (totalAttributedRevenueMinor / 100).toFixed(2),
        campaignBreakdown,
        message: `Reconciliação retroativa concluída com sucesso! ${reconciledCount} leads atribuídos retroativamente a anúncios.`,
      };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });

  // 12.7. Commercial Performance & Response SLA Report (Human vs AI & Ad Traffic Defense)
  app.get('/api/v1/workspaces/:workspaceId/reports/performance-sla', async (request: FastifyRequest<{
    Params: { workspaceId: string };
    Querystring: { period?: 'today' | '7d' | '30d' };
  }>, reply: FastifyReply) => {
    const { workspaceId } = request.params;
    const { period = '30d' } = request.query || {};

    const client = await dbPool.connect();
    try {
      const days = period === 'today' ? 1 : period === '7d' ? 7 : 30;
      const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const statsQuery = `
        SELECT 
          COUNT(DISTINCT j.id) as total_journeys,
          COUNT(DISTINCT CASE WHEN ac.id IS NOT NULL THEN j.id END) as total_ad_leads,
          COUNT(DISTINCT CASE WHEN j.status = 'CLOSED_WON' THEN j.id END) as total_won,
          COALESCE(SUM(j.total_revenue_minor), 0) as total_revenue_minor
        FROM public.commercial_journeys j
        LEFT JOIN public.acquisition_contexts ac ON ac.journey_id = j.id
        WHERE j.workspace_id = $1 AND j.created_at >= $2
      `;
      const statsRes = await client.query(statsQuery, [workspaceId, sinceDate]);
      const stats = statsRes.rows[0] || {};

      const timingsQuery = `
        WITH first_inbound AS (
          SELECT DISTINCT ON (journey_id) journey_id, sent_at AS first_inbound_at
          FROM public.conversation_messages
          WHERE workspace_id = $1 AND direction = 'inbound' AND sent_at >= $2
          ORDER BY journey_id, sent_at ASC
        ),
        first_outbound AS (
          SELECT DISTINCT ON (m.journey_id, m.sender_type)
            m.journey_id,
            m.sender_type,
            m.sent_at AS first_outbound_at,
            fi.first_inbound_at
          FROM public.conversation_messages m
          INNER JOIN first_inbound fi ON fi.journey_id = m.journey_id
          WHERE m.workspace_id = $1
            AND m.direction = 'outbound'
            AND m.sent_at >= fi.first_inbound_at
          ORDER BY m.journey_id, m.sender_type, m.sent_at ASC
        )
        SELECT
          sender_type,
          AVG(EXTRACT(EPOCH FROM (first_outbound_at - first_inbound_at))) AS avg_response_seconds,
          COUNT(*) AS sample_count,
          COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (first_outbound_at - first_inbound_at)) <= 300) AS responded_under_5m,
          COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (first_outbound_at - first_inbound_at)) > 900) AS delayed_over_15m
        FROM first_outbound
        GROUP BY sender_type
      `;
      const timingsRes = await client.query(timingsQuery, [workspaceId, sinceDate]);

      const trafficTimingQuery = `
        WITH attributed AS (
          SELECT DISTINCT j.id, j.total_revenue_minor
          FROM public.commercial_journeys j
          INNER JOIN public.acquisition_contexts ac ON ac.journey_id = j.id
          WHERE j.workspace_id = $1 AND j.created_at >= $2
        ),
        first_inbound AS (
          SELECT DISTINCT ON (m.journey_id) m.journey_id, m.sent_at AS first_inbound_at
          FROM public.conversation_messages m
          INNER JOIN attributed a ON a.id = m.journey_id
          WHERE m.direction = 'inbound'
          ORDER BY m.journey_id, m.sent_at ASC
        ),
        first_outbound AS (
          SELECT DISTINCT ON (m.journey_id) m.journey_id, m.sent_at AS first_outbound_at
          FROM public.conversation_messages m
          INNER JOIN first_inbound fi ON fi.journey_id = m.journey_id
          WHERE m.direction = 'outbound' AND m.sent_at >= fi.first_inbound_at
          ORDER BY m.journey_id, m.sent_at ASC
        )
        SELECT
          COUNT(*) AS total_ad_leads,
          COUNT(*) FILTER (WHERE fo.first_outbound_at IS NOT NULL
            AND EXTRACT(EPOCH FROM (fo.first_outbound_at - fi.first_inbound_at)) <= 300) AS responded_under_5m,
          COUNT(*) FILTER (WHERE fo.first_outbound_at IS NOT NULL
            AND EXTRACT(EPOCH FROM (fo.first_outbound_at - fi.first_inbound_at)) > 900) AS delayed_over_15m,
          COALESCE(SUM(a.total_revenue_minor) FILTER (WHERE fo.first_outbound_at IS NOT NULL
            AND EXTRACT(EPOCH FROM (fo.first_outbound_at - fi.first_inbound_at)) > 900), 0) AS delayed_revenue_minor
        FROM attributed a
        LEFT JOIN first_inbound fi ON fi.journey_id = a.id
        LEFT JOIN first_outbound fo ON fo.journey_id = a.id
      `;
      const trafficTimingRes = await client.query(trafficTimingQuery, [workspaceId, sinceDate]);
      const trafficTiming = trafficTimingRes.rows[0] || {};

      let aiAvgSec: number | null = null;
      let humanAvgSec: number | null = null;
      let aiSampleCount = 0;
      let humanSampleCount = 0;
      let aiHandledCount = 0;
      let humanHandledCount = 0;
      let responseSamples = 0;
      let responsesUnder5m = 0;

      for (const row of timingsRes.rows) {
        const sec = Number(row.avg_response_seconds || 0);
        const samples = Number(row.sample_count || 0);
        const under5m = Number(row.responded_under_5m || 0);
        responseSamples += samples;
        responsesUnder5m += under5m;
        if (row.sender_type === 'bot' || row.sender_type === 'agent' || row.sender_type === 'copilot') {
          aiAvgSec = Math.round(sec);
          aiSampleCount = samples;
          aiHandledCount += samples;
        } else {
          humanAvgSec = Math.round(sec);
          humanSampleCount = samples;
          humanHandledCount += samples;
        }
      }

      const totalAdLeads = Number(trafficTiming.total_ad_leads || stats.total_ad_leads || 0);
      const respondedUnder5m = Number(trafficTiming.responded_under_5m || 0);
      const adLeadsDelayed = Number(trafficTiming.delayed_over_15m || 0);
      const delayedRevenueMinor = Number(trafficTiming.delayed_revenue_minor || 0);
      const totalJourneys = Number(stats.total_journeys || 0);
      const handledTotal = aiHandledCount + humanHandledCount;
      const aiPercent = handledTotal > 0 ? Math.round((aiHandledCount / handledTotal) * 1000) / 10 : 0;
      const humanPercent = handledTotal > 0 ? Math.round((humanHandledCount / handledTotal) * 1000) / 10 : 0;
      const goldenWindowRate = responseSamples > 0
        ? Math.round((responsesUnder5m / responseSamples) * 1000) / 10
        : null;
      const speedAdvantage = aiAvgSec !== null && humanAvgSec !== null && aiAvgSec > 0
        ? `${Math.round(humanAvgSec / aiAvgSec)}x mais rápida`
        : 'Sem dados';

      return {
        success: true,
        workspaceId,
        period,
        metrics: {
          aiResponseTimeSeconds: aiAvgSec,
          aiResponseTimeFormatted: aiAvgSec === null ? 'Sem dados' : `${aiAvgSec}s`,
          humanResponseTimeSeconds: humanAvgSec,
          humanResponseTimeFormatted: humanAvgSec === null ? 'Sem registros' : humanAvgSec > 3600
            ? `${(humanAvgSec / 3600).toFixed(1)}h` 
            : `${Math.round(humanAvgSec / 60)} min`,
          speedAdvantage,
          goldenWindowPercent: goldenWindowRate,
          volumeDistribution: {
            aiPercent,
            humanPercent,
            aiHandledCount,
            humanHandledCount,
          },
          trafficAudit: {
            totalAdLeads,
            respondedUnder5m,
            delayedOver15m: adLeadsDelayed,
            adRevenueAtRiskBrl: (delayedRevenueMinor / 100).toFixed(2),
            trafficVsAttendanceVerdict: adLeadsDelayed > 0
              ? `Atenção: ${adLeadsDelayed} leads atribuídos a anúncios tiveram primeira resposta após 15 minutos. Receita já atribuída nesse grupo: R$ ${(delayedRevenueMinor / 100).toFixed(2)}; isso é um sinal operacional, não uma estimativa de perda.`
              : totalAdLeads > 0
                ? 'Nenhum lead atribuído a anúncio ultrapassou 15 minutos até a primeira resposta no período consultado.'
                : 'Sem dados de tráfego atribuídos no período consultado.',
            revenueBasis: 'attributed_revenue_only',
          },
          hourlySpeedHeatmap: [],
          sampleStatus: totalJourneys > 0 || responseSamples > 0 ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
          sampleCounts: {
            journeys: totalJourneys,
            responseSamples,
            ai: aiSampleCount,
            human: humanSampleCount,
          },
        },
      };
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    } finally {
      client.release();
    }
  });

  // 13. WAHA Media Proxy (Streams media files from internal WAHA container)
  // This route is intentionally public (no JWT) so img/audio/video src tags can load media directly.
  app.get('/api/v1/channels/waha/media-proxy', async (request: FastifyRequest<{ Querystring: { path?: string; messageId?: string; session?: string } }>, reply: FastifyReply) => {
    const { path, messageId, session: requestedSession } = request.query || {};
    const explicitSession = typeof requestedSession === 'string' ? requestedSession.trim() : '';
    let targetUrl = '';
    let parsedMessageId: string | null = null;
    let parsedSession = explicitSession;

    if (path) {
      targetUrl = `${WAHA_BASE_URL}${path.startsWith('/') ? path : '/' + path}`;

      // Extract messageId from path for fallback: /api/files/{session}/{msgId}.ext
      const fileMatch = path.match(/\/api\/files\/([^/]+)\/([^/]+?)(\.[a-z0-9]+)?$/i);
      if (fileMatch) {
        parsedSession = fileMatch[1] || explicitSession;
        parsedMessageId = fileMatch[2];
      }
    } else if (messageId) {
      if (!explicitSession) {
        return reply.status(400).send({ error: 'A sessão WAHA é obrigatória quando media é buscada por messageId', code: 'WAHA_SESSION_REQUIRED' });
      }
      parsedMessageId = messageId;
      targetUrl = `${WAHA_BASE_URL}/api/${encodeURIComponent(explicitSession)}/chats/messages/${encodeURIComponent(messageId)}/media`;
    }

    if (!targetUrl) {
      return reply.status(400).send({ error: 'Path ou messageId é obrigatório' });
    }
    if (!parsedSession) {
      return reply.status(400).send({ error: 'A sessão WAHA é obrigatória para buscar mídia', code: 'WAHA_SESSION_REQUIRED' });
    }

    const wahaKey = getWahaApiKey();

    const tryFetchFromWaha = async (url: string) => {
      return fetch(url, { headers: { 'x-api-key': wahaKey } });
    };

    const triggerDownloadAndRetry = async (): Promise<Response | null> => {
      if (!parsedMessageId) return null;

      // Try to trigger download via the chat messages API with downloadMedia=true
      // We search in all chats to find which chat owns this message
      try {
        // Optimistic: try fetching a specific message download endpoint first
        const dlUrl1 = `${WAHA_BASE_URL}/api/${encodeURIComponent(parsedSession)}/messages/${encodeURIComponent(parsedMessageId)}/download`;
        const dl1 = await tryFetchFromWaha(dlUrl1);
        if (dl1.ok) {
          // retry original
          const retry = await tryFetchFromWaha(targetUrl);
          if (retry.ok) return retry;
        }
      } catch {}

      // Fallback: use chats API downloadMedia=true — requires knowing chatId
      // WAHA messageId format: {fromMe}_{phone}@{server}_{msgHash}
      // e.g.: false_271635491872968@lid_3AA4D954F1DF84382DBC
      // chatId = "271635491872968@lid"
      const chatIdMatch = parsedMessageId.match(/^(?:false|true)_(\d+@[a-z.]+)_[A-F0-9]+$/i);
      if (chatIdMatch) {
        const chatId = chatIdMatch[1]; // e.g. "271635491872968@lid"
        try {
          const chatMsgsUrl = `${WAHA_BASE_URL}/api/${encodeURIComponent(parsedSession)}/chats/${encodeURIComponent(chatId)}/messages?limit=50&downloadMedia=true`;
          await tryFetchFromWaha(chatMsgsUrl);
          // Now retry the original file URL
          await new Promise(r => setTimeout(r, 600));
          const retry = await tryFetchFromWaha(targetUrl);
          if (retry.ok) return retry;
        } catch {}
      }

      return null;
    };

    try {
      let res = await tryFetchFromWaha(targetUrl);

      if (!res.ok && res.status === 404 && parsedMessageId) {
        // File not in /tmp yet — trigger download via WAHA and retry
        const retried = await triggerDownloadAndRetry();
        if (retried) {
          res = retried;
        }
      }

      if (!res.ok) {
        return reply.status(res.status).send({ error: 'Media fetch failed', statusCode: res.status });
      }

      const contentType = res.headers.get('content-type') || 'application/octet-stream';
      reply.header('Content-Type', contentType);
      reply.header('Cache-Control', 'public, max-age=3600');
      reply.header('Access-Control-Allow-Origin', '*');

      const buffer = await res.arrayBuffer();
      return reply.send(Buffer.from(buffer));
    } catch (err: any) {
      return reply.status(502).send({ error: err.message, statusCode: 502 });
    }
  });
}
