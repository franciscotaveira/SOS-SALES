import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { dbPool } from '../../../../infrastructure/database/pool.js';
import { AttributionService } from '../../../../application/services/attribution-service.js';
import { getReceptionistAgent } from '../../../../application/agents/receptionist-agent.js';
import { handleMessengerEntry } from './messenger-webhook-handler.js';

/**
 * Tenta encontrar uma conexão de canal pelo phoneNumberId do webhook.
 * Retorna o objeto { id, workspace_id } se encontrado, ou null caso contrário.
 * Falha de banco é propagada para que a Meta possa repetir a entrega.
 */
export async function findChannelByPhoneNumberId(
  phoneNumberId: string | undefined,
  log: FastifyRequest['log'],
  query: typeof dbPool.query = dbPool.query,
): Promise<{ id: string | null; workspace_id: string | null } | null> {
  if (!phoneNumberId) {
    return null;
  }

  try {
    const chanRes = await query(
      `SELECT
         workspace_id,
         (array_agg(id ORDER BY (status = 'CONNECTED') DESC, created_at DESC))[1] AS id
       FROM public.channel_connections
       WHERE provider = 'meta_cloud'
         AND (
            (public_config->>'phoneNumberId') = $1 
         OR (public_config->>'phone_number_id') = $1
         OR (public_config->>'wabaPhoneNumberId') = $1
         OR phone_number = $1
         )
       GROUP BY workspace_id
       LIMIT 2`,
      [phoneNumberId]
    );

    if (chanRes.rows.length === 1) {
      return {
        id: chanRes.rows[0].id,
        workspace_id: chanRes.rows[0].workspace_id
      };
    }

    if (chanRes.rows.length > 1) {
      log.warn({ ownerCount: chanRes.rows.length }, 'Ambiguous WABA channel ownership found. Rejecting to prevent cross-tenant leak.');
      return null;
    }
  } catch (err) {
    log.error({ err }, 'Error looking up channel connection for WABA webhook');
    throw err;
  }

  return null;
}

export interface WabaWebhookPluginOptions {
  verifyToken: string;
  appSecret: string;
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function verifyMetaSignature(rawBody: Buffer, signatureHeader: string | undefined, appSecret: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const providedSignature = signatureHeader.slice('sha256='.length);
  const computedSignature = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return safeCompare(providedSignature, computedSignature);
}

export const wabaWebhookPlugin: FastifyPluginAsync<WabaWebhookPluginOptions> = async (
  app: FastifyInstance,
  options: WabaWebhookPluginOptions
) => {
  const { verifyToken, appSecret } = options;
  const handleVerification = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token && safeCompare(token, verifyToken)) {
      return reply.status(200).send(challenge);
    }
    return reply.status(403).send('Forbidden');
  };

  /** 
   * 1. GET Webhook Verification (Meta Hub Challenge Handshake)
   */
  app.get('/api/v1/channels/waba/webhook', handleVerification);
  app.get('/webhooks/waba', handleVerification);

  /** 
   * 2. POST Webhook Events (Messages, Statuses, Referrals, Interactive Clicks)
   */
  const handleEvents = async (request: FastifyRequest, reply: FastifyReply) => {
    const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody;
    const signatureHeader = request.headers['x-hub-signature-256'] as string | undefined;

    request.log.info({
      hasRawBody: Boolean(rawBody),
      rawBodyLength: rawBody?.length,
      hasSignature: Boolean(signatureHeader),
    }, 'WABA webhook received');

    if (!rawBody || !verifyMetaSignature(rawBody, signatureHeader, appSecret)) {
      request.log.warn({ hasRawBody: Boolean(rawBody), hasSignature: Boolean(signatureHeader) }, 'WABA webhook signature verification failed');
      return reply.status(401).send({ error: 'Invalid signature' });
    }

    const payload = request.body as any;

    // Messenger / Instagram DM share the same Meta webhook endpoint
    if (payload?.object === 'page' || payload?.object === 'instagram') {
      const platform = payload.object === 'page' ? 'messenger' : 'instagram';
      for (const entry of payload.entry || []) {
        try {
          await handleMessengerEntry(entry, platform, request.log);
        } catch (err) {
          request.log.error({ err, platform, entryId: entry?.id }, 'Messenger/Instagram entry processing failed');
          throw err;
        }
      }
      return reply.status(200).send({ status: 'ok', platform });
    }

    if (payload?.object !== 'whatsapp_business_account') {
      return reply.status(200).send({ status: 'ignored' });
    }

    const entries = payload.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        const metadata = value?.metadata;
        const phoneNumberId = metadata?.phone_number_id;
        const statuses = value?.statuses || [];
        const messages = value?.messages || [];
        const contacts = value?.contacts || [];
        const channelInfo = await findChannelByPhoneNumberId(phoneNumberId, request.log);

        if ((statuses.length > 0 || messages.length > 0) && !channelInfo) {
          request.log.warn(
            { phoneNumberId },
            'Unrecognized or ambiguous WABA phone number ownership - event ignored to prevent cross-tenant leakage'
          );
          continue;
        }
        if (!channelInfo) continue;
        const resolvedChannelInfo = channelInfo;

        // 1. Process Status Updates (sent, delivered, read, failed)
        for (const statusObj of statuses) {
          const wabaMessageId = statusObj.id;
          const statusStr = String(statusObj.status || '').toUpperCase();
          const validStatuses = ['SENT', 'DELIVERED', 'READ', 'FAILED', 'REVOKED'];
          if (!wabaMessageId || !validStatuses.includes(statusStr)) {
            request.log.warn({ status: statusStr }, 'Invalid WABA status event ignored');
            continue;
          }
          const status = statusStr;
          const providerTimestamp = statusObj.timestamp
            ? new Date(Number(statusObj.timestamp) * 1000)
            : new Date();
          const providerEventId = `waba_status_${wabaMessageId}_${status}_${statusObj.timestamp || 'unknown'}`;

          try {
            await dbPool.query(
              `INSERT INTO public.conversation_message_events (
                 id, workspace_id, channel_connection_id, message_id,
                 provider_event_id, status, provider_timestamp, raw_payload, created_at
               )
               SELECT gen_random_uuid(), m.workspace_id, m.channel_connection_id, m.id,
                      $1, $2, $3, $4, NOW()
               FROM public.conversation_messages m
               WHERE m.provider_message_id = $5
                 AND m.channel_connection_id = $6
               LIMIT 1
               ON CONFLICT (channel_connection_id, provider_event_id) DO NOTHING`,
              [
                providerEventId,
                status,
                providerTimestamp.toISOString(),
                JSON.stringify(statusObj),
                wabaMessageId,
                resolvedChannelInfo.id,
              ]
            );
          } catch (err) {
            request.log.error({ err, providerEventId }, 'Failed to persist WABA message status');
            throw err;
          }
        }

        // 2. Process Inbound Messages
        for (const message of messages) {
          const messageId = message.id;
          if (!messageId || typeof message.from !== 'string') {
            request.log.warn({ hasMessageId: Boolean(messageId) }, 'Malformed WABA message ignored');
            continue;
          }

          const fromPhone = `+${message.from.replace(/\D/g, '')}`;
          const contactObj = contacts.find((c: any) => c.wa_id === message.from);
          const pushName = contactObj?.profile?.name || fromPhone;
          const timestamp = new Date(Number(message.timestamp) * 1000).toISOString();

          // Extract text and interaction
          let textContent = '';
          let mediaType: string | null = null;
          let mediaUrl: string | null = null;

          if (message.type === 'text') {
            textContent = message.text?.body || '';
          } else if (message.type === 'interactive') {
            if (message.interactive?.type === 'button_reply') {
              textContent = `[Botão] ${message.interactive.button_reply?.title || ''}`;
            } else if (message.interactive?.type === 'list_reply') {
              textContent = `[Menu] ${message.interactive.list_reply?.title || ''}`;
            }
          } else if (message.type === 'image') {
            mediaType = 'image';
            textContent = message.image?.caption ? `📷 [Imagem] ${message.image.caption}` : '📷 [Imagem]';
          } else if (message.type === 'audio') {
            mediaType = 'audio';
            textContent = message.audio?.voice ? '🎤 [Áudio / Mensagem de Voz]' : '🎵 [Arquivo de Áudio]';
          } else if (message.type === 'document') {
            mediaType = 'document';
            textContent = `📄 [Documento] ${message.document?.filename || 'Arquivo'}`;
          } else if (message.type === 'video') {
            mediaType = 'video';
            textContent = message.video?.caption ? `🎥 [Vídeo] ${message.video.caption}` : '🎥 [Vídeo]';
          }

          // CTWA Referral extraction (Click to WhatsApp Ads)
          const referral = message.referral;
          const adId = referral?.ad_id;
          const sourceId = referral?.source_id;
          const headline = referral?.headline;

          const rawWorkspaceId: string | null = resolvedChannelInfo.workspace_id ?? null;
          if (!rawWorkspaceId) {
            request.log.warn({ phoneNumberId }, 'Channel without workspace_id in WABA webhook - ignored');
            continue;
          }
          const targetWorkspaceId: string = rawWorkspaceId;
          const channelConnectionId = resolvedChannelInfo.id;
          let journeyId: string | null = null;
          let contactId: string | null = null;

          if (!channelConnectionId) {
            request.log.warn({ phoneNumberId }, 'WABA owner has no channel connection id - event ignored');
            continue;
          }

          // Ingest contact and journey
          try {
            // Upsert contact
            const contactRes = await dbPool.query(
              `INSERT INTO public.contacts (id, workspace_id, phone, whatsapp_id, name, created_at, updated_at)
               VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $5)
               ON CONFLICT (workspace_id, phone)
               DO UPDATE SET name = COALESCE(EXCLUDED.name, contacts.name), updated_at = $5
               RETURNING id`,
              [targetWorkspaceId, fromPhone, `${fromPhone.replace(/\D/g, '')}@c.us`, pushName, timestamp]
            );
            contactId = contactRes.rows[0].id as string;

            // Find or create commercial journey
            const existingJourney = await dbPool.query(
              `SELECT id FROM public.commercial_journeys 
               WHERE workspace_id = $1 AND contact_id = $2 
               LIMIT 1`,
              [targetWorkspaceId, contactId]
            );

            if (existingJourney.rowCount && existingJourney.rowCount > 0) {
              journeyId = existingJourney.rows[0].id;
              await dbPool.query(
                `UPDATE public.commercial_journeys SET updated_at = $1 WHERE id = $2`,
                [timestamp, journeyId]
              );
            } else {
              const newJourney = await dbPool.query(
                `INSERT INTO public.commercial_journeys (
                   id, workspace_id, contact_id, channel_connection_id, status, pipeline_stage,
                   total_revenue_minor, currency, started_at, created_at, updated_at
                 )
                 VALUES (
                   gen_random_uuid(), $1, $2, $3, 'OPEN', 'NEW', 0, 'BRL', $4, $4, $4
                 )
                 RETURNING id`,
                [targetWorkspaceId, contactId, channelConnectionId, timestamp]
              );
              journeyId = newJourney.rows[0].id;
            }

            // Extract and persist Meta Ads CTWA & UTM attribution
            try {
              const client = await dbPool.connect();
              try {
                const chCfgRes = await client.query('SELECT public_config FROM public.channel_connections WHERE id = $1', [channelConnectionId]);
                const pubCfg = chCfgRes.rows[0]?.public_config || {};
                const campaigns = pubCfg?.trackingConfig?.campaigns || [];

                const existingAcq = await client.query('SELECT id FROM public.acquisition_contexts WHERE workspace_id = $1 AND journey_id = $2 LIMIT 1', [targetWorkspaceId, journeyId]);
                if (existingAcq.rowCount === 0) {
                  const attr = AttributionService.extractAttribution(textContent, { referral, adId, headline, sourceId }, campaigns);
                  if (attr && journeyId) {
                    await AttributionService.persistAttribution(client, targetWorkspaceId, journeyId, attr, new Date(timestamp));
                  }
                }
              } finally {
                client.release();
              }
            } catch (acqErr) {
              console.warn('Erro ao processar atribuição WABA:', acqErr);
            }

            // Save referral facts if present
            if (adId || headline) {
              await dbPool.query(
                `INSERT INTO public.known_facts (id, workspace_id, journey_id, key, value, confidence, confirmed_by_customer, source, observed_at)
                 VALUES (gen_random_uuid(), $1, $2, 'ad.referral', $3, 1.0, true, 'ad_payload', NOW())
                 ON CONFLICT DO NOTHING`,
                [targetWorkspaceId, journeyId, JSON.stringify({ adId, sourceId, headline })]
              );
            }

            // Insert conversation message + durable AI Receptionist enqueue in a
            // single service-role transaction (QA-P0 §4.1). Replaces the
            // non-recoverable setImmediate() fire-and-forget trigger: the message
            // id is captured with RETURNING and, only when the row is freshly
            // inserted and the receptionist is eligible, a durable
            // 'receptionist.inbound_received' outbox row is enqueued in the SAME tx
            // so a leased/fenced worker can drive the agent recoverably.
            const receptionistAgent = getReceptionistAgent();
            const receptionistEligible =
              receptionistAgent.isEnabled() &&
              !!textContent &&
              message.type === 'text' &&
              !!journeyId &&
              !!contactId &&
              !!channelConnectionId;

            const ingestClient = await dbPool.connect();
            try {
              await ingestClient.query('BEGIN');
              await ingestClient.query('SET LOCAL ROLE service_role');
              await ingestClient.query(
                "SELECT set_config('request.jwt.claim.role', 'service_role', true)"
              );

              const insertedMessage = await ingestClient.query<{ id: string }>(
                `INSERT INTO public.conversation_messages (
                   id, workspace_id, channel_connection_id, journey_id, contact_id,
                   direction, sender_type, provider_message_id, text_content, media_payload, sent_at
                 )
                 VALUES (
                   gen_random_uuid(), $1, $2, $3, $4, 'inbound', 'customer', $5, $6, $7, $8
                 )
                 ON CONFLICT (channel_connection_id, provider_message_id) DO NOTHING
                 RETURNING id`,
                [
                  targetWorkspaceId,
                  channelConnectionId,
                  journeyId,
                  contactId,
                  messageId,
                  textContent,
                  JSON.stringify({
                    wabaMessageId: messageId,
                    mediaType,
                    mediaUrl,
                    referral,
                    wabaEngine: 'meta_cloud_api_v20',
                  }),
                  timestamp,
                ]
              );

              const conversationMessageId = insertedMessage.rows[0]?.id;

              // ON CONFLICT DO NOTHING → empty RETURNING on duplicate delivery,
              // so we only enqueue the receptionist trigger for a fresh message.
              if (conversationMessageId && receptionistEligible) {
                await ingestClient.query(
                  `SELECT public.enqueue_receptionist_inbound(
                     $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
                   )`,
                  [
                    conversationMessageId,
                    targetWorkspaceId,
                    journeyId,
                    contactId,
                    channelConnectionId,
                    fromPhone,
                    pushName,
                    textContent,
                    message.type,
                    phoneNumberId,
                  ]
                );
              }

              await ingestClient.query('COMMIT');
            } catch (txErr) {
              await ingestClient.query('ROLLBACK').catch(() => {});
              throw txErr;
            } finally {
              await ingestClient.query('RESET ROLE').catch(() => {});
              await ingestClient
                .query("SELECT set_config('request.jwt.claim.role', '', true)")
                .catch(() => {});
              ingestClient.release();
            }
          } catch (err) {
            request.log.error({ err, messageId }, 'Failed to persist WABA inbound message');
            throw err;
          }
        }
      }
    }

    return reply.status(200).send({ status: 'ok' });
  };

  app.post('/api/v1/channels/waba/webhook', handleEvents);
  app.post('/webhooks/waba', handleEvents);
};
