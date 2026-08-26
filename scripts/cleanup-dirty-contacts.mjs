import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('[FATAL] DATABASE_URL environment variable is mandatory.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

async function run() {
  const dirty = await pool.query(`
    SELECT id, phone, name 
    FROM contacts 
    WHERE phone = 'status' 
       OR phone ILIKE '%status%' 
       OR phone ILIKE '%@g.us%' 
       OR phone ILIKE '%broadcast%'
       OR whatsapp_id ILIKE '%status%'
       OR whatsapp_id ILIKE '%@g.us%'
       OR whatsapp_id ILIKE '%broadcast%'
       OR phone LIKE '120363%';
  `);

  console.log(`Found ${dirty.rows.length} dirty contacts to remove.`);

  for (const c of dirty.rows) {
    console.log(`Deleting: ${c.name} (${c.phone})...`);
    await pool.query(`DELETE FROM conversation_messages WHERE contact_id = $1`, [c.id]);
    await pool.query(`DELETE FROM known_facts WHERE journey_id IN (SELECT id FROM commercial_journeys WHERE contact_id = $1)`, [c.id]);
    await pool.query(`DELETE FROM commercial_appointments WHERE journey_id IN (SELECT id FROM commercial_journeys WHERE contact_id = $1)`, [c.id]);
    await pool.query(`DELETE FROM commercial_journeys WHERE contact_id = $1`, [c.id]);
    await pool.query(`DELETE FROM contacts WHERE id = $1`, [c.id]);
  }

  console.log('✅ Cleanup finished successfully!');
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
