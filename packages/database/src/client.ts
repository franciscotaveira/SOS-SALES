import { Pool, type PoolClient } from "pg";
import { logger } from "@sos-sales/observability";

let appPool: Pool | null = null;
let ingressPool: Pool | null = null;
let workerPool: Pool | null = null;

export interface PoolConfigOptions {
  connectionString?: string;
  max?: number;
}

/**
 * Standard tenant application pool (sos_app_user, bound by FORCE RLS).
 */
export function getDatabasePool(options?: PoolConfigOptions): Pool {
  if (!appPool) {
    const connectionString =
      options?.connectionString ||
      process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is required");
    }

    appPool = new Pool({
      connectionString,
      max: options?.max || 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    appPool.on("error", (err) => {
      logger.error({ err }, "Unexpected error on idle app PostgreSQL client");
    });
  }

  return appPool;
}

/**
 * High-concurrency Ingress pool (sos_ingress_user, least-privilege for webhooks).
 */
export function getIngressDatabasePool(options?: PoolConfigOptions): Pool {
  if (!ingressPool) {
    const connectionString =
      options?.connectionString ||
      process.env.INGRESS_DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "FATAL_CONFIG_ERROR: INGRESS_DATABASE_URL environment variable is required for Ingress pool (no silent fallback to DATABASE_URL)"
      );
    }

    ingressPool = new Pool({
      connectionString,
      max: options?.max || 30,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 3000,
    });

    ingressPool.on("error", (err) => {
      logger.error({ err }, "Unexpected error on idle ingress PostgreSQL client");
    });
  }

  return ingressPool;
}

/**
 * Dedicated Background Worker pool (sos_worker_user for inbox/outbox processing).
 */
export function getWorkerDatabasePool(options?: PoolConfigOptions): Pool {
  if (!workerPool) {
    const connectionString =
      options?.connectionString ||
      process.env.WORKER_DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "FATAL_CONFIG_ERROR: WORKER_DATABASE_URL environment variable is required for Worker pool (no silent fallback to DATABASE_URL)"
      );
    }

    workerPool = new Pool({
      connectionString,
      max: options?.max || 15,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    workerPool.on("error", (err) => {
      logger.error({ err }, "Unexpected error on idle worker PostgreSQL client");
    });
  }

  return workerPool;
}

/**
 * Gracefully close all active pools (useful for tests and shutdown hooks).
 */
export async function closeAllDatabasePools(): Promise<void> {
  const closers: Promise<void>[] = [];
  if (appPool) {
    closers.push(appPool.end());
    appPool = null;
  }
  if (ingressPool) {
    closers.push(ingressPool.end());
    ingressPool = null;
  }
  if (workerPool) {
    closers.push(workerPool.end());
    workerPool = null;
  }
  await Promise.all(closers);
}

/**
 * Executes a database query within a tenant-scoped session (RLS enforcement).
 */
export async function withTenantTransaction<T>(
  workspaceId: string,
  callback: (client: PoolClient) => Promise<T>,
  pool?: Pool
): Promise<T> {
  const p = pool || getDatabasePool();
  const client = await p.connect();

  try {
    await client.query("BEGIN");
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
 * Executes an Ingress operation under sos_ingress_user role with tenant isolation.
 */
export async function withIngressTransaction<T>(
  workspaceId: string,
  callback: (client: PoolClient) => Promise<T>,
  pool?: Pool
): Promise<T> {
  const p = pool || getIngressDatabasePool();
  const client = await p.connect();

  try {
    await client.query("BEGIN");
    // Ensure sos_ingress_user role is assumed - NEVER swallow SET ROLE errors!
    await client.query("SET ROLE sos_ingress_user");
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);

    const result = await callback(client);

    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    try {
      await client.query("RESET ROLE");
    } finally {
      client.release();
    }
  }
}

/**
 * Executes a Worker operation under sos_worker_user role with tenant isolation.
 */
export async function withWorkerTransaction<T>(
  workspaceId: string,
  callback: (client: PoolClient) => Promise<T>,
  pool?: Pool
): Promise<T> {
  const p = pool || getWorkerDatabasePool();
  const client = await p.connect();

  try {
    await client.query("BEGIN");
    // Ensure sos_worker_user role is assumed - NEVER swallow SET ROLE errors!
    await client.query("SET ROLE sos_worker_user");
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);

    const result = await callback(client);

    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    try {
      await client.query("RESET ROLE");
    } finally {
      client.release();
    }
  }
}

export interface IngressLookupResult {
  channelInstanceId: string;
  workspaceId: string;
  provider: string;
  isActive: boolean;
}

/**
 * Securely looks up a channel instance from an incoming webhook endpoint token hash.
 * Executes the security-definer function `lookup_channel_ingress` under sos_ingress_user.
 */
export async function lookupChannelIngress(
  tokenHash: string,
  pool?: Pool
): Promise<IngressLookupResult | null> {
  const p = pool || getIngressDatabasePool();
  const client = await p.connect();

  try {
    // Explicit SET ROLE - fails fast if role is forbidden or missing
    await client.query("SET ROLE sos_ingress_user");

    const res = await client.query(
      "SELECT channel_instance_id, workspace_id, provider, is_active FROM public.lookup_channel_ingress($1)",
      [tokenHash]
    );

    if (res.rows.length === 0) {
      return null;
    }

    const row = res.rows[0];
    return {
      channelInstanceId: row.channel_instance_id,
      workspaceId: row.workspace_id,
      provider: row.provider,
      isActive: row.is_active,
    };
  } finally {
    try {
      await client.query("RESET ROLE");
    } finally {
      client.release();
    }
  }
}

export interface SigningCredentialResult {
  encryptedPayload: string | null;
  payloadIv: string | null;
  payloadAuthTag: string | null;
  verifyTokenHash: string | null;
}

/**
 * Securely resolves channel signing credentials under sos_ingress_user.
 * Executes the security-definer function `resolve_channel_signing_credential`.
 */
export async function resolveChannelSigningCredential(
  channelInstanceId: string,
  workspaceId: string,
  pool?: Pool
): Promise<SigningCredentialResult | null> {
  const p = pool || getIngressDatabasePool();
  const client = await p.connect();

  try {
    await client.query("SET ROLE sos_ingress_user");

    const res = await client.query(
      "SELECT encrypted_payload, payload_iv, payload_auth_tag, verify_token_hash FROM public.resolve_channel_signing_credential($1, $2)",
      [channelInstanceId, workspaceId]
    );

    if (res.rows.length === 0) {
      return null;
    }

    const row = res.rows[0];
    return {
      encryptedPayload: row.encrypted_payload || null,
      payloadIv: row.payload_iv || null,
      payloadAuthTag: row.payload_auth_tag || null,
      verifyTokenHash: row.verify_token_hash || null,
    };
  } finally {
    try {
      await client.query("RESET ROLE");
    } finally {
      client.release();
    }
  }
}

/**
 * Health check ping for database readiness.
 */
export async function checkDatabaseHealth(pool?: Pool): Promise<{ healthy: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    const p = pool || getDatabasePool();
    await p.query("SELECT 1");
    return { healthy: true, latencyMs: Date.now() - start };
  } catch (error) {
    logger.error({ error }, "Database health check failed");
    return { healthy: false, latencyMs: Date.now() - start };
  }
}
