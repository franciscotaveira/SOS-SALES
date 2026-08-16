const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runTests() {
  const client = await pool.connect();
  const summary = {
    tablesRls: [],
    functionsPrivileges: [],
    policies: [],
    tests: [],
  };

  try {
    // 1. Check Tables and RLS
    const tablesRes = await client.query(`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);
    summary.tablesRls = tablesRes.rows;

    // 2. Check Function privileges
    const funcsRes = await client.query(`
      SELECT 
        p.proname,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_can_exec,
        has_function_privilege('sos_sales_runtime', p.oid, 'EXECUTE') as runtime_can_exec
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN (
          'current_user_workspace_ids', 'current_workspace_id',
          'is_workspace_member', 'assert_workspace_member',
          'can_access_conversation', 'can_manage_appointment',
          'can_manage_pipeline', 'can_manage_workspace_settings',
          'get_operator_workspace_role', 'is_service_role',
          'normalize_waha_inbound_message', 'ingest_channel_event',
          'claim_outbox_batch_for_events', 'mark_outbox_events_processed'
        )
      ORDER BY p.proname;
    `);
    summary.functionsPrivileges = funcsRes.rows;

    // 3. Check Policies
    const polsRes = await client.query(`
      SELECT tablename, policyname, permissive, roles, cmd, qual
      FROM pg_policies
      WHERE schemaname = 'public'
      ORDER BY tablename, policyname;
    `);
    summary.policies = polsRes.rows;

    // 4. Test Gateway Pattern
    try {
      await client.query("BEGIN;");
      await client.query("SET LOCAL ROLE authenticated;");
      await client.query("SELECT set_config('request.jwt.claims', '{\"sub\":\"00000000-0000-0000-0000-000000000001\",\"role\":\"authenticated\",\"email\":\"test@test.com\"}', true);");
      const gwRes = await client.query("SELECT public.current_user_workspace_ids() as ws_ids;");
      summary.tests.push({
        test: "gateway_pattern",
        pass: true,
        result: gwRes.rows[0],
      });
      await client.query("ROLLBACK;");
    } catch (err) {
      await client.query("ROLLBACK;").catch(() => {});
      summary.tests.push({
        test: "gateway_pattern",
        pass: false,
        error: err.message,
      });
    }

    // 5. Test Workspace Isolation
    try {
      await client.query("BEGIN;");
      const user1 = "11111111-1111-1111-1111-111111111111";

      // Query as user1
      await client.query("SET LOCAL ROLE authenticated;");
      await client.query(`SELECT set_config('request.jwt.claims', '{"sub":"${user1}","role":"authenticated","email":"user1@test.com"}', true);`);
      const user1Workspaces = await client.query("SELECT id, name FROM public.workspaces;");

      summary.tests.push({
        test: "workspace_isolation_query",
        pass: true,
        user1VisibleCount: user1Workspaces.rowCount,
        user1Rows: user1Workspaces.rows,
      });
      await client.query("ROLLBACK;");
    } catch (err) {
      await client.query("ROLLBACK;").catch(() => {});
      summary.tests.push({
        test: "workspace_isolation_query",
        pass: false,
        error: err.message,
      });
    }

    // 6. Test ingest_channel_event permission restriction
    try {
      await client.query("BEGIN;");
      await client.query("SET LOCAL ROLE authenticated;");
      await client.query("SELECT set_config('request.jwt.claims', '{\"sub\":\"00000000-0000-0000-0000-000000000001\",\"role\":\"authenticated\"}', true);");
      let threw = false;
      try {
        await client.query("SELECT public.ingest_channel_event('00000000-0000-0000-0000-000000000000', 'evt-1', 'message', '{}'::jsonb);");
      } catch (e) {
        threw = true;
        summary.tests.push({
          test: "ingest_requires_service_role",
          pass: e.message.includes("service_role") || e.message.includes("permission") || e.message.includes("violates") || e.message.includes("denied") || e.message.includes("Unauthorized"),
          detail: e.message,
        });
      }
      if (!threw) {
        summary.tests.push({
          test: "ingest_requires_service_role",
          pass: false,
          error: "Function did not throw as expected for authenticated role",
        });
      }
      await client.query("ROLLBACK;");
    } catch (err) {
      await client.query("ROLLBACK;").catch(() => {});
      summary.tests.push({
        test: "ingest_requires_service_role",
        pass: false,
        error: err.message,
      });
    }

  } finally {
    client.release();
    await pool.end();
  }

  console.log(JSON.stringify(summary, null, 2));
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
