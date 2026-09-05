import { Pool, QueryResult, QueryResultRow } from 'pg';
import dotenv from 'dotenv';

import { validateLabEnvironmentIsolation } from '../security/lab-environment-guard.js';
import { resolveDatabaseSslConfig } from '../runtime/production-runtime-helpers.js';

dotenv.config();
validateLabEnvironmentIsolation();

// Cloud DSN must come from DATABASE_URL (.env / VPS env) or LAB_DATABASE_URL in Lab. Never hardcode credentials here.
const connectionString =
  process.env.LAB_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:55432/postgres';

/**
 * Keep the application pool on exactly the same verified-TLS contract as the
 * production runtime. In particular, a remote database never silently falls
 * back to the system CA store or `DATABASE_SSL=false`: the trusted CA must be
 * supplied inline or through DATABASE_SSL_CA_FILE.
 */
export function getSslConfig(url: string) {
  return resolveDatabaseSslConfig(url);
}

function createPool(): Pool {
  const pool = new Pool({
    connectionString,
    max: 8,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    ssl: getSslConfig(connectionString),
  });

  pool.on('error', (err: any) => {
    console.warn('[PostgreSQL Pool Warning] Handled idle connection event:', err?.message || err);
  });

  return pool;
}

let currentPool = createPool();

// Catch unhandled socket resets from idle connection poolers to prevent Node process termination
process.on('uncaughtException', (err: any) => {
  if (
    err?.message?.includes('Connection terminated unexpectedly') ||
    err?.code === 'ECONNRESET' ||
    err?.code === '57P01'
  ) {
    console.warn('[PostgreSQL Connection Pool] Handled idle socket termination:', err?.message || err);
    return;
  }
  console.error('[FATAL uncaughtException]:', err);
  process.exit(1);
});

export const dbPool = new Proxy({} as Pool, {
  get(_target, prop) {
    if (prop === 'end' && process.env.NODE_ENV === 'test') {
      return async () => {};
    }
    if ((currentPool as any).ended) {
      currentPool = createPool();
    }
    const val = (currentPool as any)[prop];
    return typeof val === 'function' ? val.bind(currentPool) : val;
  },
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  const res = await dbPool.query<T>(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    // console.debug('Executed query', { text, duration, rows: res.rowCount });
  }
  return res;
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const result = await dbPool.query('SELECT 1 as healthy;');
    return result.rows[0]?.healthy === 1;
  } catch (err) {
    console.error('Database health check failed:', err);
    return false;
  }
}
