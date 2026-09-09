#!/usr/bin/env node
/**
 * check-media-vps.mjs
 * Verifica o estado das mensagens de mídia nos workspaces sincronizados.
 */
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const WS = {
  '11111111-1111-1111-1111-111111111111': 'SOS Sales',
  '22222222-2222-2222-2222-222222222222': 'Haven',
  '33333333-3333-3333-3333-333333333333': 'Sora',
};

async function main() {
  const client = await pool.connect();
  try {
    // 1. Stats por workspace (workspace_id::text to avoid uuid sort/cast errors)
    const stats = await client.query(`
      SELECT
        workspace_id::text as ws_id,
        COUNT(*) as total_msgs,
        COUNT(media_payload) as with_media,
        COUNT(CASE WHEN text_content LIKE '%[Imagem]%' OR text_content LIKE U&'%\\1F4F7%' THEN 1 END) as images,
        COUNT(CASE WHEN text_content LIKE '%[Vídeo]%' OR text_content LIKE U&'%\\1F3A5%' THEN 1 END) as videos,
        COUNT(CASE WHEN text_content LIKE '%Áudio%' OR text_content LIKE U&'%\\1F3A4%' THEN 1 END) as audios,
        COUNT(CASE WHEN text_content LIKE '%[Documento]%' OR text_content LIKE U&'%\\1F4C4%' THEN 1 END) as docs
      FROM public.conversation_messages
      WHERE workspace_id::text = ANY(ARRAY[
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        '33333333-3333-3333-3333-333333333333'
      ])
      GROUP BY workspace_id::text
      ORDER BY workspace_id::text
    `);

    console.log('\n=== ESTATÍSTICAS DE MENSAGENS POR WORKSPACE ===');
    for (const r of stats.rows) {
      const name = WS[r.ws_id] || r.ws_id;
      console.log(`\n${name}:`);
      console.log(`  Total mensagens : ${r.total_msgs}`);
      console.log(`  Com media_payload: ${r.with_media}`);
      console.log(`  Imagens         : ${r.images}`);
      console.log(`  Videos          : ${r.videos}`);
      console.log(`  Audios          : ${r.audios}`);
      console.log(`  Documentos      : ${r.docs}`);
    }

    // 2. Amostra de mensagens com media_payload
    const sample = await client.query(`
      SELECT
        workspace_id::text as ws_id,
        text_content,
        media_payload,
        sent_at
      FROM public.conversation_messages
      WHERE media_payload IS NOT NULL
        AND workspace_id::text = ANY(ARRAY[
          '11111111-1111-1111-1111-111111111111',
          '22222222-2222-2222-2222-222222222222'
        ])
      ORDER BY sent_at DESC
      LIMIT 5
    `);

    console.log('\n=== AMOSTRA: MENSAGENS COM media_payload ===');
    if (sample.rows.length === 0) {
      console.log('Nenhuma. (Sync inicial salva tipo como emoji no text_content - OK)');
    } else {
      for (const row of sample.rows) {
        const p = typeof row.media_payload === 'string' ? JSON.parse(row.media_payload) : row.media_payload;
        console.log(`[${WS[row.ws_id]}] ${(row.text_content || '').substring(0, 60)}`);
        console.log(`  mime: ${p?.mimetype || 'N/A'} | file: ${p?.filename || 'N/A'}`);
      }
    }

    // 3. Isolamento de dados entre workspaces
    const leak1 = await client.query(`
      SELECT COUNT(*) as count
      FROM public.conversation_messages cm
      JOIN public.channel_connections cc ON cc.id = cm.channel_connection_id
      WHERE cm.workspace_id::text = '11111111-1111-1111-1111-111111111111'
        AND cc.workspace_id::text != '11111111-1111-1111-1111-111111111111'
    `);
    const leak2 = await client.query(`
      SELECT COUNT(*) as count
      FROM public.conversation_messages cm
      JOIN public.channel_connections cc ON cc.id = cm.channel_connection_id
      WHERE cm.workspace_id::text = '22222222-2222-2222-2222-222222222222'
        AND cc.workspace_id::text != '22222222-2222-2222-2222-222222222222'
    `);
    console.log('\n=== ISOLAMENTO DE DADOS ===');
    console.log(`SOS Sales - msgs com channel de outro ws : ${leak1.rows[0].count} (deve ser 0)`);
    console.log(`Haven     - msgs com channel de outro ws : ${leak2.rows[0].count} (deve ser 0)`);

    // 4. Últimas mensagens Haven
    const havenSample = await client.query(`
      SELECT c.name as contact_name, cm.text_content, cm.direction
      FROM public.conversation_messages cm
      JOIN public.contacts c ON c.id = cm.contact_id
      WHERE cm.workspace_id::text = '22222222-2222-2222-2222-222222222222'
      ORDER BY cm.sent_at DESC
      LIMIT 5
    `);
    console.log('\n=== ULTIMAS MENSAGENS - HAVEN ===');
    for (const r of havenSample.rows) {
      const dir = r.direction === 'inbound' ? '<-' : '->';
      console.log(`  ${dir} [${r.contact_name}] ${(r.text_content || '').substring(0, 60)}`);
    }

    // 5. Últimas mensagens SOS Sales
    const sosSample = await client.query(`
      SELECT c.name as contact_name, cm.text_content, cm.direction
      FROM public.conversation_messages cm
      JOIN public.contacts c ON c.id = cm.contact_id
      WHERE cm.workspace_id::text = '11111111-1111-1111-1111-111111111111'
      ORDER BY cm.sent_at DESC
      LIMIT 5
    `);
    console.log('\n=== ULTIMAS MENSAGENS - SOS SALES ===');
    for (const r of sosSample.rows) {
      const dir = r.direction === 'inbound' ? '<-' : '->';
      console.log(`  ${dir} [${r.contact_name}] ${(r.text_content || '').substring(0, 60)}`);
    }

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
