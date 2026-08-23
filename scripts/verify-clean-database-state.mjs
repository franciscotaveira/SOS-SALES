import pg from '../apps/api/node_modules/pg/lib/index.js';
import { validateSafeLocalDatabaseTarget } from '../apps/api/scripts/cleanup-test-fixtures.mjs';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:55432/postgres';

validateSafeLocalDatabaseTarget(connectionString);

async function verifyCleanDatabase() {
  console.log('=== VERIFYING CLEAN DATABASE RESIDUALS ===\n');
  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  const expected = {
    workspaces: 1,
    workspace_memberships: 1,
    channel_connections: 1,
    contacts: 1,
    commercial_journeys: 1,
    conversation_messages: 1,
    outbox_events: 1,
  };

  let allPass = true;

  try {
    for (const [table, expectedCount] of Object.entries(expected)) {
      const res = await client.query(`SELECT count(*)::int as count FROM public.${table};`);
      const count = res.rows[0].count;
      const pass = count === expectedCount;
      if (pass) {
        console.log(`   ✅ ${table.padEnd(24)}: ${count} (expected ${expectedCount})`);
      } else {
        console.error(`   ❌ ${table.padEnd(24)}: ${count} (expected ${expectedCount}) — RESIDUALS DETECTED!`);
        allPass = false;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }

  if (allPass) {
    console.log('\n🎯 ZERO RESIDUALS: Database contains exact pristine seed counts!');
  } else {
    console.error('\n❌ DATABASE RESIDUALS DETECTED!');
    process.exit(1);
  }
}

verifyCleanDatabase().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
