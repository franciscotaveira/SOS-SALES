import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { FlowCrypto } from '../../../infrastructure/channels/meta/flow-crypto.js';
import { getSessionName, getWorkspaceIdFromSession, isEventReplayed, verifyWahaApiKeyTimingSafe } from './whatsapp-channel-routes.js';
import { dbPool } from '../../../infrastructure/database/pool.js';
import { AttributionService } from '../../../application/services/attribution-service.js';
import { InboundIngestionGateway } from '../../../application/ports/inbound-ingestion-gateway.js';

export interface FlowRequestBody {
  encrypted_flow_data?: string;
  encrypted_aes_key?: string;
  initial_vector?: string;
}

export interface PublicSupplierRouteOptions {
  /** Deployment-owned pool. The local module pool is only a test/development fallback. */
  databasePool?: Pick<Pool, 'query' | 'connect'>;
  /** Durable raw-envelope ingestion used by the production WAHA path. */
  ingestionGateway?: InboundIngestionGateway;
}

function extractWahaMessageId(payload: Record<string, unknown>): string {
  const rawId = payload.id;
  if (typeof rawId === 'string' && rawId.trim()) return rawId.trim();
  if (rawId && typeof rawId === 'object') {
    const idRecord = rawId as Record<string, unknown>;
    const serialized = typeof idRecord._serialized === 'string'
      ? idRecord._serialized
      : typeof idRecord.id === 'string' ? idRecord.id : '';
    if (serialized.trim()) return serialized.trim();
  }
  const key = payload.key && typeof payload.key === 'object' ? payload.key as Record<string, unknown> : undefined;
  if (typeof key?.id === 'string' && key.id.trim()) return key.id.trim();
  if (key?.id && typeof key.id === 'object') {
    const keyId = key.id as Record<string, unknown>;
    const serialized = typeof keyId._serialized === 'string'
      ? keyId._serialized
      : typeof keyId.id === 'string' ? keyId.id : '';
    if (serialized.trim()) return serialized.trim();
  }
  if (typeof payload._serialized === 'string' && payload._serialized.trim()) return payload._serialized.trim();
  return '';
}

export async function publicSupplierRoutes(
  app: FastifyInstance,
  options: PublicSupplierRouteOptions = {},
): Promise<void> {
  const routePool = options.databasePool ?? dbPool;

  // ─── 1. Live WAHA Webhook Receiver (Fail-Closed Auth, Replay Protected, Real Persistence) ─────
  app.post('/api/v1/channels/waha/webhook', async (request: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    // 0. Fail-Closed Authentication Verification (Strict Header only: x-api-key or Authorization)
    const incomingApiKey = (request.headers['x-api-key'] || (request.headers['authorization'] as string)?.replace('Bearer ', '')) as string | undefined;
    if (!verifyWahaApiKeyTimingSafe(incomingApiKey)) {
      request.log.warn({ ip: request.ip, hasKey: Boolean(incomingApiKey) }, '[WAHA Webhook] Unauthorized caller rejected with 401');
      return reply.code(401).send({ error: 'Unauthorized webhook caller', statusCode: 401 });
    }

    const body = request.body as any;
    const session = typeof body?.session === 'string' ? body.session.trim() : '';
    if (!session) {
      return reply.code(400).send({ error: 'WAHA webhook requires an explicit session name', code: 'WAHA_SESSION_REQUIRED' });
    }
    const event = body?.event;
    const payload = body?.payload;

    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || (event !== 'message' && event !== 'message.any')) {
      return reply.code(200).send({ received: true });
    }

    const payloadRecord = payload as Record<string, unknown>;
    const nestedMeta = payloadRecord._data && typeof payloadRecord._data === 'object'
      ? payloadRecord._data as Record<string, unknown>
      : undefined;
    const nestedKey = payloadRecord.key && typeof payloadRecord.key === 'object'
      ? payloadRecord.key as Record<string, unknown>
      : undefined;
    const providerMessageId = extractWahaMessageId(payloadRecord);
    if (!providerMessageId) {
      return reply.code(400).send({
        error: 'WAHA message payload requires a provider message ID',
        code: 'WAHA_MESSAGE_ID_REQUIRED',
      });
    }

    const rawFrom = typeof payloadRecord.from === 'string'
      ? payloadRecord.from
      : typeof nestedMeta?.from === 'string'
        ? nestedMeta.from
        : typeof nestedKey?.remoteJid === 'string'
          ? nestedKey.remoteJid
          : '';
    const rawTo = typeof payloadRecord.to === 'string'
      ? payloadRecord.to
      : typeof nestedMeta?.to === 'string'
        ? nestedMeta.to
        : '';
    const fromMe = Boolean(payloadRecord.fromMe || nestedMeta?.fromMe || nestedKey?.fromMe);

    // 1. Ignore Status Stories and System Broadcasts
    if (
      rawFrom.includes('@broadcast') ||
      rawTo.includes('@broadcast') ||
      rawFrom.endsWith('@newsletter') ||
      rawTo.endsWith('@newsletter') ||
      rawFrom === 'status' ||
      rawTo === 'status' ||
      payloadRecord.type === 'e2e_notification' ||
      payloadRecord.type === 'notification_template'
    ) {
      return reply.code(200).send({ ignored: true, reason: 'status_or_system_broadcast' });
    }

    // 2. Ignore WhatsApp Groups from 1:1 Commercial Journeys (handled separately in Group Hub)
    const isGroup = rawFrom.endsWith('@g.us') || rawTo.endsWith('@g.us');
    if (isGroup) {
      return reply.code(200).send({ received: true, type: 'group_message_ignored_from_1to1' });
    }

    // Production inbound traffic must enter the same durable ingestion path as
    // the strict /webhooks/waha/:channelConnectionId contract. The old route
    // used to write contacts/messages directly and bypass the worker, which
    // made retries, audit envelopes and downstream processing inconsistent.
    // Outbound fromMe events remain on the direct mirror path below so the
    // operator's own WAHA messages stay visible in the conversation history.
    if (options.ingestionGateway && !fromMe) {
      const mappedWorkspaceId = getWorkspaceIdFromSession(session);
      const channelResult = await routePool.query<{ id: string; workspace_id: string }>(
        `SELECT id, workspace_id
         FROM public.channel_connections
         WHERE provider = 'waha'
           AND status = 'CONNECTED'
           AND (
             public_config->>'sessionName' = $1
             OR public_config->>'session' = $1
             OR (
               $2::uuid IS NOT NULL
               AND workspace_id = $2::uuid
               AND COALESCE(public_config->>'sessionName', '') = ''
               AND COALESCE(public_config->>'session', '') = ''
             )
           )
         ORDER BY updated_at DESC
         LIMIT 2`,
        [session, mappedWorkspaceId],
      );

      if (channelResult.rows.length !== 1) {
        return reply.code(409).send({
          error: channelResult.rows.length === 0
            ? 'A sessão WAHA ainda não está registrada como canal conectado.'
            : 'Mais de um canal WAHA corresponde a esta sessão; reconcilie a configuração antes de receber mensagens.',
          code: channelResult.rows.length === 0 ? 'WAHA_CHANNEL_NOT_REGISTERED' : 'WAHA_CHANNEL_AMBIGUOUS',
        });
      }

      const ingestion = await options.ingestionGateway.ingestChannelEvent({
        channelConnectionId: channelResult.rows[0].id,
        providerEventId: `message:${providerMessageId}`,
        eventType: event as string,
        rawPayload: { ...body, session },
      });

      return reply.code(200).send({
        received: true,
        accepted: true,
        inboundEventId: ingestion.inboundEventId,
        workspaceId: ingestion.workspaceId,
        deduplicated: ingestion.isDuplicate || undefined,
      });
    }

    // Anti-replay is retained only for the legacy/test direct mirror. The
    // production durable path relies on the database uniqueness fence above;
    // marking an event before a DB write would otherwise lose a valid retry.
    if (!options.ingestionGateway) {
      const eventId = `message:${providerMessageId}`;
      if (isEventReplayed(eventId)) {
        request.log.info({ eventId, session }, '[WAHA Webhook] Duplicate/replayed event dropped');
        return reply.code(200).send({ received: true, deduplicated: true });
      }
    }

    const workspaceId = getWorkspaceIdFromSession(session);
    if (!workspaceId) {
      request.log.warn({ session }, '[WAHA Webhook] Ignored message for unrecognized/unregistered session');
      return reply.code(200).send({ ignored: true, reason: 'unrecognized_or_unregistered_session' });
    }

    const rawTarget = fromMe ? rawTo : rawFrom;
    // A WAHA LID is an opaque linked-device identifier, not a phone number.
    // The durable production worker resolves it through WAHA's explicit LID
    // endpoint; the legacy direct mirror must fail closed instead of guessing
    // from a display name.
    if (rawTarget.endsWith('@lid')) {
      return reply.code(200).send({ ignored: true, reason: 'unresolved_lid_identity' });
    }
    const rawId = rawTarget.split('@')[0];
    const whatsappId = rawTarget;
    const notifyName = (payload._data?.notifyName || payload.notifyName || '').trim();
    const chatName = (payload._data?.chat?.name || '').trim();
    let contactPhone = rawId;

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

    const client = await routePool.connect();
    try {
      const contactRes = await client.query(`
        INSERT INTO public.contacts (id, workspace_id, phone, whatsapp_id, name, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())
        ON CONFLICT (workspace_id, phone) DO UPDATE SET name = COALESCE(NULLIF(EXCLUDED.name, ''), public.contacts.name), updated_at = NOW()
        RETURNING id
      `, [workspaceId, contactPhone, whatsappId, contactName]);

      const contactId = contactRes.rows[0].id;

      let channelConnectionId: string;
      // A WAHA webhook must never attach messages to an arbitrary channel in
      // the workspace. A Meta Cloud connection can coexist as configuration,
      // but it is a distinct provider with a distinct webhook lifecycle.
      const expectedSession = getSessionName(workspaceId);
      const chRes = await client.query(
        `SELECT id, public_config FROM public.channel_connections
         WHERE workspace_id = $1 AND provider = 'waha'
           AND status = 'CONNECTED'
           AND (
             public_config->>'sessionName' = $2
             OR public_config->>'session' = $2
             OR ($3 IS NOT NULL AND $2 = $3 AND COALESCE(public_config->>'sessionName', '') = '')
           )
         ORDER BY updated_at DESC
         LIMIT 2`,
        [workspaceId, session, expectedSession]
      );
      if (chRes.rows.length !== 1) {
        return reply.code(409).send({
          error: chRes.rows.length === 0
            ? 'A sessão WAHA ainda não está registrada como canal conectado neste workspace.'
            : 'Mais de um canal WAHA corresponde a esta sessão; reconcilie a configuração antes de receber mensagens.',
          code: chRes.rows.length === 0 ? 'WAHA_CHANNEL_NOT_REGISTERED' : 'WAHA_CHANNEL_AMBIGUOUS',
        });
      }
      channelConnectionId = chRes.rows[0].id;
      const currentConfig = typeof chRes.rows[0].public_config === 'string'
        ? JSON.parse(chRes.rows[0].public_config)
        : (chRes.rows[0].public_config || {});
      await client.query(
        `UPDATE public.channel_connections
         SET public_config = $1::jsonb, updated_at = NOW()
         WHERE id = $2 AND workspace_id = $3 AND provider = 'waha' AND status = 'CONNECTED'`,
        [JSON.stringify({ ...currentConfig, engine: currentConfig.engine || 'WAHA', sessionName: session }), channelConnectionId, workspaceId],
      );

      let journeyId: string;
      const existingJourney = await client.query(`
        SELECT id, channel_connection_id
        FROM public.commercial_journeys
        WHERE workspace_id = $1
          AND contact_id = $2
          AND status = 'OPEN'
          AND (channel_connection_id = $3 OR channel_connection_id IS NULL)
        ORDER BY (channel_connection_id = $3) DESC, updated_at DESC
        LIMIT 1
      `, [workspaceId, contactId, channelConnectionId]);

      if (existingJourney.rowCount && existingJourney.rowCount > 0) {
        journeyId = existingJourney.rows[0].id;
        await client.query(
          `UPDATE public.commercial_journeys
           SET channel_connection_id = COALESCE(channel_connection_id, $2), updated_at = NOW()
           WHERE id = $1 AND workspace_id = $3`,
          [journeyId, channelConnectionId, workspaceId],
        );
      } else {
        const insertJourney = await client.query(`
          INSERT INTO public.commercial_journeys (id, workspace_id, contact_id, channel_connection_id, status, pipeline_stage, total_revenue_minor, currency, started_at, created_at, updated_at)
          VALUES (gen_random_uuid(), $1, $2, $3, 'OPEN', 'NEW', 0, 'BRL', NOW(), NOW(), NOW())
          ON CONFLICT DO NOTHING
          RETURNING id
        `, [workspaceId, contactId, channelConnectionId]);
        if (insertJourney.rows[0]?.id) {
          journeyId = insertJourney.rows[0].id;
        } else {
          const racedJourney = await client.query(
            `SELECT id FROM public.commercial_journeys
             WHERE workspace_id = $1 AND contact_id = $2 AND channel_connection_id = $3 AND status = 'OPEN'
             LIMIT 1`,
            [workspaceId, contactId, channelConnectionId],
          );
          if (!racedJourney.rows[0]?.id) {
            return reply.code(409).send({ error: 'A jornada comercial está em conflito com outro canal; tente novamente após reconciliar os canais.' });
          }
          journeyId = racedJourney.rows[0].id;
        }
      }

      const direction = fromMe ? 'outbound' : 'inbound';
      const senderType = fromMe ? 'operator' : 'customer';
      const providerMsgId = providerMessageId;

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
          const campaigns = Array.isArray(pubCfg?.campaignMappings)
            ? pubCfg.campaignMappings
            : Array.isArray(pubCfg?.trackingConfig?.campaigns)
              ? pubCfg.trackingConfig.campaigns
              : [];

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
