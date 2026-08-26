import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'node:crypto';
import { FlowCrypto } from '../../../infrastructure/channels/meta/flow-crypto.js';
import { getWorkspaceIdFromSession, isEventReplayed, verifyWahaApiKeyTimingSafe, normalizeWorkspaceUuid } from './whatsapp-channel-routes.js';
import { dbPool } from '../../../infrastructure/database/pool.js';
import { AttributionService } from '../../../application/services/attribution-service.js';

export interface FlowRequestBody {
  encrypted_flow_data?: string;
  encrypted_aes_key?: string;
  initial_vector?: string;
}

export async function publicSupplierRoutes(app: FastifyInstance): Promise<void> {
  // ─── 1. Live WAHA Webhook Receiver (Fail-Closed Auth, Replay Protected, Real Persistence) ─────
  app.post('/api/v1/channels/waha/webhook', async (request: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    // 0. Fail-Closed Authentication Verification (Strict Header only: x-api-key or Authorization)
    const incomingApiKey = (request.headers['x-api-key'] || (request.headers['authorization'] as string)?.replace('Bearer ', '')) as string | undefined;
    if (!verifyWahaApiKeyTimingSafe(incomingApiKey)) {
      request.log.warn({ ip: request.ip, hasKey: Boolean(incomingApiKey) }, '[WAHA Webhook] Unauthorized caller rejected with 401');
      return reply.code(401).send({ error: 'Unauthorized webhook caller', statusCode: 401 });
    }

    const body = request.body as any;
    const session = body?.session || 'default';
    const event = body?.event;
    const payload = body?.payload;

    if (!payload || (event !== 'message' && event !== 'message.any')) {
      return reply.code(200).send({ received: true });
    }

    // Anti-replay & Idempotency check
    const eventId = String(payload.id || payload._serialized || `${session}_${payload.timestamp}_${payload.from}`);
    if (isEventReplayed(eventId)) {
      request.log.info({ eventId, session }, '[WAHA Webhook] Duplicate/replayed event dropped');
      return reply.code(200).send({ received: true, deduplicated: true });
    }

    const workspaceId = getWorkspaceIdFromSession(session);
    if (!workspaceId) {
      request.log.warn({ session }, '[WAHA Webhook] Ignored message for unrecognized/unregistered session');
      return reply.code(200).send({ ignored: true, reason: 'unrecognized_or_unregistered_session' });
    }

    const rawFrom = String(payload.from || '');
    const rawTo = String(payload.to || '');
    const fromMe = Boolean(payload.fromMe);

    // 1. Ignore Status Stories and System Broadcasts
    if (
      rawFrom.includes('@broadcast') ||
      rawTo.includes('@broadcast') ||
      rawFrom === 'status' ||
      rawTo === 'status' ||
      payload.type === 'e2e_notification' ||
      payload.type === 'notification_template'
    ) {
      return reply.code(200).send({ ignored: true, reason: 'status_or_system_broadcast' });
    }

    // 2. Ignore WhatsApp Groups from 1:1 Commercial Journeys (handled separately in Group Hub)
    const isGroup = rawFrom.endsWith('@g.us') || rawTo.endsWith('@g.us');
    if (isGroup) {
      return reply.code(200).send({ received: true, type: 'group_message_ignored_from_1to1' });
    }

    const rawTarget = fromMe ? rawTo : rawFrom;
    const rawId = rawTarget.split('@')[0];
    const whatsappId = rawTarget;
    const notifyName = (payload._data?.notifyName || payload.notifyName || '').trim();
    const chatName = (payload._data?.chat?.name || '').trim();
    const phoneFromChatName = chatName.replace(/\D/g, '');

    let contactPhone = rawId;
    if (rawTarget.includes('@lid') && phoneFromChatName.length >= 10 && phoneFromChatName.length <= 15) {
      contactPhone = phoneFromChatName;
    }

    let contactName = notifyName || chatName;
    if (!contactName || contactName === rawId || contactName.replace(/\D/g, '') === contactPhone) {
      contactName = `Contato +${contactPhone}`;
    }

    let textContent = typeof payload.body === 'string' ? payload.body : (payload.caption || '');
    let mediaPayload: any = null;

    if (payload.hasMedia || payload.media || payload.type !== 'chat') {
      const mediaType = payload.type || 'mídia';
      if (!textContent) {
        if (mediaType === 'image') textContent = payload.caption ? `📷 ${payload.caption}` : '📷 [Imagem]';
        else if (mediaType === 'audio' || mediaType === 'ptt' || mediaType === 'voice') textContent = '🎤 [Mensagem de Áudio]';
        else if (mediaType === 'video') textContent = payload.caption ? `🎥 ${payload.caption}` : '🎥 [Vídeo]';
        else if (mediaType === 'document') textContent = payload.filename ? `📄 ${payload.filename}` : '📄 [Documento]';
        else if (mediaType === 'sticker') textContent = '🏷️ [Figurinha]';
        else textContent = `📎 [${mediaType.toUpperCase()}]`;
      }

      const rawMediaUrl = payload.media?.url || payload.mediaUrl || payload.url || (payload._data && typeof payload._data === 'object' ? payload._data.mediaUrl || payload._data.url : '') || '';
      const mimetype = payload.media?.mimetype || payload.mimetype || (payload._data && typeof payload._data === 'object' ? payload._data.mimetype : '') || (mediaType === 'image' ? 'image/jpeg' : undefined);
      const fileName = payload.media?.filename || payload.filename || (payload._data && typeof payload._data === 'object' ? payload._data.filename : '') || (mediaType === 'image' ? 'imagem_whatsapp.jpg' : undefined);

      let publicUrl = rawMediaUrl;
      if (rawMediaUrl && (rawMediaUrl.includes('/api/files/') || rawMediaUrl.includes(':3000/'))) {
        const filePart = rawMediaUrl.substring(rawMediaUrl.indexOf('/api/files/'));
        publicUrl = `/api/v1/channels/waha/media-proxy?path=${encodeURIComponent(filePart)}`;
      } else if (!rawMediaUrl && payload.id) {
        publicUrl = `/api/v1/channels/waha/media-proxy?messageId=${encodeURIComponent(payload.id)}&session=${encodeURIComponent(session)}`;
      }

      mediaPayload = {
        mediaType: mediaType === 'image' ? 'image' : mediaType === 'video' ? 'video' : (mediaType === 'audio' || mediaType === 'ptt' || mediaType === 'voice') ? 'audio' : mediaType === 'document' ? 'document' : 'other',
        url: publicUrl,
        mimetype,
        fileName,
        caption: payload.caption || undefined,
      };
    }

    const sentAt = payload.timestamp ? new Date(payload.timestamp * 1000) : new Date();

    if (!contactPhone) {
      return reply.code(200).send({ ignored: true });
    }

    const client = await dbPool.connect();
    try {
      const contactRes = await client.query(`
        INSERT INTO public.contacts (id, workspace_id, phone, whatsapp_id, name, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())
        ON CONFLICT (workspace_id, phone) DO UPDATE SET name = COALESCE(NULLIF(EXCLUDED.name, ''), public.contacts.name), updated_at = NOW()
        RETURNING id
      `, [workspaceId, contactPhone, whatsappId, contactName]);

      const contactId = contactRes.rows[0].id;

      let channelConnectionId: string;
      const chRes = await client.query('SELECT id FROM public.channel_connections WHERE workspace_id = $1 LIMIT 1', [workspaceId]);
      if (chRes.rowCount && chRes.rowCount > 0) {
        channelConnectionId = chRes.rows[0].id;
        await client.query(`UPDATE public.channel_connections SET status = 'CONNECTED', updated_at = NOW() WHERE id = $1`, [channelConnectionId]);
      } else {
        const newCh = await client.query(`
          INSERT INTO public.channel_connections (id, workspace_id, provider, phone_number, name, public_config, status, created_at, updated_at)
          VALUES (gen_random_uuid(), $1, 'waha', '', 'WhatsApp Web', '{"engine":"WAHA"}', 'CONNECTED', NOW(), NOW())
          RETURNING id
        `, [workspaceId]);
        channelConnectionId = newCh.rows[0].id;
      }

      let journeyId: string;
      const existingJourney = await client.query(`
        SELECT id FROM public.commercial_journeys WHERE workspace_id = $1 AND contact_id = $2 LIMIT 1
      `, [workspaceId, contactId]);

      if (existingJourney.rowCount && existingJourney.rowCount > 0) {
        journeyId = existingJourney.rows[0].id;
        await client.query(`UPDATE public.commercial_journeys SET updated_at = NOW() WHERE id = $1`, [journeyId]);
      } else {
        const insertJourney = await client.query(`
          INSERT INTO public.commercial_journeys (id, workspace_id, contact_id, channel_connection_id, status, pipeline_stage, total_revenue_minor, currency, started_at, created_at, updated_at)
          VALUES (gen_random_uuid(), $1, $2, $3, 'OPEN', 'NEW', 0, 'BRL', NOW(), NOW(), NOW())
          ON CONFLICT (workspace_id, contact_id) WHERE status = 'OPEN' DO UPDATE SET updated_at = NOW()
          RETURNING id
        `, [workspaceId, contactId, channelConnectionId]);
        journeyId = insertJourney.rows[0].id;
      }

      const direction = fromMe ? 'outbound' : 'inbound';
      const senderType = fromMe ? 'operator' : 'customer';
      const providerMsgId = payload.id || crypto.randomUUID();

      await client.query(`
        INSERT INTO public.conversation_messages (
          id, workspace_id, channel_connection_id, journey_id, contact_id,
          direction, sender_type, provider_message_id, text_content, media_payload, sent_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        )
        ON CONFLICT (channel_connection_id, provider_message_id) DO NOTHING
      `, [
        workspaceId,
        channelConnectionId,
        journeyId,
        contactId,
        direction,
        senderType,
        providerMsgId,
        textContent,
        mediaPayload ? JSON.stringify(mediaPayload) : null,
        sentAt,
      ]);

      if (fromMe) {
        try {
          await client.query(
            `INSERT INTO public.known_facts (id, workspace_id, journey_id, key, value, confidence, confirmed_by_customer, source, observed_at)
             VALUES (gen_random_uuid(), $1, $2, 'operator.human_override', $3, 1.0, true, 'physical_device', NOW())
             ON CONFLICT (workspace_id, journey_id, key) 
             DO UPDATE SET value = EXCLUDED.value, observed_at = NOW()`,
            [
              workspaceId,
              journeyId,
              JSON.stringify({
                activeUntil: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
                lastHumanMessage: textContent,
              }),
            ]
          );
        } catch {}
      }

      if (!fromMe) {
        try {
          const chCfgRes = await client.query('SELECT public_config FROM public.channel_connections WHERE id = $1', [channelConnectionId]);
          const pubCfg = chCfgRes.rows[0]?.public_config || {};
          const campaigns = pubCfg?.trackingConfig?.campaigns || [];

          const existingAcq = await client.query('SELECT id FROM public.acquisition_contexts WHERE workspace_id = $1 AND journey_id = $2 LIMIT 1', [workspaceId, journeyId]);
          if (existingAcq.rowCount === 0) {
            const attr = AttributionService.extractAttribution(textContent, payload, campaigns);
            if (attr) {
              await AttributionService.persistAttribution(client, workspaceId, journeyId, attr, sentAt);
            }
          }
        } catch (acqErr) {
          request.log.warn({ acqErr }, 'Failed to persist inbound message attribution');
        }
      }

      return reply.code(200).send({ success: true, journeyId, contactId, received: true, workspaceId });
    } catch (err: any) {
      request.log.error({ err }, 'Error processing live WAHA webhook');
      return reply.code(500).send({ error: 'Internal processing error in WAHA webhook' });
    } finally {
      client.release();
    }
  });

  // ─── 2. WhatsApp Flows: Public Key & Dynamic Data Exchange (Meta Asymmetric Cryptography) ───────────────────
  let cachedFlowKeyPair: { publicKeyPem: string; privateKeyPem: string } | null = null;
  function getFlowKeyPair() {
    if (!cachedFlowKeyPair) {
      if (process.env.WABA_FLOW_PRIVATE_KEY && process.env.WABA_FLOW_PUBLIC_KEY) {
        cachedFlowKeyPair = {
          publicKeyPem: process.env.WABA_FLOW_PUBLIC_KEY.replace(/\\n/g, '\n'),
          privateKeyPem: process.env.WABA_FLOW_PRIVATE_KEY.replace(/\\n/g, '\n'),
        };
      } else if (process.env.NODE_ENV === 'production') {
        throw new Error('Missing WABA_FLOW_PRIVATE_KEY and WABA_FLOW_PUBLIC_KEY environment variables in production');
      } else {
        cachedFlowKeyPair = FlowCrypto.generateKeyPair();
      }
    }
    return cachedFlowKeyPair;
  }

  app.get('/api/v1/channels/waba/flows/public-key', async (_request: FastifyRequest, reply: FastifyReply) => {
    const keys = getFlowKeyPair();
    return reply.type('text/plain').send(keys.publicKeyPem);
  });

  app.get('/api/v1/workspaces/:workspaceId/channels/waba/flows/public-key', async (_request: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) => {
    const keys = getFlowKeyPair();
    return reply.type('text/plain').send(keys.publicKeyPem);
  });

  const handleFlowRequest = async (request: FastifyRequest<{ Params?: { workspaceId?: string }; Body: FlowRequestBody }>, reply: FastifyReply) => {
    const { encrypted_flow_data, encrypted_aes_key, initial_vector } = request.body || {};
    if (!encrypted_flow_data || !encrypted_aes_key || !initial_vector) {
      return reply.status(400).send({ error: 'Payload de WhatsApp Flow inválido. Campos obrigatórios ausentes.' });
    }

    try {
      const keys = getFlowKeyPair();
      const decrypted = FlowCrypto.decryptRequest(
        encrypted_flow_data,
        encrypted_aes_key,
        initial_vector,
        keys.privateKeyPem
      );

      const decryptedBody = decrypted.decryptedBody as any;
      const action = decryptedBody?.action;
      const screen = decryptedBody?.screen;
      const data = decryptedBody?.data;
      const flowToken = decryptedBody?.flow_token;

      let flowResponse: any = {};

      if (action === 'ping') {
        flowResponse = { data: { status: 'active' } };
      } else if (action === 'INIT') {
        flowResponse = {
          screen: 'APPOINTMENT',
          data: {
            is_location_enabled: true,
            is_date_enabled: true,
            is_time_enabled: true,
          },
        };
      } else {
        flowResponse = {
          screen: 'SUCCESS',
          data: {
            extension_message_response: {
              params: {
                flow_token: flowToken || 'flow_token_ack',
                status: 'COMPLETED',
              },
            },
          },
        };
      }

      if (decrypted.aesKeyBuffer && decrypted.initialVectorBuffer) {
        const encrypted = FlowCrypto.encryptResponse(flowResponse, decrypted.aesKeyBuffer, decrypted.initialVectorBuffer);
        return reply.type('text/plain').send(encrypted);
      }
      return flowResponse;
    } catch (err: any) {
      request.log.error({ err }, 'Error handling WhatsApp Flow Data Exchange');
      return reply.status(500).send({ error: 'Erro no processamento do WhatsApp Flow' });
    }
  };

  app.post('/api/v1/channels/waba/flows/data-exchange', handleFlowRequest);
  app.post('/api/v1/workspaces/:workspaceId/channels/waba/flows/data-exchange', handleFlowRequest);
}
