#!/usr/bin/env node
/**
 * Read-only structural contract gate for the production database.
 *
 * The Supabase migration ledger is intentionally not readable by the
 * application role used by the VPS runtime. This check therefore verifies the
 * public tables/columns/functions that the currently built API actually uses.
 * It never executes a migration and never writes to the database.
 *
 * Usage:
 *   node scripts/verify-production-schema-contract.mjs \
 *     --env-file /opt/sos-sales/.env.production \
 *     --ca-file /opt/sos-sales/releases/<sha>/certs/supabase-ca.crt
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

function option(name, required = true) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) {
    if (required) throw new Error(`Missing required option: ${name}`);
    return undefined;
  }
  return process.argv[index + 1];
}

function parseDotEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    const quote = rawValue.at(0);
    values[key] = (quote === '"' || quote === "'") && rawValue.endsWith(quote)
      ? rawValue.slice(1, -1)
      : rawValue.replace(/\s+#.*$/, '').trim();
  }
  return values;
}

const tables = {
  channel_connections: ['id', 'workspace_id', 'provider', 'status', 'phone_number', 'public_config'],
  commercial_journeys: [
    'id', 'workspace_id', 'contact_id', 'channel_connection_id', 'status',
    'responder_owner', 'responder_changed_at', 'responder_change_reason',
  ],
  conversation_messages: [
    'id', 'workspace_id', 'channel_connection_id', 'journey_id', 'contact_id',
    'direction', 'sender_type', 'provider_message_id', 'text_content',
    'media_payload', 'sent_at',
  ],
  inbound_channel_events: [
    'id', 'workspace_id', 'channel_connection_id', 'provider', 'event_type',
    'raw_payload', 'provider_event_id',
  ],
  outbox_events: [
    'id', 'workspace_id', 'event_name', 'aggregate_type', 'aggregate_id',
    'payload', 'idempotency_key', 'status', 'attempts', 'max_attempts',
    'scheduled_for', 'locked_at', 'locked_by', 'claim_token', 'last_error',
    'published_at',
  ],
  outbound_dispatches: [
    'id', 'workspace_id', 'journey_id', 'contact_id', 'channel_connection_id',
    'text_content', 'status', 'provider_message_id', 'provider_failure_attempts',
    'next_attempt_at',
  ],
  workspace_agent_config: [
    'workspace_id', 'agent_name', 'business_type', 'services_json',
    'working_hours', 'phone', 'city', 'booking_url', 'booking_flow_enabled',
    'extra_context', 'autonomy_mode', 'runtime_enabled', 'responder_mode',
    'behavior_config', 'meta_agent_id', 'meta_agent_enabled',
    'meta_agent_eligibility_status', 'meta_agent_checked_at',
    'meta_agent_activation_status', 'meta_agent_onboarding_started_at',
    'meta_agent_ready_at', 'meta_agent_last_error',
    'meta_agent_channel_connection_id', 'published_at', 'published_by',
  ],
  workspace_intelligence_bundles: [
    'workspace_id', 'bundle', 'schema_version', 'published_at', 'published_by',
    'updated_at',
  ],
  workspace_knowledge_documents: [
    'id', 'workspace_id', 'title', 'category', 'content', 'file_name',
    'file_size', 'chunks_count', 'status', 'created_at', 'updated_at',
  ],
  meta_private_reply_dispatches: [
    'id', 'workspace_id', 'channel_connection_id', 'comment_id', 'comment_text',
    'author_name', 'reply_text', 'status', 'provider_message_id',
    'provider_recipient_id', 'failure_code', 'failure_detail', 'created_at',
    'sent_at', 'updated_at',
  ],
  nlp_extracted_entities: ['message_id'],
  mme_tracking_links: [
    'id', 'workspace_id', 'page_name', 'ref_code', 'full_url', 'label',
    'click_count', 'created_at', 'updated_at',
  ],
  messenger_insights_daily: [
    'id', 'workspace_id', 'channel_connection_id', 'fact_date', 'metric_name',
    'metric_value', 'raw_payload', 'created_at',
  ],
  receptionist_outbound_reservations: [
    'id', 'workspace_id', 'conversation_message_id', 'journey_id', 'contact_id',
    'channel_connection_id', 'provider', 'message_kind', 'reply_fingerprint',
    'reply_text', 'status', 'provider_message_id', 'failure_code', 'attempts',
    'created_at', 'updated_at', 'sent_at',
  ],
};

const requiredColumnTypes = {
  'nlp_extracted_entities.message_id': 'text',
};

// Identity arguments are checked as well as function names so an old overload
// cannot make a stale API call appear healthy.
const functions = {
  claim_outbox_batch_for_events: 'text, text[], integer, integer',
  complete_outbox_event: 'uuid, uuid, text',
  fail_outbox_event: 'uuid, uuid, text, text, integer',
  renew_outbox_lease: 'uuid, uuid, text',
  enqueue_receptionist_inbound: 'uuid, uuid, uuid, uuid, uuid, text, text, text, text, text',
  normalize_waha_inbound_message: 'uuid, text, text, text, text, text, jsonb, timestamp with time zone',
  claim_outbound_dispatch: 'uuid, text, integer',
  record_outbound_provider_acceptance: 'uuid, uuid, text, text',
  record_outbound_provider_failure: 'uuid, uuid, text, text, boolean',
  reserve_receptionist_outbound: 'uuid, uuid, uuid, uuid, uuid, text, text, text, text',
  complete_receptionist_outbound: 'uuid, text, jsonb',
  mark_receptionist_outbound_unknown: 'uuid, text',
};

const indexes = [
  'uq_meta_cloud_phone_number_identifier',
  'uq_journeys_open_per_contact_channel',
  'uq_journeys_open_per_contact_unbound',
  'uq_messages_provider_msg',
  'uq_outbox_workspace_idempotency',
  'uq_receptionist_outbound_message_kind',
];

function normalizeSqlTypes(value) {
  return value
    .toLowerCase()
    .replace(/character varying/g, 'text')
    .replace(/double precision/g, 'double precision')
    .replace(/\s+/g, ' ')
    .trim();
}

const envFile = option('--env-file', false);
const caFile = option('--ca-file', false) || process.env.DATABASE_SSL_CA_FILE;
const environment = {
  ...process.env,
  ...(envFile ? parseDotEnv(await readFile(envFile, 'utf8')) : {}),
};
if (!environment.DATABASE_URL) throw new Error('DATABASE_URL is required.');

const releaseRoot = path.resolve(import.meta.dirname, '..');
const requireFromRelease = createRequire(path.join(releaseRoot, 'api', 'package.json'));
const { Pool } = requireFromRelease('pg');
const ssl = caFile
  ? { rejectUnauthorized: true, ca: await readFile(caFile, 'utf8') }
  : { rejectUnauthorized: true };
const pool = new Pool({
  connectionString: environment.DATABASE_URL,
  ssl,
  max: 1,
  connectionTimeoutMillis: 5000,
});

try {
  const tableNames = Object.keys(tables);
  const columnResult = await pool.query(
    `SELECT table_name, column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [tableNames],
  );
  const actualColumns = new Map(tableNames.map((name) => [name, new Set()]));
  const actualColumnTypes = new Map();
  for (const row of columnResult.rows) {
    actualColumns.get(row.table_name)?.add(row.column_name);
    actualColumnTypes.set(`${row.table_name}.${row.column_name}`, row.data_type);
  }

  const missingColumns = [];
  for (const [table, requiredColumns] of Object.entries(tables)) {
    for (const column of requiredColumns) {
      if (!actualColumns.get(table)?.has(column)) missingColumns.push(`${table}.${column}`);
    }
  }

  const invalidColumnTypes = Object.entries(requiredColumnTypes)
    .filter(([column, expectedType]) => actualColumnTypes.get(column) !== expectedType)
    .map(([column, expectedType]) => `${column} expected ${expectedType}, found ${actualColumnTypes.get(column) || 'missing'}`);

  const functionNames = Object.keys(functions);
  const functionResult = await pool.query(
    `SELECT p.proname AS name,
            COALESCE((
              SELECT string_agg(pg_catalog.format_type(arg_type, NULL), ', ' ORDER BY ordinality)
                FROM unnest(p.proargtypes) WITH ORDINALITY AS args(arg_type, ordinality)
            ), '') AS identity_arguments
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])`,
    [functionNames],
  );
  const actualFunctions = new Map();
  for (const row of functionResult.rows) {
    const key = `${row.name}(${normalizeSqlTypes(row.identity_arguments)})`;
    actualFunctions.set(key, true);
  }
  const missingFunctions = Object.entries(functions)
    .filter(([name, args]) => !actualFunctions.has(`${name}(${normalizeSqlTypes(args)})`))
    .map(([name, args]) => `${name}(${args})`);

  const indexResult = await pool.query(
    `SELECT indexname
       FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = ANY($1::text[])`,
    [indexes],
  );
  const actualIndexes = new Set(indexResult.rows.map((row) => row.indexname));
  const missingIndexes = indexes.filter((index) => !actualIndexes.has(index));

  if (missingColumns.length || invalidColumnTypes.length || missingFunctions.length || missingIndexes.length) {
    const details = [
      missingColumns.length ? `missing columns: ${missingColumns.join(', ')}` : '',
      invalidColumnTypes.length ? `invalid column types: ${invalidColumnTypes.join(', ')}` : '',
      missingFunctions.length ? `missing functions: ${missingFunctions.join(', ')}` : '',
      missingIndexes.length ? `missing indexes: ${missingIndexes.join(', ')}` : '',
    ].filter(Boolean).join('; ');
    throw new Error(`Production schema contract is incomplete; ${details}`);
  }

  console.log(`[schema-contract] verified ${tableNames.length} tables and ${functionNames.length} functions`);
} finally {
  await pool.end();
}
