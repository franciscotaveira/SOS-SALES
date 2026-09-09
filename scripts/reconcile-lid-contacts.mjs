/**
 * RECONCILE LID CONTACTS (MCT OS v2.0)
 *
 * Resolves WAHA Linked-Device IDs (@lid) to canonical E.164 phone numbers,
 * merges duplicate contacts and open journeys into single conversations,
 * and consolidates all message histories in the Cockpit.
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

const SESSIONS = {
  '22222222-2222-2222-2222-222222222222': 'haven',
  '11111111-1111-1111-1111-111111111111': 'default',
};

function fetchWaha(path) {
  return new Promise((resolve) => {
    const url = new URL(path, WAHA_BASE);
    const req = http.get(url, { headers: { 'x-api-key': WAHA_KEY }, timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function run() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    console.log('🚀 [RECONCILE LID CONTACTS] Starting resolution & consolidation...\n');

    // 1. Fetch all LID-like contacts
    const lidContacts = await client.query(`
      SELECT id, workspace_id, name, phone, whatsapp_id, created_at
      FROM public.contacts
      WHERE whatsapp_id LIKE '%@lid'
         OR phone ~ '^[0-9]{13,20}$'
         OR phone ~ '^\\+[0-9]{13,20}$'
      ORDER BY created_at ASC
    `);

    console.log(`Found ${lidContacts.rows.length} LID-like contacts to evaluate.\n`);

    let mergedIntoExisting = 0;
    let convertedToCanonical = 0;
    let ghostCleaned = 0;
    let unresolvedWithMessages = 0;

    for (const c of lidContacts.rows) {
      const session = SESSIONS[c.workspace_id] || 'default';
      const lidNum = c.phone.replace(/\D/g, '');
      let canonicalPhone = null;
      let resolutionSource = null;

      // Method A: WAHA LID endpoint
      const lidRes = await fetchWaha(`/api/${session}/lids/${lidNum}`);
      if (lidRes && typeof lidRes.pn === 'string' && lidRes.pn.includes('@c.us')) {
        const digits = lidRes.pn.split('@')[0].replace(/\D/g, '');
        if (digits.length >= 8 && digits.length <= 15) {
          canonicalPhone = `+${digits}`;
          resolutionSource = 'WAHA_LID_API';
        }
      }

      // Method B: Fallback - Contact Name is a formatted phone number
      if (!canonicalPhone && c.name) {
        const trimmed = c.name.trim();
        const digits = trimmed.replace(/\D/g, '');
        if ((trimmed.startsWith('+') || trimmed.startsWith('55') || trimmed.startsWith('(')) && digits.length >= 10 && digits.length <= 15) {
          canonicalPhone = `+${digits}`;
          resolutionSource = 'NAME_AS_PHONE';
        }
      }

      // Method C: Fallback - Exact matching human name in same workspace with real + phone
      if (!canonicalPhone && c.name) {
        const trimmed = c.name.trim();
        if (
          trimmed.length >= 3 &&
          !trimmed.startsWith('Contato +') &&
          !trimmed.toLowerCase().startsWith('haven escovaria') &&
          trimmed !== '.' &&
          trimmed !== 'Usuário desconhecido'
        ) {
          const match = await client.query(
            `SELECT phone FROM public.contacts
             WHERE workspace_id = $1 AND name = $2 AND phone LIKE '+%' AND phone !~ '^[0-9]{13,20}$' AND id != $3
             LIMIT 1`,
            [c.workspace_id, trimmed, c.id]
          );
          if (match.rows.length > 0) {
            canonicalPhone = match.rows[0].phone;
            resolutionSource = `SAME_NAME ("${trimmed}")`;
          }
        }
      }

      // Check message count for this contact
      const msgCountRes = await client.query(
        `SELECT count(id) as count FROM public.conversation_messages WHERE contact_id = $1`,
        [c.id]
      );
      const msgCount = parseInt(msgCountRes.rows[0].count, 10);

      // Handle unresolvable LID contacts
      if (!canonicalPhone) {
        if (msgCount === 0) {
          // Ghost contact with no messages: delete journeys and contact
          await client.query('BEGIN');
          try {
            await client.query("SET LOCAL sales_os.allow_redaction = 'true'");
            await client.query(`DELETE FROM public.commercial_journeys WHERE contact_id = $1`, [c.id]);
            await client.query(`DELETE FROM public.contacts WHERE id = $1`, [c.id]);
            await client.query('COMMIT');
            ghostCleaned++;
          } catch (e) {
            await client.query('ROLLBACK');
            console.warn(`⚠️ Failed to clean ghost contact ${c.id}:`, e.message);
          }
        } else {
          unresolvedWithMessages++;
          console.log(`ℹ️ Unresolved LID with ${msgCount} msgs: "${c.name || 'Sem nome'}" (phone: ${c.phone})`);
        }
        continue;
      }

      // We have a canonical phone!
      // Check if a canonical contact already exists
      const existingCanonical = await client.query(
        `SELECT id, name, phone FROM public.contacts WHERE workspace_id = $1 AND phone = $2 AND id != $3 LIMIT 1`,
        [c.workspace_id, canonicalPhone, c.id]
      );

      if (existingCanonical.rows.length > 0) {
        // MERGE c INTO existingCanonical
        const target = existingCanonical.rows[0];
        await client.query('BEGIN');
        try {
          await client.query("SET LOCAL sales_os.allow_redaction = 'true'");

          // 1. If target has placeholder name and c has real name, update target name
          const oldName = (c.name || '').trim();
          const targetName = (target.name || '').trim();
          const isOldGood = oldName && !oldName.startsWith('Contato +') && !oldName.toLowerCase().startsWith('haven escovaria') && !oldName.startsWith('+');
          const isTargetBad = !targetName || targetName.startsWith('Contato +') || targetName.toLowerCase().startsWith('haven escovaria');

          if (isOldGood && isTargetBad) {
            await client.query(`UPDATE public.contacts SET name = $1, updated_at = NOW() WHERE id = $2`, [oldName, target.id]);
          }

          // 2. Re-point conversation_messages
          await client.query(`UPDATE public.conversation_messages SET contact_id = $1 WHERE contact_id = $2`, [target.id, c.id]);

          // 3. Find primary open journey for target contact (or any open journey)
          let targetJourneyRes = await client.query(
            `SELECT id FROM public.commercial_journeys WHERE contact_id = $1 AND status = 'OPEN' ORDER BY updated_at DESC LIMIT 1`,
            [target.id]
          );

          let targetJourneyId = targetJourneyRes.rows.length > 0 ? targetJourneyRes.rows[0].id : null;

          // If target has no open journey, reassign c's open journey to target
          const cJourneys = await client.query(
            `SELECT id, status FROM public.commercial_journeys WHERE contact_id = $1`,
            [c.id]
          );

          if (!targetJourneyId && cJourneys.rows.length > 0) {
            const firstJourney = cJourneys.rows[0];
            await client.query(
              `UPDATE public.commercial_journeys SET contact_id = $1, updated_at = NOW() WHERE id = $2`,
              [target.id, firstJourney.id]
            );
            targetJourneyId = firstJourney.id;
          }

          // Move all messages from other journeys to target journey
          for (const cj of cJourneys.rows) {
            if (cj.id !== targetJourneyId) {
              if (targetJourneyId) {
                await client.query(
                  `UPDATE public.conversation_messages SET journey_id = $1 WHERE journey_id = $2`,
                  [targetJourneyId, cj.id]
                );
              }
              // Delete or repoint auxiliary records
              await client.query(`UPDATE public.outbound_dispatches SET journey_id = $1 WHERE journey_id = $2`, [targetJourneyId, cj.id]).catch(() => null);
              await client.query(`UPDATE public.commercial_outcomes SET journey_id = $1 WHERE journey_id = $2`, [targetJourneyId, cj.id]).catch(() => null);
              await client.query(`UPDATE public.handoff_cases SET journey_id = $1 WHERE journey_id = $2`, [targetJourneyId, cj.id]).catch(() => null);
              await client.query(`UPDATE public.commercial_appointments SET journey_id = $1 WHERE journey_id = $2`, [targetJourneyId, cj.id]).catch(() => null);
              await client.query(`DELETE FROM public.commercial_journeys WHERE id = $1`, [cj.id]);
            }
          }

          // Delete the duplicate LID contact
          await client.query(`DELETE FROM public.contacts WHERE id = $1`, [c.id]);

          await client.query('COMMIT');
          mergedIntoExisting++;
          console.log(`  🔗 Merged LID ${c.phone} -> ${canonicalPhone} (${target.name || c.name || 'Sem nome'}) [${resolutionSource}]`);
        } catch (e) {
          await client.query('ROLLBACK');
          console.warn(`  ⚠️ Failed to merge LID ${c.phone}:`, e.message);
        }
      } else {
        // No canonical contact exists: promote this contact to canonical phone!
        await client.query('BEGIN');
        try {
          await client.query("SET LOCAL sales_os.allow_redaction = 'true'");
          const cleanPhoneDigits = canonicalPhone.replace(/\D/g, '');
          await client.query(
            `UPDATE public.contacts
             SET phone = $1,
                 whatsapp_id = $2,
                 updated_at = NOW()
             WHERE id = $3`,
            [canonicalPhone, `${cleanPhoneDigits}@c.us`, c.id]
          );
          await client.query('COMMIT');
          convertedToCanonical++;
          console.log(`  ✨ Promoted LID ${c.phone} -> ${canonicalPhone} (${c.name || 'Sem nome'}) [${resolutionSource}]`);
        } catch (e) {
          await client.query('ROLLBACK');
          console.warn(`  ⚠️ Failed to promote LID ${c.phone}:`, e.message);
        }
      }
    }

    console.log('\n======================================================');
    console.log('🎉 [RECONCILIATION SUMMARY]');
    console.log(`  - Duplicate LID contacts merged into canonical: ${mergedIntoExisting}`);
    console.log(`  - Standalone LID contacts converted to canonical: ${convertedToCanonical}`);
    console.log(`  - Empty ghost contacts removed: ${ghostCleaned}`);
    console.log(`  - Unresolved LIDs with messages remaining: ${unresolvedWithMessages}`);
    console.log('======================================================\n');

    // Final Audit of Open Journeys
    const finalAudit = await client.query(`
      SELECT 
        w.name as workspace_name,
        count(j.id) as total_open_journeys,
        count(DISTINCT c.id) as total_contacts_with_open_journeys,
        count(j.id) FILTER (WHERE c.whatsapp_id LIKE '%@lid' OR c.phone ~ '^[0-9]{13,20}$') as remaining_lid_journeys
      FROM public.commercial_journeys j
      JOIN public.contacts c ON c.id = j.contact_id
      JOIN public.workspaces w ON w.id = j.workspace_id
      WHERE j.status = 'OPEN'
      GROUP BY w.name;
    `);
    console.table(finalAudit.rows);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
