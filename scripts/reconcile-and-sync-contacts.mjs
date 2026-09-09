/**
 * RECONCILE AND SYNC CONTACTS (MCT OS v2.0)
 *
 * 1. Merges un-prefixed duplicate contacts (phone without '+') into canonical (+phone).
 * 2. Re-assigns messages and journeys to canonical contacts.
 * 3. Cleans operator pushName placeholders ('Haven Escovaria') from customer contacts.
 * 4. Pulls live chat names from WAHA (resolving LIDs) to synchronize real contact names.
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
    // STEP 1: Merge un-prefixed duplicate contacts
    // -------------------------------------------------------------------------
    console.log('📦 STEP 1: Reconciling un-prefixed phone numbers in public.contacts...');
    const unPrefixed = await client.query(`
      SELECT id, workspace_id, phone, name, whatsapp_id
      FROM public.contacts
      WHERE phone NOT LIKE '+%'
      ORDER BY created_at ASC
    `);

    let mergedCount = 0;
    let updatedPrefixCount = 0;

    for (const oldContact of unPrefixed.rows) {
      const cleanDigits = oldContact.phone.replace(/\D/g, '');
      if (!cleanDigits) continue;
      const canonicalPhone = `+${cleanDigits}`;

      // Check if canonical contact exists
      const canRes = await client.query(
        `SELECT id, name FROM public.contacts WHERE workspace_id = $1 AND phone = $2 LIMIT 1`,
        [oldContact.workspace_id, canonicalPhone]
      );

      if (canRes.rows.length > 0) {
        const canContact = canRes.rows[0];

        // 1. Reassign conversation messages
        await client.query(
          `UPDATE public.conversation_messages SET contact_id = $1 WHERE contact_id = $2`,
          [canContact.id, oldContact.id]
        );

        // 2. Reconcile journeys
        const oldJourneys = await client.query(
          `SELECT id, status FROM public.commercial_journeys WHERE contact_id = $1`,
          [oldContact.id]
        );

        const canJourneys = await client.query(
          `SELECT id, status FROM public.commercial_journeys WHERE contact_id = $1 AND status = 'OPEN' ORDER BY updated_at DESC LIMIT 1`,
          [canContact.id]
        );

        for (const oj of oldJourneys.rows) {
          if (canJourneys.rows.length > 0) {
            const canJourneyId = canJourneys.rows[0].id;
            // Move messages from old journey to canonical journey
            await client.query(
              `UPDATE public.conversation_messages SET journey_id = $1 WHERE journey_id = $2`,
              [canJourneyId, oj.id]
            );
            // Move other journey dependencies if any
            await client.query(
              `UPDATE public.client_notes SET journey_id = $1 WHERE journey_id = $2`,
              [canJourneyId, oj.id]
            ).catch(() => {});
            await client.query(
              `UPDATE public.commercial_outcomes SET journey_id = $1 WHERE journey_id = $2`,
              [canJourneyId, oj.id]
            ).catch(() => {});
            // Delete redundant old journey
            await client.query(`DELETE FROM public.commercial_journeys WHERE id = $1`, [oj.id]);
          } else {
            // Re-point old journey to canonical contact
            await client.query(
              `UPDATE public.commercial_journeys SET contact_id = $1 WHERE id = $2`,
              [canContact.id, oj.id]
            );
          }
        }

        // 3. Preserve any good name
        const oldName = (oldContact.name || '').trim();
        const canName = (canContact.name || '').trim();
        const isOldGood = oldName && !oldName.startsWith('Contato +') && !oldName.toLowerCase().startsWith('haven escovaria');
        const isCanBad = !canName || canName.startsWith('Contato +') || canName.toLowerCase().startsWith('haven escovaria');

        if (isOldGood && isCanBad) {
          await client.query(
            `UPDATE public.contacts SET name = $1, updated_at = NOW() WHERE id = $2`,
            [oldName, canContact.id]
          );
        }

        // 4. Delete old duplicate contact
        await client.query(`DELETE FROM public.contacts WHERE id = $1`, [oldContact.id]);
        mergedCount++;
      } else {
        // Canonical contact does not exist; simply prefix phone with '+'
        await client.query(
          `UPDATE public.contacts SET phone = $1, updated_at = NOW() WHERE id = $2`,
          [canonicalPhone, oldContact.id]
        );
        updatedPrefixCount++;
      }
    }

    console.log(`✅ Merged ${mergedCount} duplicate contacts, updated prefix on ${updatedPrefixCount} contacts.\n`);

    // -------------------------------------------------------------------------
    // STEP 2: Clear operator business name from customer contacts
    // -------------------------------------------------------------------------
    console.log('🧹 STEP 2: Clearing "Haven Escovaria" operator pushName from customer contacts...');
    const cleanedHaven = await client.query(`
      UPDATE public.contacts
      SET name = NULL, updated_at = NOW()
      WHERE LOWER(name) = 'haven escovaria' OR LOWER(name) LIKE 'haven escovaria%'
    `);
    console.log(`✅ Cleared operator name placeholder from ${cleanedHaven.rowCount} contacts.\n`);

    // -------------------------------------------------------------------------
    // STEP 3: Sync real names from WAHA for all active chats
    // -------------------------------------------------------------------------
    console.log('📡 STEP 3: Synchronizing real contact names from WAHA chats...');

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

        // Update contact name if existing name is missing, placeholder, or differs
        const updateRes = await client.query(
          `UPDATE public.contacts
           SET name = $1, updated_at = NOW()
           WHERE workspace_id = $2
             AND (phone = $3 OR phone = $4)
             AND (name IS NULL OR name = '' OR name LIKE 'Contato +%' OR LOWER(name) LIKE 'haven escovaria%' OR name = phone)`,
          [rawName, workspaceId, canonicalPhone, cleanDigits]
        );

        if (updateRes.rowCount && updateRes.rowCount > 0) {
          totalNamesSynced += updateRes.rowCount;
          console.log(`  ✨ [${session}] Updated ${canonicalPhone} -> "${rawName}"`);
        }
      }
    }

    console.log(`\n✅ STEP 3 COMPLETE: Synchronized ${totalNamesSynced} real contact names from WAHA.`);

    // -------------------------------------------------------------------------
    // STEP 4: Print final verification stats
    // -------------------------------------------------------------------------
    console.log('\n📊 FINAL AUDIT OF RECONCILED CONTACTS:');
    const stats = await client.query(`
      SELECT 
        w.name as workspace,
        COUNT(c.id) as total_contacts,
        COUNT(c.id) FILTER (WHERE c.name IS NOT NULL AND c.name NOT LIKE 'Contato +%') as named_contacts,
        COUNT(c.id) FILTER (WHERE c.name LIKE 'Contato +%' OR c.name IS NULL) as unnamed_contacts
      FROM public.contacts c
      JOIN public.workspaces w ON w.id = c.workspace_id
      GROUP BY w.name
    `);
    console.table(stats.rows);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('❌ Fatal error running reconciliation:', err);
  process.exit(1);
});
