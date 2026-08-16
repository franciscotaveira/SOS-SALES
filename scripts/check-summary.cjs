const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const client = await pool.connect();
  try {
    const funcs = await client.query(`
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
    console.log('=== FUNCTIONS PRIVILEGES ===');
    console.table(funcs.rows);

    const tables = await client.query(`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);
    console.log('=== TABLES & RLS ===');
    console.table(tables.rows);
  } finally {
    client.release();
    await pool.end();
  }
}
run();
