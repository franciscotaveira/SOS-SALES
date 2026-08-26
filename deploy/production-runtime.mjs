import pg from 'pg';
import { Redis } from 'ioredis';

import {
  SupabaseJwtAuthenticator,
  PostgresWorkspaceDirectory,
  PostgresCockpitReadGateway,
  PostgresHandoffOperationsGateway,
  PostgresJourneyOperationsGateway,
  PostgresCommercialOutcomeGateway,
  PostgresOutboundDispatchGateway,
  PostgresTrafficProofGateway,
  PostgresKnownFactOperationsGateway,
  PostgresAppointmentGateway,
  PostgresNotesGateway,
  PostgresInboundIngestionGateway,
  PostgresOutboxProcessingGateway,
  EnvironmentWebhookSecretProvider,
  PostgresDependencyHealthProvider,
  RedisDependencyHealthProvider,
  WahaLidIdentityResolver,
  WahaWebhookAdapter,
  PostgresWorkspaceProvisioningGateway,
} from './dist/index.js';

const { Pool } = pg;

export async function createProductionRuntime() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Production runtime error: DATABASE_URL is required.');
  }

  const redisUrl = process.env.REDIS_URL || 'redis://sos-sales-redis:6379';
  const jwtIssuer = process.env.SUPABASE_JWT_ISSUER || 'https://yiiuebhyqixzluguxsqi.supabase.co/auth/v1';
  const jwksUrl = process.env.SUPABASE_JWKS_URL || 'https://yiiuebhyqixzluguxsqi.supabase.co/auth/v1/.well-known/jwks.json';
  const jwtAudience = process.env.SUPABASE_JWT_AUDIENCE || 'authenticated';

  const isLocalDb = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1') || databaseUrl.includes('postgres-lab') || databaseUrl.includes('host.docker.internal') || process.env.DATABASE_SSL === 'false';
  const sslConfig = isLocalDb ? false : (process.env.DATABASE_SSL_CA ? { rejectUnauthorized: true, ca: process.env.DATABASE_SSL_CA } : { rejectUnauthorized: true });

  let poolConfig;
  try {
    const u = new URL(databaseUrl);
    poolConfig = {
      host: u.hostname,
      port: Number(u.port) || 5432,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, '') || 'postgres',
      ssl: sslConfig,
      max: Number(process.env.DATABASE_POOL_MAX || 20),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };
  } catch {
    poolConfig = {
      connectionString: databaseUrl,
      ssl: sslConfig,
      max: Number(process.env.DATABASE_POOL_MAX || 20),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };
  }

  const pool = new Pool(poolConfig);

  const redis = new Redis(redisUrl, {
    connectTimeout: 5000,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
  });

  const databaseHealth = new PostgresDependencyHealthProvider(pool);
  const redisHealth = new RedisDependencyHealthProvider(redis);

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
  const appointmentGateway = new PostgresAppointmentGateway(pool);
  const notesGateway = new PostgresNotesGateway(pool);
  const workspaceProvisioningGateway = new PostgresWorkspaceProvisioningGateway(pool);
  const ingestionGateway = new PostgresInboundIngestionGateway(pool);
  const outboxGateway = new PostgresOutboxProcessingGateway(pool);
  const secretProvider = {
    getWebhookSecret: async (channelConnectionId) => {
      const envKey = `WAHA_WEBHOOK_SECRET_${channelConnectionId.replace(/-/g, '_')}`;
      const specific = process.env[envKey]?.trim();
      if (!specific) {
        throw new Error(`Missing channel-specific WAHA webhook secret: ${envKey}`);
      }
      return specific;
    },
  };
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
    appointmentGateway,
    notesGateway,
    workspaceProvisioningGateway,
    trustProxy: true,
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
