import pg from 'pg';

const { Pool } = pg;

const SEED_WORKSPACE_ID = 'a0000000-0000-0000-0000-000000000001';
const EXPECTED_SEED_WORKSPACE_NAME = 'Haven Escovaria';

const PROHIBITED_PRODUCTION_PATTERNS = [
  'yiiuebhyqixzluguxsqi',
  'vkcusycstkgnitwefrfg',
  'iaparavendas.tech',
  'crm.iaparavendas.tech',
  '179.197.72.221',
  'aws-0-ca-central-1.pooler.supabase.com',
  'supabase.co',
  'pooler.supabase.com',
];

const ALLOWED_LOCAL_HOSTS = new Set([
  '127.0.0.1',
  'localhost',
  '::1',
  'supabase_db_sos-sales',
  'postgres-lab',
  'db-lab',
]);

/**
 * Validates that the target connection string points strictly to a local, non-production test instance.
 * Throws immediately if any remote, cloud, or prohibited target is detected (Fail-Closed).
 */
export function validateSafeLocalDatabaseTarget(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('[SECURITY GUARD] Cleanup aborted: connection string must be a non-empty string.');
  }

  const lower = rawUrl.toLowerCase();
  for (const pattern of PROHIBITED_PRODUCTION_PATTERNS) {
    if (lower.includes(pattern)) {
      throw new Error(
        `[SECURITY GUARD] Cleanup aborted: target database URL matches prohibited remote/production pattern "${pattern}".`
      );
    }
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('[SECURITY GUARD] Cleanup aborted: invalid database URL format.');
  }

  if (!ALLOWED_LOCAL_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error(
      `[SECURITY GUARD] Cleanup aborted: host "${parsed.hostname}" is NOT a permitted local test instance.`
    );
  }

  const env = (process.env.APP_ENV || process.env.NODE_ENV || '').toLowerCase();
  if (env === 'production') {
    throw new Error('[SECURITY GUARD] Cleanup aborted: cannot run test fixture teardown in production environment.');
  }
}

/**
 * Performs automated post-test fixture teardown on the local test database.
 * Pre-flight checks guarantee the target is the local seed database before any mutation occurs.
 */
export async function cleanupTestFixtures(overrideConnectionString) {
  const connectionString = overrideConnectionString
    || process.env.TEST_DATABASE_URL
    || process.env.DATABASE_URL
    || 'postgresql://postgres:postgres@127.0.0.1:55432/postgres';

  validateSafeLocalDatabaseTarget(connectionString);

  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Pre-flight check: Target DB MUST match the canonical Haven Escovaria seed fingerprint
    const seedCheck = await client.query(
      'SELECT id, name FROM public.workspaces WHERE id = $1',
      [SEED_WORKSPACE_ID]
    );

    if (seedCheck.rowCount !== 1 || seedCheck.rows[0].name !== EXPECTED_SEED_WORKSPACE_NAME) {
      throw new Error(
        `[SECURITY GUARD] Pre-flight fingerprint failed: Target database does not match local seed state (Expected workspace "${EXPECTED_SEED_WORKSPACE_NAME}", found ${seedCheck.rowCount === 0 ? 'none' : seedCheck.rows[0].name}). Aborting teardown.`
      );
    }

    // Bypass immutability trigger strictly within local transaction
    await client.query("SET LOCAL session_replication_role = 'replica';");

    // Clean child tables of non-seed workspaces
    await client.query('DELETE FROM public.conversation_messages WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.conversation_message_events WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.recommended_actions WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.projection_checkpoints WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.outbox_events WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.acquisition_contexts WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.commercial_appointments WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.operational_notes WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.commercial_outcomes WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.known_facts WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.known_fact_commands WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.known_fact_supersessions WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.handoff_cases WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.handoff_case_events WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.follow_up_tasks WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.decision_events WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.decision_states WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.executed_actions WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.outbound_dispatches WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.outbound_dispatch_events WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.inbound_channel_events WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.campaign_spend_daily_facts WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.mme_tracking_links WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.nlp_extracted_entities WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.compliance_redaction_events WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.channel_operation_controls WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.workspace_operation_controls WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.workspace_sla_policies WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.commercial_journeys WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.contacts WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.channel_connection_secrets WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.channel_connections WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.workspace_memberships WHERE workspace_id != $1', [SEED_WORKSPACE_ID]);
    await client.query('DELETE FROM public.workspaces WHERE id != $1', [SEED_WORKSPACE_ID]);

    // Clean temporary/test rows created in seed workspace during tests
    await client.query("DELETE FROM public.conversation_messages WHERE workspace_id = $1 AND id NOT IN ('c2000000-0000-0000-0000-000000000001')", [SEED_WORKSPACE_ID]);
    await client.query("DELETE FROM public.inbound_channel_events WHERE workspace_id = $1 AND id NOT IN ('c1000000-0000-0000-0000-000000000001')", [SEED_WORKSPACE_ID]);
    await client.query("DELETE FROM public.outbox_events WHERE workspace_id = $1 AND id NOT IN ('f1000000-0000-0000-0000-000000000001')", [SEED_WORKSPACE_ID]);
    await client.query("DELETE FROM public.commercial_journeys WHERE workspace_id = $1 AND id NOT IN ('c0000000-0000-0000-0000-000000000001')", [SEED_WORKSPACE_ID]);
    await client.query("DELETE FROM public.contacts WHERE workspace_id = $1 AND id NOT IN ('b0000000-0000-0000-0000-000000000001')", [SEED_WORKSPACE_ID]);
    await client.query("DELETE FROM public.commercial_appointments WHERE workspace_id = $1", [SEED_WORKSPACE_ID]);
    await client.query("DELETE FROM public.operational_notes WHERE workspace_id = $1", [SEED_WORKSPACE_ID]);
    await client.query("DELETE FROM public.commercial_outcomes WHERE workspace_id = $1", [SEED_WORKSPACE_ID]);
    await client.query("DELETE FROM public.known_facts WHERE workspace_id = $1 AND id NOT IN ('e0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000003')", [SEED_WORKSPACE_ID]);
    await client.query("DELETE FROM public.known_fact_commands WHERE workspace_id = $1", [SEED_WORKSPACE_ID]);
    await client.query("DELETE FROM public.known_fact_supersessions WHERE workspace_id = $1", [SEED_WORKSPACE_ID]);
    await client.query("DELETE FROM public.decision_events WHERE workspace_id = $1 AND id NOT IN ('f0000000-0000-0000-0000-000000000001')", [SEED_WORKSPACE_ID]);
    await client.query("DELETE FROM public.decision_states WHERE workspace_id = $1 AND journey_id NOT IN ('c0000000-0000-0000-0000-000000000001')", [SEED_WORKSPACE_ID]);
    await client.query("DELETE FROM public.handoff_cases WHERE workspace_id = $1", [SEED_WORKSPACE_ID]);
    await client.query("DELETE FROM public.acquisition_contexts WHERE workspace_id = $1 AND id NOT IN ('d0000000-0000-0000-0000-000000000001')", [SEED_WORKSPACE_ID]);
    await client.query("DELETE FROM public.recommended_actions WHERE workspace_id = $1 AND id NOT IN ('00000000-0000-0000-0000-000000000001')", [SEED_WORKSPACE_ID]);
    await client.query("DELETE FROM public.projection_checkpoints WHERE workspace_id = $1 AND journey_id NOT IN ('c0000000-0000-0000-0000-000000000001')", [SEED_WORKSPACE_ID]);

    await client.query('COMMIT');
    console.log('✅ [TEST FIXTURES] Database cleaned up to pristine seed state.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ [TEST FIXTURES] Cleanup failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && (process.argv[1].endsWith('cleanup-test-fixtures.mjs') || process.argv[1].endsWith('cleanup-test-fixtures.js'))) {
  cleanupTestFixtures().catch(() => process.exit(1));
}
