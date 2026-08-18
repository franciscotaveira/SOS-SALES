import { dbPool } from '../../database/pool.js';
import crypto from 'node:crypto';

const WAHA_BASE_URL = process.env.WAHA_BASE_URL || 'http://sos-sales-waha:3000';
const WAHA_API_KEY = process.env.WAHA_API_KEY || 'mct_sos_waha_master_2026';

function extractChatId(c: any): string {
  if (!c) return '';
  if (typeof c.id === 'string') return c.id;
  if (c.id?._serialized) return c.id._serialized;
  if (c.id?.user && c.id?.server) return `${c.id.user}@${c.id.server}`;
  if (c._serialized) return c._serialized;
  return '';
}

function extractMessageId(msg: any): string {
  if (!msg) return crypto.randomUUID();
  if (typeof msg.id === 'string') return msg.id;
  if (msg.id?._serialized) return msg.id._serialized;
  if (msg.id?.id) return msg.id.id;
  return crypto.randomUUID();
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
        ? (sessions.find((s) => s.name === sessionName && s.status === 'WORKING') ||
           sessions.find((s) => s.name === sessionName) ||
           sessions.find((s) => s.status === 'WORKING') ||
           sessions[0] ||
           null)
        : null;
      const actualSessionName = currentSession?.name || sessionName;
      const phoneNumber = currentSession?.me?.id ? currentSession.me.id.split('@')[0] : (currentSession?.name || '5549991234567');
      const channelName = currentSession?.me?.pushName ? `WhatsApp (${currentSession.me.pushName})` : `WhatsApp (${actualSessionName})`;

      let channelConnectionId: string;
      const existing = await client.query('SELECT id FROM public.channel_connections WHERE workspace_id = $1 LIMIT 1', [workspaceId]);
      if (existing.rowCount && existing.rowCount > 0) {
        channelConnectionId = existing.rows[0].id;
        await client.query(`
          UPDATE public.channel_connections 
          SET status = 'CONNECTED', phone_number = $1, name = $2, updated_at = NOW()
          WHERE id = $3
        `, [phoneNumber, channelName, channelConnectionId]);
      } else {
        const insertCh = await client.query(`
          INSERT INTO public.channel_connections (
            id, workspace_id, provider, phone_number, name, public_config, status, created_at, updated_at
          ) VALUES (
            gen_random_uuid(), $1, 'waha', $2, $3, '{"engine":"WAHA"}', 'CONNECTED', NOW(), NOW()
          ) RETURNING id
        `, [workspaceId, phoneNumber, channelName]);
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
          return id && !c.isGroup && !id.endsWith('@g.us') && !id.includes('status') && !id.includes('broadcast');
        })
        .slice(0, maxChats);

      for (const chat of validChats) {
        const chatId = extractChatId(chat);
        const rawId = chatId.split('@')[0];
        const chatName = (chat.name || chat.pushname || '').trim();
        const phoneFromChatName = chatName.replace(/\D/g, '');

        let rawPhone = rawId;
        if (chatId.includes('@lid') && phoneFromChatName.length >= 10 && phoneFromChatName.length <= 15) {
          rawPhone = phoneFromChatName;
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
          SELECT id FROM public.commercial_journeys WHERE workspace_id = $1 AND contact_id = $2 LIMIT 1
        `, [workspaceId, contactId]);

        if (existingJourney.rowCount && existingJourney.rowCount > 0) {
          journeyId = existingJourney.rows[0].id;
          await client.query(`UPDATE public.commercial_journeys SET updated_at = NOW() WHERE id = $1`, [journeyId]);
        } else {
          // ON CONFLICT handles race conditions from concurrent sync calls
          const insertJourney = await client.query(`
            INSERT INTO public.commercial_journeys (
              id, workspace_id, contact_id, channel_connection_id, status, pipeline_stage,
              total_revenue_minor, currency, started_at, created_at, updated_at
            ) VALUES (
              gen_random_uuid(), $1, $2, $3, 'OPEN', 'NEW', 0, 'BRL', NOW(), NOW(), NOW()
            )
            ON CONFLICT (workspace_id, contact_id) WHERE status = 'OPEN' DO UPDATE SET updated_at = NOW()
            RETURNING id
          `, [workspaceId, contactId, channelConnectionId]);
          journeyId = insertJourney.rows[0].id;
        }


        // Fetch recent messages for this chat
        try {
          const msgsRes = await fetch(`${WAHA_BASE_URL}/api/${sessionName}/chats/${encodeURIComponent(chatId)}/messages?limit=25`, {
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
                const sentAt = msg.timestamp ? new Date(msg.timestamp * 1000) : new Date();
                const direction = msg.fromMe ? 'outbound' : 'inbound';
                const senderType = msg.fromMe ? 'operator' : 'customer';

                await client.query(`
                  INSERT INTO public.conversation_messages (
                    id, workspace_id, channel_connection_id, journey_id, contact_id,
                    direction, sender_type, provider_message_id, text_content, sent_at
                  ) VALUES (
                    gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9
                  )
                  ON CONFLICT (channel_connection_id, provider_message_id) DO NOTHING
                `, [workspaceId, channelConnectionId, journeyId, contactId, direction, senderType, msgId, bodyText, sentAt]);
                syncedMessages++;
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
