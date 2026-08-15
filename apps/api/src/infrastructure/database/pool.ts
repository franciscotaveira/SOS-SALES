import { Pool, QueryResult, QueryResultRow } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:55432/postgres';

export const dbPool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

dbPool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
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
