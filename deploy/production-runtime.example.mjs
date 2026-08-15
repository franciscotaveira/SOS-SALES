/**
 * SOS SALES — PRODUCTION COMPOSITION ROOT FACTORY
 *
 * This module is referenced by SOS_SALES_RUNTIME_FACTORY in production.
 * It builds explicit server-only database pools, redis clients, authenticators,
 * health providers and audit-compliant transactional gateways without falling
 * back to dev fixtures or local mocks.
 */

import pg from 'pg';
import { Redis } from 'ioredis';
import { SupabaseJwtAuthenticator } from '../apps/api/dist/supabase-jwt-authenticator-XGSCOJXH.js';
import { PostgresWorkspaceDirectory } from '../apps/api/dist/postgres-workspace-directory-DK7BHQAZ.js';
import { PostgresCockpitReadGateway } from '../apps/api/dist/postgres-cockpit-read-gateway-C35MDXDX.js';
import { PostgresHandoffOperationsGateway } from '../apps/api/dist/postgres-handoff-operations-gateway-AYNWTUZQ.js';
import { PostgresJourneyOperationsGateway } from '../apps/api/dist/postgres-journey-operations-gateway-O3PS76H5.js';
import { PostgresCommercialOutcomeGateway } from '../apps/api/dist/postgres-commercial-outcome-gateway-MNFHVDUP.js';
import { PostgresOutboundDispatchGateway } from '../apps/api/dist/postgres-outbound-dispatch-gateway-PC2VMJTR.js';
import { PostgresTrafficProofGateway } from '../apps/api/dist/postgres-traffic-proof-gateway-GSOEYJMA.js';
import { PostgresKnownFactOperationsGateway } from '../apps/api/dist/postgres-known-fact-operations-gateway-CUQBCOJQ.js';
import { PostgresInboundIngestionGateway } from '../apps/api/dist/postgres-inbound-ingestion-gateway-LJ6RVFOJ.js';
import { PostgresOutboxProcessingGateway } from '../apps/api/dist/postgres-outbox-processing-gateway-J2KQ5VMQ.js';
import { EnvironmentWebhookSecretProvider } from '../apps/api/dist/environment-webhook-secret-provider-5TVRC3OY.js';
import { PostgresDependencyHealthProvider } from '../apps/api/dist/postgres-dependency-health-provider-GHPQCLMT.js';
import { RedisDependencyHealthProvider } from '../apps/api/dist/redis-dependency-health-provider-UKZKMYVT.js';
import { WahaLidIdentityResolver } from '../apps/api/dist/waha-lid-identity-resolver-ZTARQL3U.js';

const { Pool } = pg;

export async function createProductionRuntime() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Production runtime error: DATABASE_URL is required.');
  }

  const redisUrl = process.env.REDIS_URL || 'redis://sos-sales-redis:6379';
  const jwtIssuer = process.env.SUPABASE_JWT_ISSUER;
  const jwksUrl = process.env.SUPABASE_JWKS_URL;
  const jwtAudience = process.env.SUPABASE_JWT_AUDIENCE || 'authenticated';

  if (!jwtIssuer || !jwksUrl) {
    throw new Error('Production runtime error: SUPABASE_JWT_ISSUER and SUPABASE_JWKS_URL are required.');
  }

  // Scoped Production Postgres Pool (Supabase)
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
    max: Number(process.env.DATABASE_POOL_MAX || 20),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  // Production Redis Client
  const redis = new Redis(redisUrl, {
    connectTimeout: 5000,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
  });

  // Health Providers
  const databaseHealth = new PostgresDependencyHealthProvider(pool);
  const redisHealth = new RedisDependencyHealthProvider(redis);

  // Authenticator & Gateways
  const authenticator = new SupabaseJwtAuthenticator({
    issuer: jwtIssuer,
    jwksUrl: jwksUrl,
    audience: jwtAudience,
  });

  const workspaceDirectory = new PostgresWorkspaceDirectory(pool);
  const cockpitReadGateway = new PostgresCockpitReadGateway(pool);
  const handoffOperationsGateway = new PostgresHandoffOperationsGateway(pool);
  const journeyOperationsGateway = new PostgresJourneyOperationsGateway(pool);
  const commercialOutcomeGateway = new PostgresCommercialOutcomeGateway(pool);
  const outboundDispatchGateway = new PostgresOutboundDispatchGateway(pool);
  const trafficProofGateway = new PostgresTrafficProofGateway(pool);
  const knownFactOperationsGateway = new PostgresKnownFactOperationsGateway(pool);
  const ingestionGateway = new PostgresInboundIngestionGateway(pool);
  const outboxGateway = new PostgresOutboxProcessingGateway(pool);
  const secretProvider = new EnvironmentWebhookSecretProvider();

  // WAHA Inbound Adapter
  const { WahaWebhookAdapter } = await import('../apps/api/dist/index.js');
  const wahaAdapter = new WahaWebhookAdapter();

  const wahaBaseUrl = process.env.WAHA_BASE_URL?.trim();
  const wahaApiKey = process.env.WAHA_API_KEY?.trim();
  const lidIdentityResolver = wahaBaseUrl && wahaApiKey
    ? new WahaLidIdentityResolver({ baseUrl: wahaBaseUrl, apiKey: wahaApiKey })
    : undefined;

  return {
    secretProvider,
    wahaAdapter,
    ingestionGateway,
    outboxGateway,
    lidIdentityResolver,
    authenticator,
    workspaceDirectory,
    cockpitReadGateway,
    handoffOperationsGateway,
    journeyOperationsGateway,
    commercialOutcomeGateway,
    outboundDispatchGateway,
    trafficProofGateway,
    knownFactOperationsGateway,
    trustProxy: true, // Operating behind Caddy Reverse Proxy
    logger: true,
    createHealthProvider: (worker) => ({
      checkAll: async () => {
        const [dbStatuses, redisStatuses] = await Promise.all([
          databaseHealth.checkAll(),
          redisHealth.checkAll(),
        ]);
        const dbHealthy = dbStatuses.every((s) => s.healthy);
        const redisHealthy = redisStatuses.every((s) => s.healthy);
        const workerHealthy = worker.isHealthy();

        return [
          { name: 'database', healthy: dbHealthy },
          { name: 'redis', healthy: redisHealthy },
          { name: 'worker', healthy: workerHealthy },
        ];
      },
    }),
    close: async () => {
      await redis.quit().catch(() => redis.disconnect());
      await pool.end();
    },
  };
}

export default { createProductionRuntime };
