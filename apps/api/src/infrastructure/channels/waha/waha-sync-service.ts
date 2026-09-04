import { dbPool } from '../../database/pool.js';
import { isProductionRuntime } from '../../security/runtime-safety.js';
import { WahaLidIdentityResolver } from './waha-lid-identity-resolver.js';

const WAHA_BASE_URL = process.env.WAHA_BASE_URL || 'http://sos-sales-waha:3000';
const WAHA_API_KEY = process.env.WAHA_API_KEY || (isProductionRuntime() ? '' : 'mct_sos_waha_dev_secret_2026');
const lidIdentityResolver = WAHA_API_KEY
  ? new WahaLidIdentityResolver({ baseUrl: WAHA_BASE_URL, apiKey: WAHA_API_KEY })
  : undefined;

function extractChatId(c: any): string {
  if (!c) return '';
  if (typeof c.id === 'string') return c.id;
  if (c.id?._serialized) return c.id._serialized;
  if (c.id?.id && typeof c.id.id === 'string') return c.id.id;
  if (c.id?.user && c.id?.server) return `${c.id.user}@${c.id.server}`;
  if (c._serialized) return c._serialized;
  return '';
}

function extractMessageId(msg: any): string {
  if (!msg) return '';
  if (typeof msg.id === 'string') return msg.id;
  if (msg.id?._serialized) return msg.id._serialized;
  if (msg.id?.id) return msg.id.id;
  if (typeof msg.key?.id === 'string') return msg.key.id;
  if (msg.key?.id?._serialized) return msg.key.id._serialized;
  if (msg.key?.id?.id) return msg.key.id.id;
  return '';
}

export class WahaSyncService {
  /**
   * Syncs active chats and recent messages from WAHA session into PostgreSQL
   */
  public static async syncWorkspaceChats(workspaceId: string, sessionName: string, maxChats = 40): Promise<{ syncedContacts: number; syncedMessages: number; channelConnectionId: string }> {
    const client = await dbPool.connect();
    let syncedContacts = 0;
    let syncedMessages = 0;

    try {
      // 1. Ensure channel_connection exists in database
      const meRes = await fetch(`${WAHA_BASE_URL}/api/sessions?all=true`, {
        headers: { 'x-api-key': WAHA_API_KEY },
      });
      const sessions = (await meRes.json().catch(() => [])) as Array<{ name: string; status: string; me?: any }>;
      const currentSession = Array.isArray(sessions)
        ? sessions.find((s) => s.name === sessionName)
        : null;

      if (!currentSession || currentSession.status !== 'WORKING') {
        console.log(`[WahaSyncService] Session "${sessionName}" for workspace ${workspaceId} is not WORKING (status: ${currentSession?.status || 'NOT_FOUND'}). Skipping sync.`);
        return { syncedContacts: 0, syncedMessages: 0, channelConnectionId: '' };
      }

      const actualSessionName = currentSession.name;
      const phoneNumber = currentSession.me?.id ? currentSession.me.id.split('@')[0] : (currentSession.name || '');
      const channelName = currentSession.me?.pushName ? `WhatsApp (${currentSession.me.pushName})` : `WhatsApp (${actualSessionName})`;

      let channelConnectionId: string;
      // Sync belongs exclusively to a WAHA channel. Selecting an arbitrary
      // workspace channel here could overwrite a Meta Cloud connection and
      // make subsequent inbound events appear under the wrong provider.
      const existing = await client.query(
        `SELECT id, public_config FROM public.channel_connections
         WHERE workspace_id = $1
           AND provider = 'waha'
           AND status = 'CONNECTED'
           AND (
             public_config->>'sessionName' = $2
             OR public_config->>'session' = $2
           )
         ORDER BY updated_at DESC
         LIMIT 2`,
        [workspaceId, actualSessionName]
      );
      if (existing.rows.length > 1) {
        throw new Error(`More than one WAHA channel is mapped to session ${actualSessionName}`);
      }
      let channelRow = existing.rows[0];
      if (!channelRow) {
        // Older installations may have one connected, unbound WAHA channel.
        // Reuse it only when it is unambiguous; never select a disconnected
        // record or a channel already mapped to another session.
        const unbound = await client.query(
          `SELECT id, public_config FROM public.channel_connections
           WHERE workspace_id = $1
             AND provider = 'waha'
             AND status = 'CONNECTED'
             AND COALESCE(NULLIF(public_config->>'sessionName', ''), NULLIF(public_config->>'session', '')) IS NULL
           ORDER BY updated_at DESC
           LIMIT 2`,
          [workspaceId]
        );
        if (unbound.rows.length > 1) {
          throw new Error(`More than one unbound CONNECTED WAHA channel exists for workspace ${workspaceId}`);
        }
        channelRow = unbound.rows[0];
      }
      if (channelRow) {
        channelConnectionId = channelRow.id;
        const currentConfig = typeof channelRow.public_config === 'string'
          ? JSON.parse(channelRow.public_config)
          : (channelRow.public_config || {});
        await client.query(`
          UPDATE public.channel_connections 
          SET status = 'CONNECTED', phone_number = $1, name = $2,
              public_config = $4::jsonb, updated_at = NOW()
          WHERE id = $3
        `, [phoneNumber, channelName, channelConnectionId, JSON.stringify({ ...currentConfig, engine: currentConfig.engine || 'WAHA', sessionName: actualSessionName })]);
      } else {
        const insertCh = await client.query(`
          INSERT INTO public.channel_connections (
            id, workspace_id, provider, phone_number, name, public_config, status, created_at, updated_at
          ) VALUES (
            gen_random_uuid(), $1, 'waha', $2, $3, $4::jsonb, 'CONNECTED', NOW(), NOW()
          ) RETURNING id
        `, [workspaceId, phoneNumber, channelName, JSON.stringify({ engine: 'WAHA', sessionName: actualSessionName })]);
        channelConnectionId = insertCh.rows[0].id;
      }

      // 2. Fetch chats from WAHA
      const chatsRes = await fetch(`${WAHA_BASE_URL}/api/${actualSessionName}/chats?limit=${maxChats}`, {
        headers: { 'x-api-key': WAHA_API_KEY },
      });

      if (!chatsRes.ok) {
        console.warn(`Could not fetch chats from WAHA session ${sessionName}: ${chatsRes.statusText}`);
        return { syncedContacts: 0, syncedMessages: 0, channelConnectionId };
      }

      const chats = (await chatsRes.json()) as any[];
      if (!Array.isArray(chats)) {
        return { syncedContacts: 0, syncedMessages: 0, channelConnectionId };
      }

      const validChats = chats
        .filter((c) => {
          const id = extractChatId(c);
          return id
            && !c.isGroup
            && !c.isNewsletter
            && !id.endsWith('@g.us')
            && !id.endsWith('@newsletter')
            && !id.includes('status')
            && !id.includes('broadcast');
        })
        .slice(0, maxChats);

      for (const chat of validChats) {
        const chatId = extractChatId(chat);
        const rawId = chatId.split('@')[0];
        const chatName = (chat.name || chat.pushname || '').trim();

        let rawPhone = rawId;
        if (chatId.endsWith('@lid')) {
          const phoneJid = lidIdentityResolver
            ? await lidIdentityResolver.resolvePhone({ session: actualSessionName, lid: chatId }).catch(() => null)
            : null;
          if (!phoneJid) {
            console.warn(`[WahaSyncService] Skipping unresolved WAHA LID ${chatId}; no phone inferred from chat name`);
            continue;
          }
          rawPhone = phoneJid.split('@')[0];
        }

        let contactName = chatName;
        if (!contactName || contactName.replace(/\D/g, '') === rawPhone) {
          contactName = `Contato +${rawPhone}`;
        }

        // Upsert contact
        const contactRes = await client.query(`
          INSERT INTO public.contacts (
            id, workspace_id, phone, whatsapp_id, name, created_at, updated_at
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW()
          )
          ON CONFLICT (workspace_id, phone) DO UPDATE SET name = COALESCE(NULLIF(EXCLUDED.name, ''), public.contacts.name), updated_at = NOW()
          RETURNING id
        `, [workspaceId, rawPhone, chatId, contactName]);

        const contactId = contactRes.rows[0].id;
        syncedContacts++;

        // Upsert commercial journey
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
          // The channel-scoped partial index is the final race fence. If this
          // process races another sync, resolve the winner by exact channel;
          // never reuse a journey belonging to another provider.
          const insertJourney = await client.query(`
            INSERT INTO public.commercial_journeys (
              id, workspace_id, contact_id, channel_connection_id, status, pipeline_stage,
              total_revenue_minor, currency, started_at, created_at, updated_at
            ) VALUES (
              gen_random_uuid(), $1, $2, $3, 'OPEN', 'NEW', 0, 'BRL', NOW(), NOW(), NOW()
            )
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
              throw new Error(`Could not create or resolve a WAHA journey for contact ${contactId}`);
            }
            journeyId = racedJourney.rows[0].id;
          }
        }


        // Fetch recent messages for this chat
        try {
          const msgsRes = await fetch(`${WAHA_BASE_URL}/api/${actualSessionName}/chats/${encodeURIComponent(chatId)}/messages?limit=25`, {
            headers: { 'x-api-key': WAHA_API_KEY },
          });

          if (msgsRes.ok) {
            const msgs = (await msgsRes.json()) as any[];
            if (Array.isArray(msgs)) {
              for (const msg of msgs) {
                let bodyText = typeof msg.body === 'string' ? msg.body : (msg.caption || '');
                if (!bodyText && (msg.hasMedia || msg.type !== 'chat')) {
                  const mediaType = msg.type || 'mídia';
                  if (mediaType === 'image') bodyText = msg.caption ? `📷 ${msg.caption}` : '📷 [Imagem]';
                  else if (mediaType === 'audio' || mediaType === 'ptt' || mediaType === 'voice') bodyText = '🎤 [Mensagem de Áudio]';
                  else if (mediaType === 'video') bodyText = msg.caption ? `🎥 ${msg.caption}` : '🎥 [Vídeo]';
                  else if (mediaType === 'document') bodyText = msg.filename ? `📄 ${msg.filename}` : '📄 [Documento]';
                  else if (mediaType === 'sticker') bodyText = '🏷️ [Figurinha]';
                  else bodyText = `📎 [${mediaType.toUpperCase()}]`;
                }
                const msgId = extractMessageId(msg);
                // A provider message without an id cannot be deduplicated.
                // Do not invent a UUID: repeating the sync would otherwise
                // create a new conversation row for the same remote message.
                if (!msgId) continue;
                const timestamp = Number(msg.timestamp);
                if (!Number.isFinite(timestamp) || timestamp <= 0) continue;
                const sentAt = new Date(timestamp > 1e11 ? timestamp : timestamp * 1000);
                if (Number.isNaN(sentAt.getTime())) continue;
                const direction = msg.fromMe ? 'outbound' : 'inbound';
                const senderType = msg.fromMe ? 'operator' : 'customer';

                const insertedMessage = await client.query(`
                  INSERT INTO public.conversation_messages (
                    id, workspace_id, channel_connection_id, journey_id, contact_id,
                    direction, sender_type, provider_message_id, text_content, sent_at
                  ) VALUES (
                    gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9
                  )
                  ON CONFLICT (channel_connection_id, provider_message_id) DO NOTHING
                `, [workspaceId, channelConnectionId, journeyId, contactId, direction, senderType, msgId, bodyText, sentAt]);
                if ((insertedMessage.rowCount ?? 0) > 0) syncedMessages++;
              }
            }
          }
        } catch {
          // continue with other chats
        }
      }

      return { syncedContacts, syncedMessages, channelConnectionId };
    } finally {
      client.release();
    }
  }

  /**
   * Configures WAHA session webhook to deliver messages to SOS Sales API
   */
  public static async configureWahaWebhook(sessionName: string, apiUrl: string): Promise<void> {
    try {
      const webhookUrl = `${apiUrl}/api/v1/channels/waha/webhook`;
      await fetch(`${WAHA_BASE_URL}/api/sessions/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': WAHA_API_KEY },
        body: JSON.stringify({
          name: sessionName,
          config: {
            webhooks: [
              {
                url: webhookUrl,
                events: ['message', 'message.any', 'session.status'],
                customHeaders: [{
                  name: 'x-api-key',
                  value: WAHA_API_KEY,
                }],
              },
            ],
          },
        }),
      });
    } catch (err: any) {
      console.warn(`Failed to configure WAHA webhook: ${err.message}`);
    }
  }
}
