/**
 * RECONCILE AND SYNC CONTACTS (MCT OS v2.0)
 *
 * 1. Synchronizes real names from WAHA chats for all active contacts in both workspaces.
 * 2. Clears operator pushName placeholders ('Haven Escovaria') from customer contacts.
 * 3. Reconciles duplicate un-prefixed contacts and links messages to canonical journeys.
 */

import pg from 'pg';
import http from 'node:http';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required.');
  process.exit(1);
}

const WAHA_BASE = process.env.WAHA_BASE_URL || 'http://sos-sales-waha:3000';
const WAHA_KEY = process.env.WAHA_API_KEY || 'mct_sos_waha_master_2026';

const SESSIONS = [
  { session: 'haven', workspaceId: '22222222-2222-2222-2222-222222222222' },
  { session: 'default', workspaceId: '11111111-1111-1111-1111-111111111111' },
];

function fetchWaha(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, WAHA_BASE);
    const req = http.get(url, { headers: { 'x-api-key': WAHA_KEY } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse WAHA response from ${path}: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
  });
}

async function run() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    console.log('🚀 [RECONCILE & SYNC] Starting contact normalization and synchronization...\n');

    // -------------------------------------------------------------------------
    // STEP 1: Clear operator business name from customer contacts
    // -------------------------------------------------------------------------
    console.log('🧹 STEP 1: Clearing "Haven Escovaria" operator pushName from customer contacts...');
    const cleanedHaven = await client.query(`
      UPDATE public.contacts
      SET name = NULL, updated_at = NOW()
      WHERE LOWER(name) = 'haven escovaria' OR LOWER(name) LIKE 'haven escovaria%'
    `);
    console.log(`✅ Cleared operator name placeholder from ${cleanedHaven.rowCount} contacts.\n`);

    // -------------------------------------------------------------------------
    // STEP 2: Sync real names from WAHA for all active chats
    // -------------------------------------------------------------------------
    console.log('📡 STEP 2: Synchronizing real contact names from WAHA chats...');

    let totalNamesSynced = 0;

    for (const { session, workspaceId } of SESSIONS) {
      console.log(`\n--- Fetching WAHA chats for session "${session}" (Workspace ${workspaceId}) ---`);
      let chats = [];
      try {
        chats = await fetchWaha(`/api/${session}/chats?limit=200`);
      } catch (err) {
        console.warn(`⚠️ Could not fetch chats for session "${session}":`, err.message);
        continue;
      }

      if (!Array.isArray(chats)) {
        console.warn(`⚠️ WAHA returned non-array for session "${session}"`);
        continue;
      }

      console.log(`Retrieved ${chats.length} chats from WAHA.`);

      for (const chat of chats) {
        if (chat.isGroup || chat.isNewsletter) continue;
        const cid = typeof chat.id === 'object' ? chat.id._serialized : (chat.id || '');
        if (!cid || cid.includes('@g.us') || cid.includes('status') || cid.includes('broadcast')) continue;

        let rawPhone = cid.split('@')[0];

        // Resolve LID if needed
        if (cid.endsWith('@lid')) {
          const lidId = rawPhone;
          try {
            const lidRes = await fetchWaha(`/api/${session}/lids/${lidId}`);
            if (lidRes && typeof lidRes.pn === 'string' && lidRes.pn.includes('@c.us')) {
              rawPhone = lidRes.pn.split('@')[0];
            } else {
              continue; // Could not resolve LID to phone
            }
          } catch {
            continue;
          }
        }

        const cleanDigits = rawPhone.replace(/\D/g, '');
        if (!cleanDigits || cleanDigits.length < 8) continue;
        const canonicalPhone = `+${cleanDigits}`;

        // Get candidate name
        let rawName = (chat.name || chat.pushname || '').trim();
        if (
          !rawName ||
          rawName === rawPhone ||
          rawName.replace(/\D/g, '') === cleanDigits ||
          rawName.toLowerCase() === 'haven escovaria' ||
          rawName.toLowerCase().startsWith('haven escovaria') ||
          rawName.startsWith('Contato +')
        ) {
          continue; // No useful real name
        }

        // Update contact name for both canonical (+phone) and un-prefixed phone
        const updateRes = await client.query(
          `UPDATE public.contacts
           SET name = $1, updated_at = NOW()
           WHERE workspace_id = $2
             AND (phone = $3 OR phone = $4)
             AND (name IS NULL OR name = '' OR name LIKE 'Contato +%' OR LOWER(name) LIKE 'haven escovaria%' OR name = phone OR name != $1)`,
          [rawName, workspaceId, canonicalPhone, cleanDigits]
        );

        if (updateRes.rowCount && updateRes.rowCount > 0) {
          totalNamesSynced += updateRes.rowCount;
          console.log(`  ✨ [${session}] ${canonicalPhone} -> "${rawName}"`);
        }
      }
    }

    console.log(`\n✅ STEP 2 COMPLETE: Synchronized ${totalNamesSynced} contact records from WAHA.\n`);

    // -------------------------------------------------------------------------
    // STEP 3: Reconcile duplicate un-prefixed contacts and journeys
    // -------------------------------------------------------------------------
    console.log('📦 STEP 3: Reconciling duplicate contacts and journeys...');
    const dupes = await client.query(`
      SELECT c1.id as old_id, c1.phone as old_phone, c1.name as old_name,
             c2.id as can_id, c2.phone as can_phone, c2.name as can_name,
             c1.workspace_id
      FROM public.contacts c1
      JOIN public.contacts c2 ON c1.workspace_id = c2.workspace_id AND c2.phone = '+' || c1.phone
      WHERE c1.phone NOT LIKE '+%'
    `);

    console.log(`Found ${dupes.rowCount} pairs of duplicate contacts.`);

    for (const row of dupes.rows) {
      await client.query('BEGIN');
      try {
        await client.query("SET LOCAL sales_os.allow_redaction = 'true'");

        // 1. Align name on canonical contact if old contact has a better name
        const oldName = (row.old_name || '').trim();
        const canName = (row.can_name || '').trim();
        const isOldGood = oldName && !oldName.startsWith('Contato +') && !oldName.toLowerCase().startsWith('haven escovaria');
        const isCanBad = !canName || canName.startsWith('Contato +') || canName.toLowerCase().startsWith('haven escovaria');

        if (isOldGood && isCanBad) {
          await client.query(`UPDATE public.contacts SET name = $1, updated_at = NOW() WHERE id = $2`, [oldName, row.can_id]);
        }

        // 2. Re-point conversation_messages from old_id to can_id
        await client.query(`UPDATE public.conversation_messages SET contact_id = $1 WHERE contact_id = $2`, [row.can_id, row.old_id]);

        // 3. Move messages from old open journey to canonical open journey
        const oldJourneys = await client.query(`SELECT id FROM public.commercial_journeys WHERE contact_id = $1 AND status = 'OPEN'`, [row.old_id]);
        const canJourneys = await client.query(`SELECT id FROM public.commercial_journeys WHERE contact_id = $1 AND status = 'OPEN' ORDER BY updated_at DESC LIMIT 1`, [row.can_id]);

        if (canJourneys.rows.length > 0) {
          const targetJourneyId = canJourneys.rows[0].id;
          for (const oj of oldJourneys.rows) {
            await client.query(`UPDATE public.conversation_messages SET journey_id = $1 WHERE journey_id = $2`, [targetJourneyId, oj.id]);
            await client.query(`UPDATE public.commercial_journeys SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1`, [oj.id]);
          }
        } else if (oldJourneys.rows.length > 0) {
          // Reassign old journey to canonical contact
          await client.query(`UPDATE public.commercial_journeys SET contact_id = $1, updated_at = NOW() WHERE contact_id = $2`, [row.can_id, row.old_id]);
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        console.warn(`  ⚠️ Failed to reconcile pair ${row.old_phone} / ${row.can_phone}:`, err.message);
      }
    }

    console.log(`✅ STEP 3 COMPLETE: Reconciled message flows.\n`);

    // -------------------------------------------------------------------------
    // STEP 4: Print final verification stats
    // -------------------------------------------------------------------------
    console.log('📊 FINAL AUDIT OF RECONCILED CONTACTS:');
    const stats = await client.query(`
      SELECT 
        w.name as workspace,
        COUNT(c.id) as total_contacts,
        COUNT(c.id) FILTER (WHERE c.name IS NOT NULL AND c.name NOT LIKE 'Contato +%' AND c.name != '') as named_contacts,
        COUNT(c.id) FILTER (WHERE c.name LIKE 'Contato +%' OR c.name IS NULL OR c.name = '') as unnamed_contacts
      FROM public.contacts c
      JOIN public.workspaces w ON w.id = c.workspace_id
      GROUP BY w.name
    `);
    console.table(stats.rows);

    // Sample active journeys in Haven
    console.log('\n🌟 LATEST RECONCILED JOURNEYS (Haven Escovaria):');
    const havenJourneys = await client.query(`
      SELECT j.id, c.name, c.phone, j.status, count(m.id) as msgs, max(m.sent_at) as last_msg
      FROM public.commercial_journeys j
      JOIN public.contacts c ON c.id = j.contact_id
      LEFT JOIN public.conversation_messages m ON m.journey_id = j.id
      WHERE j.workspace_id = '22222222-2222-2222-2222-222222222222' AND j.status = 'OPEN'
      GROUP BY j.id, c.name, c.phone, j.status
      ORDER BY max(m.sent_at) DESC NULLS LAST
      LIMIT 10
    `);
    console.table(havenJourneys.rows);

    // Sample active journeys in Matriz SOS
    console.log('\n🌟 LATEST RECONCILED JOURNEYS (SOS Vendas Matriz):');
    const defaultJourneys = await client.query(`
      SELECT j.id, c.name, c.phone, j.status, count(m.id) as msgs, max(m.sent_at) as last_msg
      FROM public.commercial_journeys j
      JOIN public.contacts c ON c.id = j.contact_id
      LEFT JOIN public.conversation_messages m ON m.journey_id = j.id
      WHERE j.workspace_id = '11111111-1111-1111-1111-111111111111' AND j.status = 'OPEN'
      GROUP BY j.id, c.name, c.phone, j.status
      ORDER BY max(m.sent_at) DESC NULLS LAST
      LIMIT 10
    `);
    console.table(defaultJourneys.rows);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('❌ Fatal error running reconciliation:', err);
  process.exit(1);
});
