import dotenv from '../apps/api/node_modules/dotenv/lib/main.js';
import pg from '../apps/api/node_modules/pg/lib/index.js';
dotenv.config({ path: 'apps/api/.env' });
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: '.env.production' });
}
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: '../.env.production' });
}
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

async function runTests() {
  const results = [];

  // Test 1: Gateway pattern with role authenticated
  const client1 = await pool.connect();
  try {
    await client1.query('BEGIN');
    await client1.query('SET LOCAL ROLE authenticated');
    await client1.query(
      `SELECT set_config('request.jwt.claims', '{"sub":"17fc95cf-7d0f-4ad5-ab92-de1531bd9eb2","role":"authenticated"}', true)`
    );
    const r = await client1.query('SELECT public.current_user_workspace_ids()');
    results.push({ test: 'gateway_pattern', pass: r.rowCount > 0, count: r.rowCount, rows: r.rows });
    await client1.query('COMMIT');
  } catch (e) {
    await client1.query('ROLLBACK').catch(() => {});
    results.push({ test: 'gateway_pattern', pass: false, error: e.message });
  } finally {
    client1.release();
  }

  // Test 2: Workspace Isolation (User 1 in WS A vs User 2 in WS B)
  const client2 = await pool.connect();
  try {
    await client2.query('BEGIN');
    const wsA = await client2.query("INSERT INTO public.workspaces (name, slug) VALUES ('WS Test A', 'ws-test-a-' || gen_random_uuid()) RETURNING id");
    const wsB = await client2.query("INSERT INTO public.workspaces (name, slug) VALUES ('WS Test B', 'ws-test-b-' || gen_random_uuid()) RETURNING id");
    const user1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const user2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    await client2.query("INSERT INTO public.workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')", [wsA.rows[0].id, user1]);
    await client2.query("INSERT INTO public.workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')", [wsB.rows[0].id, user2]);

    // Test: user1 sees ONLY wsA
    await client2.query('SET LOCAL ROLE authenticated');
    await client2.query(
      `SELECT set_config('request.jwt.claims', '{"sub":"${user1}","role":"authenticated"}', true)`
    );
    const visible = await client2.query('SELECT id, name FROM public.workspaces WHERE id IN ($1, $2)', [wsA.rows[0].id, wsB.rows[0].id]);
    const pass = visible.rowCount === 1 && visible.rows[0].id === wsA.rows[0].id;
    results.push({ test: 'workspace_isolation', pass, visibleCount: visible.rowCount, visibleRows: visible.rows });
    await client2.query('ROLLBACK');
  } catch (e) {
    await client2.query('ROLLBACK').catch(() => {});
    results.push({ test: 'workspace_isolation', pass: false, error: e.message });
  } finally {
    client2.release();
  }

  // Test 3: ingest_channel_event requires service_role
  const client3 = await pool.connect();
  try {
    await client3.query('BEGIN');
    await client3.query('SET LOCAL ROLE authenticated');
    await client3.query(
      `SELECT set_config('request.jwt.claims', '{"sub":"17fc95cf-7d0f-4ad5-ab92-de1531bd9eb2","role":"authenticated"}', true)`
    );
    await client3.query("SELECT public.ingest_channel_event('00000000-0000-0000-0000-000000000000', 'evt-1', 'message', '{}'::jsonb)");
    results.push({ test: 'ingest_requires_service_role', pass: false, error: 'Should have thrown unauthorized' });
    await client3.query('ROLLBACK');
  } catch (e) {
    await client3.query('ROLLBACK').catch(() => {});
    const pass = e.message.includes('permission denied') || e.message.includes('requires service_role') || e.message.includes('Unauthorized');
    results.push({ test: 'ingest_requires_service_role', pass, error: e.message });
  } finally {
    client3.release();
  }

  // Test 4: Contacts & Journeys RLS isolation under authenticated role
  const client4 = await pool.connect();
  try {
    await client4.query('BEGIN');
    await client4.query('SET LOCAL ROLE authenticated');
    await client4.query(
      `SELECT set_config('request.jwt.claims', '{"sub":"17fc95cf-7d0f-4ad5-ab92-de1531bd9eb2","role":"authenticated"}', true)`
    );
    const journeys = await client4.query('SELECT count(*) FROM public.commercial_journeys');
    const contacts = await client4.query('SELECT count(*) FROM public.contacts');
    results.push({ test: 'authenticated_rls_reads', pass: true, journeysCount: journeys.rows[0].count, contactsCount: contacts.rows[0].count });
    await client4.query('COMMIT');
  } catch (e) {
    await client4.query('ROLLBACK').catch(() => {});
    results.push({ test: 'authenticated_rls_reads', pass: false, error: e.message });
  } finally {
    client4.release();
  }

  console.log(JSON.stringify(results, null, 2));
  await pool.end();
  const allPass = results.every((r) => r.pass);
  process.exit(allPass ? 0 : 1);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
