import { Pool, type PoolClient } from "pg";
import { logger } from "@sos-sales/observability";

let pool: Pool | null = null;

export function getDatabasePool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is required");
    }

    pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on("error", (err) => {
      logger.error({ err }, "Unexpected error on idle PostgreSQL client");
    });
  }

  return pool;
}

/**
 * Executes a database query within a tenant-scoped session (RLS enforcement).
 */
export async function withTenantTransaction<T>(
  workspaceId: string,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const p = getDatabasePool();
  const client = await p.connect();

  try {
    await client.query("BEGIN");
    // Invariant: Sets local session variable for Row Level Security
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);

    const result = await callback(client);

    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Health check ping for database readiness.
 */
export async function checkDatabaseHealth(): Promise<{ healthy: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    const p = getDatabasePool();
    await p.query("SELECT 1");
    return { healthy: true, latencyMs: Date.now() - start };
  } catch (error) {
    logger.error({ error }, "Database health check failed");
    return { healthy: false, latencyMs: Date.now() - start };
  }
}
