import { dbPool } from '../src/infrastructure/database/pool.js';

async function waitForDatabase(timeoutMs = 30000, intervalMs = 500): Promise<boolean> {
  const startTime = Date.now();
  console.log('⏳ Waiting for PostgreSQL schema and current application migrations to become ready...');

  while (Date.now() - startTime < timeoutMs) {
    let client: import('pg').PoolClient | null = null;
    try {
      client = await dbPool.connect();
      const res = await client.query<{ ws: string | null; rpc: string | null; trafficProof: string | null }>(`
        SELECT
          to_regclass('public.workspaces')::text AS ws,
          to_regprocedure('public.ingest_channel_event(uuid,text,text,jsonb)')::text AS rpc,
          to_regclass('public.campaign_spend_daily_facts')::text AS "trafficProof"
      `);

      if (res.rows[0]?.ws && res.rows[0]?.rpc && res.rows[0]?.trafficProof) {
        console.log(`✅ Database is ready and migrations are verified (${Date.now() - startTime}ms)`);
        return true;
      }
    } catch {
      // Ignore connection/handshake errors during initial startup
    } finally {
      if (client) {
        client.release();
      }
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  console.error(`❌ Database readiness timeout exceeded (${timeoutMs}ms)`);
  return false;
}

async function main(): Promise<void> {
  const isReady = await waitForDatabase();
  await dbPool.end().catch(() => {});

  if (!isReady) {
    process.exitCode = 1;
  }
}

main();
