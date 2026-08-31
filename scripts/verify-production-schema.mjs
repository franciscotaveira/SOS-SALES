#!/usr/bin/env node
/**
 * Read-only release gate for Supabase migrations.
 *
 * It deliberately does not execute SQL: applying a migration requires an
 * operator-approved database change. Promotion is refused until the remote
 * schema migration ledger proves that every SQL file bundled in this immutable
 * release has already been applied.
 *
 * Usage on the VPS (normally invoked by promote-production-release.sh):
 *   node scripts/verify-production-schema.mjs --env-file /opt/sos-sales/.env.production \
 *     --migrations-dir /opt/sos-sales/releases/<sha>/api/supabase/migrations
 */
import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

function option(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) {
    throw new Error(`Missing required option: ${name}`);
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
    const value = (quote === '"' || quote === "'") && rawValue.endsWith(quote)
      ? rawValue.slice(1, -1)
      : rawValue.replace(/\s+#.*$/, '').trim();
    values[key] = value;
  }
  return values;
}

function migrationVersion(file) {
  const match = file.match(/^(\d{14})_.+\.sql$/);
  if (!match) throw new Error(`Invalid migration filename: ${file}`);
  return match[1];
}

const envFile = option('--env-file');
const migrationsDir = option('--migrations-dir');
const releaseRoot = path.resolve(migrationsDir, '..', '..', '..');
const requireFromRelease = createRequire(path.join(releaseRoot, 'api', 'package.json'));
const { Pool } = requireFromRelease('pg');

const environment = parseDotEnv(await readFile(envFile, 'utf8'));
if (!environment.DATABASE_URL) {
  throw new Error('DATABASE_URL is required in the supplied env file.');
}

const files = (await readdir(migrationsDir))
  .filter((file) => file.endsWith('.sql'))
  .sort();
if (files.length === 0) {
  throw new Error('No SQL migrations found in the staged release.');
}
const expected = new Set(files.map(migrationVersion));
const caFile = process.env.DATABASE_SSL_CA_FILE;
const ssl = caFile
  ? { rejectUnauthorized: true, ca: await readFile(caFile, 'utf8') }
  : { rejectUnauthorized: true };
const pool = new Pool({ connectionString: environment.DATABASE_URL, ssl, max: 1, connectionTimeoutMillis: 5000 });

try {
  const result = await pool.query('SELECT version::text AS version FROM supabase_migrations.schema_migrations');
  const applied = new Set(result.rows.map((row) => row.version));
  const missing = [...expected].filter((version) => !applied.has(version));
  if (missing.length > 0) {
    throw new Error(`Database migration ledger is missing ${missing.length} release migration(s): ${missing.join(', ')}. Apply them with the approved Supabase migration workflow, then rerun promotion.`);
  }
  console.log(`[schema-gate] verified ${expected.size} staged migration(s) in supabase_migrations.schema_migrations`);
} finally {
  await pool.end();
}
