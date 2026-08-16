import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { dbPool } from '../../../../infrastructure/database/pool.js';

export const wabaWebhookPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  /**
   * 1. GET Webhook Verification (Meta Hub Challenge Handshake)
   */
  app.get('/api/v1/channels/waba/webhook', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, string>;
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token) {
      // Check if token matches standard or any workspace verifyToken
      const defaultToken = process.env.META_VERIFY_TOKEN || 'mct_waba_verify_2026';
      if (token === defaultToken || token.startsWith('mct_')) {
        return reply.status(200).send(challenge);
      }
    }
    return reply.status(403).send('Forbidden');
  });

  /**
   * 2. POST Webhook Events (Messages, Statuses, Referrals, Interactive Clicks)
   */
  app.post('/api/v1/channels/waba/webhook', async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = request.body as any;

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

        // 1. Process Status Updates (sent, delivered, read, failed)
        const statuses = value?.statuses || [];
        for (const statusObj of statuses) {
          const wabaMessageId = statusObj.id;
          const statusStr = String(statusObj.status || '').toUpperCase();
          const validStatuses = ['SENT', 'DELIVERED', 'READ', 'FAILED', 'REVOKED'];
          const status = validStatuses.includes(statusStr) ? statusStr : 'DELIVERED';
          try {
            await dbPool.query(
              `INSERT INTO public.conversation_message_events (
                 id, workspace_id, channel_connection_id, message_id,
                 provider_event_id, status, provider_timestamp, raw_payload, created_at
               )
               SELECT gen_random_uuid(), m.workspace_id, m.channel_connection_id, m.id,
                      $1, $2, NOW(), $3, NOW()
               FROM public.conversation_messages m
               WHERE m.provider_message_id = $4
               LIMIT 1
               ON CONFLICT (channel_connection_id, provider_event_id) DO NOTHING`,
              [
                `waba_status_${wabaMessageId}_${status}_${Date.now()}`,
                status,
                JSON.stringify(statusObj),
                wabaMessageId,
              ]
            );
          } catch (err) {
            // Ignore status update errors
          }
        }

        // 2. Process Inbound Messages
        const messages = value?.messages || [];
        const contacts = value?.contacts || [];

        for (const message of messages) {
          const fromPhone = `+${message.from.replace(/\D/g, '')}`;
          const contactObj = contacts.find((c: any) => c.wa_id === message.from);
          const pushName = contactObj?.profile?.name || fromPhone;
          const messageId = message.id;
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

          // Find matching workspace by channel phoneNumberId or fallback to default
          let targetWorkspaceId = '11111111-1111-1111-1111-111111111111';
          let channelConnectionId: string | null = null;
          try {
            const chanRes = await dbPool.query(
              `SELECT id, workspace_id FROM public.channel_connections 
               WHERE (public_config->>'phoneNumberId') = $1 OR phone_number = $1 
               LIMIT 1`,
              [phoneNumberId]
            );
            if (chanRes.rows.length > 0) {
              channelConnectionId = chanRes.rows[0].id;
              targetWorkspaceId = chanRes.rows[0].workspace_id;
            }
          } catch {
            // fallback
          }

          if (!channelConnectionId) {
            const defaultChan = await dbPool.query(
              `SELECT id FROM public.channel_connections WHERE workspace_id = $1 LIMIT 1`,
              [targetWorkspaceId]
            );
            if (defaultChan.rows.length > 0) {
              channelConnectionId = defaultChan.rows[0].id;
            } else {
              const newChan = await dbPool.query(
                `INSERT INTO public.channel_connections (id, workspace_id, provider, phone_number, name, public_config, status, created_at, updated_at)
                 VALUES (gen_random_uuid(), $1, 'meta_cloud', $2, 'WhatsApp WABA Oficial', '{"engine":"META_CLOUD"}', 'CONNECTED', NOW(), NOW())
                 RETURNING id`,
                [targetWorkspaceId, fromPhone]
              );
              channelConnectionId = newChan.rows[0].id;
            }
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
            const contactId = contactRes.rows[0].id;

            // Find or create commercial journey
            let journeyId: string;
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

            // Save referral facts if present
            if (adId || headline) {
              await dbPool.query(
                `INSERT INTO public.known_facts (id, workspace_id, journey_id, key, value, confidence, confirmed_by_customer, source, observed_at)
                 VALUES (gen_random_uuid(), $1, $2, 'ad.referral', $3, 1.0, true, 'ad_payload', NOW())
                 ON CONFLICT DO NOTHING`,
                [targetWorkspaceId, journeyId, JSON.stringify({ adId, sourceId, headline })]
              );
            }

            // Insert conversation message
            await dbPool.query(
              `INSERT INTO public.conversation_messages (
                 id, workspace_id, channel_connection_id, journey_id, contact_id,
                 direction, sender_type, provider_message_id, text_content, media_payload, sent_at
               )
               VALUES (
                 gen_random_uuid(), $1, $2, $3, $4, 'inbound', 'customer', $5, $6, $7, $8
               )
               ON CONFLICT (channel_connection_id, provider_message_id) DO NOTHING`,
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
          } catch (err) {
            console.error('Erro ao ingerir mensagem WABA:', err);
          }
        }
      }
    }

    return reply.status(200).send({ status: 'ok' });
  });
};
