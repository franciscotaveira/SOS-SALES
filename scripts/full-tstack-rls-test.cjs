const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runFullTestSuite() {
  const client = await pool.connect();
  const results = [];

  try {
    const user1 = '11111111-1111-1111-1111-111111111111';
    const user2 = '22222222-2222-2222-2222-222222222222';

    // Test 1: Gateway pattern com role authenticated
    try {
      await client.query("BEGIN;");
      const ws = await client.query("INSERT INTO public.workspaces (name, slug) VALUES ('Test WS Gateway', 'test-ws-gateway') RETURNING id;");
      await client.query("INSERT INTO public.workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner');", [ws.rows[0].id, user1]);

      await client.query("SET LOCAL ROLE authenticated;");
      await client.query(`SELECT set_config('request.jwt.claims', '{"sub":"${user1}","role":"authenticated"}', true);`);
      const r = await client.query('SELECT public.current_user_workspace_ids() as ws_ids;');
      await client.query("ROLLBACK;");

      const wsIds = r.rows.map(row => row.ws_ids);
      const pass = wsIds.includes(ws.rows[0].id);
      results.push({
        test: 'gateway_pattern',
        pass,
        detail: { returnedWorkspaces: wsIds, createdWorkspace: ws.rows[0].id }
      });
    } catch (e) {
      await client.query("ROLLBACK;").catch(() => {});
      results.push({ test: 'gateway_pattern', pass: false, error: e.message });
    }

    // Test 2: Isolamento workspace A vs B
    try {
      await client.query("BEGIN;");
      // Setup: criar 2 workspaces + memberships
      const wsA = await client.query("INSERT INTO public.workspaces (name, slug) VALUES ('Test WS A - RLS Test', 'test-ws-a-rls') RETURNING id;");
      const wsB = await client.query("INSERT INTO public.workspaces (name, slug) VALUES ('Test WS B - RLS Test', 'test-ws-b-rls') RETURNING id;");
      
      await client.query("INSERT INTO public.workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner');", [wsA.rows[0].id, user1]);
      await client.query("INSERT INTO public.workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner');", [wsB.rows[0].id, user2]);

      // Test: user1 só vê wsA
      await client.query("SET LOCAL ROLE authenticated;");
      await client.query(`SELECT set_config('request.jwt.claims', '{"sub":"${user1}","role":"authenticated"}', true);`);
      const visible = await client.query('SELECT id, name FROM public.workspaces;');
      
      const seesA = visible.rows.some(w => w.id === wsA.rows[0].id);
      const seesB = visible.rows.some(w => w.id === wsB.rows[0].id);
      const pass = seesA && !seesB;

      results.push({
        test: 'workspace_isolation',
        pass,
        detail: {
          seesOwnedWorkspaceA: seesA,
          doesNotSeeForeignWorkspaceB: !seesB,
          totalVisibleCount: visible.rowCount
        }
      });
      await client.query("ROLLBACK;");
    } catch (e) {
      await client.query("ROLLBACK;").catch(() => {});
      results.push({ test: 'workspace_isolation', pass: false, error: e.message });
    }

    // Test 3: ingest_channel_event requer service_role (deve rejeitar role authenticated)
    try {
      await client.query("BEGIN;");
      await client.query("SET LOCAL ROLE authenticated;");
      await client.query(`SELECT set_config('request.jwt.claims', '{"sub":"${user1}","role":"authenticated"}', true);`);
      let threw = false;
      try {
        await client.query("SELECT public.ingest_channel_event('00000000-0000-0000-0000-000000000000', 'evt-1', 'message', '{}'::jsonb);");
      } catch (e) {
        threw = true;
        results.push({
          test: 'ingest_requires_service_role',
          pass: true,
          errorExpected: e.message
        });
      }
      if (!threw) {
        results.push({ test: 'ingest_requires_service_role', pass: false, error: 'Should have thrown permission error' });
      }
      await client.query("ROLLBACK;");
    } catch (e) {
      await client.query("ROLLBACK;").catch(() => {});
      results.push({ test: 'ingest_requires_service_role', pass: false, error: e.message });
    }

    // Test 4: normalize_waha_inbound_message requer service_role (deve rejeitar role authenticated)
    try {
      await client.query("BEGIN;");
      await client.query("SET LOCAL ROLE authenticated;");
      await client.query(`SELECT set_config('request.jwt.claims', '{"sub":"${user1}","role":"authenticated"}', true);`);
      let threw = false;
      try {
        await client.query("SELECT * FROM public.normalize_waha_inbound_message(gen_random_uuid(), '+5549999999999', '5549999999999@c.us', 'Test', 'msg_01', 'Oi', NULL, NOW());");
      } catch (e) {
        threw = true;
        results.push({
          test: 'normalize_requires_service_role',
          pass: true,
          errorExpected: e.message
        });
      }
      if (!threw) {
        results.push({ test: 'normalize_requires_service_role', pass: false, error: 'Should have thrown permission error' });
      }
      await client.query("ROLLBACK;");
    } catch (e) {
      await client.query("ROLLBACK;").catch(() => {});
      results.push({ test: 'normalize_requires_service_role', pass: false, error: e.message });
    }

    console.log(JSON.stringify(results, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

runFullTestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
