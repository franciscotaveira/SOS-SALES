#!/usr/bin/env node
/**
 * sync-conversations-direct.mjs
 * 
 * Script standalone que sincroniza conversas WAHA → Postgres
 * sem precisar de autenticação HTTP (usa variáveis de ambiente do .env).
 *
 * Uso:
 *   node scripts/sync-conversations-direct.mjs
 *   
 * Ou com variáveis customizadas:
 *   WAHA_BASE_URL=http://localhost:3005 DATABASE_URL=postgres://... node scripts/sync-conversations-direct.mjs
 */

import pg from 'pg';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// Carrega .env manualmente se existir
function loadEnv(envFile) {
  if (!fs.existsSync(envFile)) return;
  const lines = fs.readFileSync(envFile, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

// Tenta carregar .env do projeto
loadEnv(path.join(projectRoot, '.env'));
loadEnv(path.join(projectRoot, 'apps/api/.env'));
loadEnv(path.join(projectRoot, '.env.local'));

const WAHA_BASE_URL = process.env.WAHA_BASE_URL || 'http://localhost:3005';
const WAHA_API_KEY = process.env.WAHA_API_KEY || 'mct_sos_waha_dev_secret_2026';
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL não configurada. Defina no .env ou como variável de ambiente.');
  process.exit(1);
}

const WORKSPACES = [
  { id: '11111111-1111-1111-1111-111111111111', session: 'default',  name: 'SOS Sales (Matriz)' },
  { id: '22222222-2222-2222-2222-222222222222', session: 'haven',    name: 'Haven' },
  { id: '33333333-3333-3333-3333-333333333333', session: 'sora',     name: 'Sora' },
];

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

function extractChatId(c) {
  if (!c) return '';
  if (typeof c.id === 'string') return c.id;
  if (c.id?._serialized) return c.id._serialized;
  if (c.id?.id && typeof c.id.id === 'string') return c.id.id;
  if (c.id?.user && c.id?.server) return `${c.id.user}@${c.id.server}`;
  if (c._serialized) return c._serialized;
  return '';
}

function extractMessageId(msg) {
  if (!msg) return '';
  if (typeof msg.id === 'string') return msg.id;
  if (msg.id?._serialized) return msg.id._serialized;
  if (msg.id?.id) return msg.id.id;
  if (typeof msg.key?.id === 'string') return msg.key.id;
  if (msg.key?.id?._serialized) return msg.key.id._serialized;
  if (msg.key?.id?.id) return msg.key.id.id;
  return '';
}

async function syncWorkspace({ id: workspaceId, session: sessionName, name }) {
  console.log(`\n🔄 [${name}] Sincronizando sessão "${sessionName}"...`);

  // 1. Verifica se a sessão WAHA está WORKING
  const sessRes = await fetch(`${WAHA_BASE_URL}/api/sessions?all=true`, {
    headers: { 'x-api-key': WAHA_API_KEY },
  }).catch(err => { console.log(`  ⚠️  WAHA não acessível: ${err.message}`); return null; });

  if (!sessRes || !sessRes.ok) {
    console.log(`  ❌ WAHA não respondeu. URL: ${WAHA_BASE_URL}`);
    return { syncedContacts: 0, syncedMessages: 0 };
  }

  const sessions = await sessRes.json().catch(() => []);
  const currentSession = Array.isArray(sessions) ? sessions.find(s => s.name === sessionName) : null;

  if (!currentSession) {
    console.log(`  ⚠️  Sessão "${sessionName}" não encontrada no WAHA.`);
    console.log(`     Sessões ativas: ${sessions.map(s => `${s.name}(${s.status})`).join(', ') || 'nenhuma'}`);
    return { syncedContacts: 0, syncedMessages: 0 };
  }

  if (currentSession.status !== 'WORKING') {
    console.log(`  ⚠️  Sessão "${sessionName}" não está WORKING (status: ${currentSession.status}).`);
    console.log(`     Esta conta precisa ser reconectada via QR Code no CRM.`);
    return { syncedContacts: 0, syncedMessages: 0 };
  }

  console.log(`  ✅ Sessão WORKING | Phone: ${currentSession.me?.id || '?'} | Nome: ${currentSession.me?.pushName || '?'}`);

  const client = await pool.connect();
  let syncedContacts = 0;
  let syncedMessages = 0;

  try {
    const phoneNumber = currentSession.me?.id ? currentSession.me.id.split('@')[0] : sessionName;
    const channelName = currentSession.me?.pushName
      ? `WhatsApp (${currentSession.me.pushName})`
      : `WhatsApp (${sessionName})`;

    // 2. Upsert channel_connection
    const existingCh = await client.query(
      `SELECT id, public_config FROM public.channel_connections
       WHERE workspace_id = $1 AND provider = 'waha' AND status = 'CONNECTED'
         AND (public_config->>'sessionName' = $2 OR public_config->>'session' = $2)
       ORDER BY updated_at DESC LIMIT 1`,
      [workspaceId, sessionName]
    );

    let channelConnectionId;
    if (existingCh.rows.length > 0) {
      channelConnectionId = existingCh.rows[0].id;
      const currentConfig = existingCh.rows[0].public_config || {};
      await client.query(
        `UPDATE public.channel_connections
         SET status = 'CONNECTED', phone_number = $1, name = $2, public_config = $4::jsonb, updated_at = NOW()
         WHERE id = $3`,
        [phoneNumber, channelName, channelConnectionId, JSON.stringify({ ...currentConfig, engine: 'WAHA', sessionName })]
      );
      console.log(`  📡 Channel connection atualizado: ${channelConnectionId}`);
    } else {
      const inserted = await client.query(
        `INSERT INTO public.channel_connections
           (id, workspace_id, provider, phone_number, name, public_config, status, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'waha', $2, $3, $4::jsonb, 'CONNECTED', NOW(), NOW())
         RETURNING id`,
        [workspaceId, phoneNumber, channelName, JSON.stringify({ engine: 'WAHA', sessionName })]
      );
      channelConnectionId = inserted.rows[0].id;
      console.log(`  📡 Channel connection criado: ${channelConnectionId}`);
    }

    // 3. Busca chats do WAHA
    const chatsRes = await fetch(`${WAHA_BASE_URL}/api/${sessionName}/chats?limit=50`, {
      headers: { 'x-api-key': WAHA_API_KEY },
    });

    if (!chatsRes.ok) {
      console.log(`  ⚠️  Não foi possível buscar chats: ${chatsRes.status} ${chatsRes.statusText}`);
      return { syncedContacts: 0, syncedMessages: 0 };
    }

    const chats = await chatsRes.json();
    if (!Array.isArray(chats)) {
      console.log(`  ⚠️  Resposta de chats inválida`);
      return { syncedContacts: 0, syncedMessages: 0 };
    }

    const validChats = chats.filter(c => {
      const id = extractChatId(c);
      return id
        && !c.isGroup
        && !c.isNewsletter
        && !id.endsWith('@g.us')
        && !id.endsWith('@newsletter')
        && !id.includes('status')
        && !id.includes('broadcast');
    }).slice(0, 50);

    console.log(`  📋 ${validChats.length} chats individuais encontrados`);

    // 4. Para cada chat: upsert contact, journey e mensagens
    for (const chat of validChats) {
      const chatId = extractChatId(chat);
      const rawPhone = chatId.split('@')[0];
      let contactName = (chat.name || chat.pushname || '').trim();
      if (!contactName || contactName.replace(/\D/g, '') === rawPhone) {
        contactName = `Contato +${rawPhone}`;
      }

      // Upsert contact
      const contactRes = await client.query(
        `INSERT INTO public.contacts (id, workspace_id, phone, whatsapp_id, name, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())
         ON CONFLICT (workspace_id, phone) DO UPDATE
           SET name = COALESCE(NULLIF(EXCLUDED.name, ''), public.contacts.name), updated_at = NOW()
         RETURNING id`,
        [workspaceId, rawPhone, chatId, contactName]
      );
      const contactId = contactRes.rows[0].id;
      syncedContacts++;

      // Upsert journey
      let journeyId;
      const existingJourney = await client.query(
        `SELECT id FROM public.commercial_journeys
         WHERE workspace_id = $1 AND contact_id = $2 AND status = 'OPEN'
           AND (channel_connection_id = $3 OR channel_connection_id IS NULL)
         ORDER BY (channel_connection_id = $3) DESC, updated_at DESC LIMIT 1`,
        [workspaceId, contactId, channelConnectionId]
      );

      if (existingJourney.rows.length > 0) {
        journeyId = existingJourney.rows[0].id;
        await client.query(
          `UPDATE public.commercial_journeys
           SET channel_connection_id = COALESCE(channel_connection_id, $2), updated_at = NOW()
           WHERE id = $1`,
          [journeyId, channelConnectionId]
        );
      } else {
        const insertedJ = await client.query(
          `INSERT INTO public.commercial_journeys
             (id, workspace_id, contact_id, channel_connection_id, status, pipeline_stage,
              total_revenue_minor, currency, started_at, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, 'OPEN', 'NEW', 0, 'BRL', NOW(), NOW(), NOW())
           ON CONFLICT DO NOTHING RETURNING id`,
          [workspaceId, contactId, channelConnectionId]
        );
        if (insertedJ.rows[0]?.id) {
          journeyId = insertedJ.rows[0].id;
        } else {
          const raced = await client.query(
            `SELECT id FROM public.commercial_journeys
             WHERE workspace_id = $1 AND contact_id = $2 AND channel_connection_id = $3 AND status = 'OPEN'
             LIMIT 1`,
            [workspaceId, contactId, channelConnectionId]
          );
          journeyId = raced.rows[0]?.id;
        }
      }

      if (!journeyId) continue;

      // Busca mensagens recentes
      try {
        const msgsRes = await fetch(
          `${WAHA_BASE_URL}/api/${sessionName}/chats/${encodeURIComponent(chatId)}/messages?limit=25`,
          { headers: { 'x-api-key': WAHA_API_KEY } }
        );

        if (msgsRes.ok) {
          const msgs = await msgsRes.json();
          if (Array.isArray(msgs)) {
            for (const msg of msgs) {
              let bodyText = typeof msg.body === 'string' ? msg.body : (msg.caption || '');
              if (!bodyText && (msg.hasMedia || msg.type !== 'chat')) {
                const t = msg.type || 'mídia';
                if (t === 'image') bodyText = msg.caption ? `📷 ${msg.caption}` : '📷 [Imagem]';
                else if (t === 'audio' || t === 'ptt' || t === 'voice') bodyText = '🎤 [Mensagem de Áudio]';
                else if (t === 'video') bodyText = msg.caption ? `🎥 ${msg.caption}` : '🎥 [Vídeo]';
                else if (t === 'document') bodyText = msg.filename ? `📄 ${msg.filename}` : '📄 [Documento]';
                else if (t === 'sticker') bodyText = '🏷️ [Figurinha]';
                else bodyText = `📎 [${t.toUpperCase()}]`;
              }
              const msgId = extractMessageId(msg);
              if (!msgId) continue;
              const timestamp = Number(msg.timestamp);
              if (!Number.isFinite(timestamp) || timestamp <= 0) continue;
              const sentAt = new Date(timestamp > 1e11 ? timestamp : timestamp * 1000);
              if (Number.isNaN(sentAt.getTime())) continue;
              const direction = msg.fromMe ? 'outbound' : 'inbound';
              const senderType = msg.fromMe ? 'operator' : 'customer';

              const inserted = await client.query(
                `INSERT INTO public.conversation_messages
                   (id, workspace_id, channel_connection_id, journey_id, contact_id,
                    direction, sender_type, provider_message_id, text_content, sent_at)
                 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
                 ON CONFLICT (channel_connection_id, provider_message_id) DO NOTHING`,
                [workspaceId, channelConnectionId, journeyId, contactId,
                 direction, senderType, msgId, bodyText, sentAt]
              );
              if ((inserted.rowCount ?? 0) > 0) syncedMessages++;
            }
          }
        }
      } catch {
        // continua com próximo chat
      }
    }

    console.log(`  ✅ Sincronizado | Contatos: ${syncedContacts} | Mensagens novas: ${syncedMessages}`);
    return { syncedContacts, syncedMessages };
  } finally {
    client.release();
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SOS Sales — Sync Direto de Conversas WAHA → Postgres');
  console.log(`  WAHA: ${WAHA_BASE_URL}`);
  console.log(`  DB:   ${DATABASE_URL?.replace(/:([^:@]+)@/, ':***@') || 'N/A'}`);
  console.log('═══════════════════════════════════════════════════════════════');

  const results = [];
  for (const ws of WORKSPACES) {
    try {
      const result = await syncWorkspace(ws);
      results.push({ ...ws, ...result, ok: true });
    } catch (err) {
      console.log(`\n  ❌ Erro em ${ws.name}: ${err.message}`);
      results.push({ ...ws, ok: false, error: err.message, syncedContacts: 0, syncedMessages: 0 });
    }
    await new Promise(r => setTimeout(r, 500));
  }

  await pool.end();

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  RESUMO FINAL');
  console.log('═══════════════════════════════════════════════════════════════');
  let totalContacts = 0;
  let totalMessages = 0;
  for (const r of results) {
    const status = r.ok ? '✅' : '❌';
    console.log(`  ${status} ${r.name.padEnd(25)} contatos: ${String(r.syncedContacts).padStart(3)} | msgs novas: ${String(r.syncedMessages).padStart(5)}`);
    totalContacts += r.syncedContacts;
    totalMessages += r.syncedMessages;
  }
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`  TOTAL:                     contatos: ${String(totalContacts).padStart(3)} | msgs novas: ${String(totalMessages).padStart(5)}`);
  console.log('');
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
