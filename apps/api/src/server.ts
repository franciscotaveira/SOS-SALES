/**
 * TX COMMERCIAL CORE — SERVER COMPOSITION ROOT
 *
 * Production never falls back to local Postgres, environment secrets, or an
 * administrative role. It receives an explicit set of server-only ports.
 * Development/test adapters are loaded dynamically only after production has
 * been excluded, which keeps the local pool outside the production path.
 */

import dotenv from 'dotenv';
import { buildApp, TrustProxyOption } from './interfaces/http/app.js';
import { WahaWebhookAdapter } from './infrastructure/channels/waha/waha-webhook-adapter.js';
import { WahaInboundWorker } from './infrastructure/workers/waha-inbound-worker.js';
import { WahaOutboundWorker } from './infrastructure/workers/waha-outbound-worker.js';
import { ReceptionistInboundWorker } from './infrastructure/workers/receptionist-inbound-worker.js';
import { getReceptionistAgent } from './application/agents/receptionist-agent.js';
import { WahaOutboundAdapter } from './infrastructure/channels/waha/waha-outbound-adapter.js';
import { WebhookSecretProvider } from './application/ports/webhook-secret-provider.js';
import { ChannelWebhookAdapter } from './application/ports/channel-webhook-adapter.js';
import { InboundIngestionGateway } from './application/ports/inbound-ingestion-gateway.js';
import { OutboxProcessingGateway } from './application/ports/outbox-processing-gateway.js';
import { LidIdentityResolver } from './application/ports/lid-identity-resolver.js';
import { DependencyHealthProvider } from './application/ports/dependency-health-provider.js';
import { OperatorAuthenticator } from './application/ports/operator-authenticator.js';
import { WorkspaceDirectory } from './application/ports/workspace-directory.js';
import { CockpitReadGateway } from './application/ports/cockpit-read-gateway.js';
import { HandoffOperationsGateway } from './application/ports/handoff-operations-gateway.js';
import { JourneyOperationsGateway } from './application/ports/journey-operations-gateway.js';
import { CommercialOutcomeGateway } from './application/ports/commercial-outcome-gateway.js';
import { OutboundDispatchGateway } from './application/ports/outbound-dispatch-gateway.js';
import { TrafficProofGateway } from './application/ports/traffic-proof-gateway.js';
import { KnownFactOperationsGateway } from './application/ports/known-fact-operations-gateway.js';
import { AppointmentGateway } from './application/ports/appointment-gateway.js';
import { NotesGateway } from './application/ports/notes-gateway.js';
import { WorkspaceProvisioningGateway } from './application/ports/workspace-provisioning-gateway.js';
import { WabaChannelInfoGateway } from './application/ports/waba-channel-info-gateway.js';
import { PostgresWorkspaceProvisioningGateway } from './infrastructure/database/postgres-workspace-provisioning-gateway.js';
import { CompositeDependencyHealthProvider } from './infrastructure/health/composite-dependency-health-provider.js';
import { createProductionRuntimeFromEnvironment } from './infrastructure/runtime/production-runtime.js';
import { Redis } from 'ioredis';

import { validateLabEnvironmentIsolation } from './infrastructure/security/lab-environment-guard.js';

dotenv.config();
validateLabEnvironmentIsolation();

export interface RuntimeDependencies {
  secretProvider: WebhookSecretProvider;
  wahaAdapter: ChannelWebhookAdapter;
  ingestionGateway: InboundIngestionGateway;
  outboxGateway: OutboxProcessingGateway;
  /** Optional until a provider's server-only LID resolver is configured. */
  lidIdentityResolver?: LidIdentityResolver;
  /** Created after the worker exists so readiness can always include it. */
  createHealthProvider: (worker: WahaInboundWorker) => DependencyHealthProvider;
  /** Optional only while operator API remains fail-closed (401) during bootstrap. */
  authenticator?: OperatorAuthenticator;
  workspaceDirectory?: WorkspaceDirectory;
  cockpitReadGateway?: CockpitReadGateway;
  handoffOperationsGateway?: HandoffOperationsGateway;
  journeyOperationsGateway?: JourneyOperationsGateway;
  commercialOutcomeGateway?: CommercialOutcomeGateway;
  outboundDispatchGateway?: OutboundDispatchGateway;
  trafficProofGateway?: TrafficProofGateway;
  knownFactOperationsGateway?: KnownFactOperationsGateway;
  appointmentGateway?: AppointmentGateway;
  notesGateway?: NotesGateway;
  workspaceProvisioningGateway?: WorkspaceProvisioningGateway;
  wabaChannelInfoGateway?: WabaChannelInfoGateway;
  trustProxy?: TrustProxyOption;
  logger?: boolean | Record<string, unknown>;
  /** Releases runtime-owned resources after HTTP and worker shutdown. */
  close?: () => Promise<void>;
}

export interface StartServerOptions {
  runtime?: RuntimeDependencies;
  host?: string;
  port?: number;
  installSignalHandlers?: boolean;
}

export interface ServerInstance {
  app: ReturnType<typeof buildApp>;
  worker: WahaInboundWorker;
  stop: () => Promise<void>;
}

export function assertProductionRuntime(runtime: RuntimeDependencies | undefined): asserts runtime is RuntimeDependencies {
  if (!runtime) {
    throw new Error(
      'Production startup blocked: explicit server-only runtime adapters are required.'
    );
  }

  const required: Array<[string, unknown]> = [
    ['WebhookSecretProvider', runtime.secretProvider],
    ['ChannelWebhookAdapter', runtime.wahaAdapter],
    ['InboundIngestionGateway', runtime.ingestionGateway],
    ['OutboxProcessingGateway', runtime.outboxGateway],
    ['Runtime dependency health factory', runtime.createHealthProvider],
  ];
  const missing = required.filter(([, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Production startup blocked: missing required runtime adapters (${missing.join(', ')}).`
    );
  }
}

async function createDevelopmentRuntime(): Promise<RuntimeDependencies> {
  const [
    { EnvironmentWebhookSecretProvider },
    { PostgresInboundIngestionGateway },
    { PostgresOutboxProcessingGateway },
    { PostgresDependencyHealthProvider },
    { RedisDependencyHealthProvider },
    { WahaLidIdentityResolver },
    { SupabaseJwtAuthenticator },
    { PostgresWorkspaceDirectory },
    { PostgresCockpitReadGateway },
    { PostgresHandoffOperationsGateway },
    { PostgresJourneyOperationsGateway },
    { PostgresCommercialOutcomeGateway },
    { PostgresOutboundDispatchGateway },
    { PostgresTrafficProofGateway },
    { PostgresKnownFactOperationsGateway },
    { PostgresAppointmentGateway },
    { PostgresNotesGateway },
    { PostgresWabaChannelInfoGateway },
    { dbPool },
  ] = await Promise.all([
    import('./infrastructure/security/environment-webhook-secret-provider.js'),
    import('./infrastructure/database/postgres-inbound-ingestion-gateway.js'),
    import('./infrastructure/database/postgres-outbox-processing-gateway.js'),
    import('./infrastructure/database/postgres-dependency-health-provider.js'),
    import('./infrastructure/health/redis-dependency-health-provider.js'),
    import('./infrastructure/channels/waha/waha-lid-identity-resolver.js'),
    import('./infrastructure/security/supabase-jwt-authenticator.js'),
    import('./infrastructure/database/postgres-workspace-directory.js'),
    import('./infrastructure/database/postgres-cockpit-read-gateway.js'),
    import('./infrastructure/database/postgres-handoff-operations-gateway.js'),
    import('./infrastructure/database/postgres-journey-operations-gateway.js'),
    import('./infrastructure/database/postgres-commercial-outcome-gateway.js'),
    import('./infrastructure/database/postgres-outbound-dispatch-gateway.js'),
    import('./infrastructure/database/postgres-traffic-proof-gateway.js'),
    import('./infrastructure/database/postgres-known-fact-operations-gateway.js'),
    import('./infrastructure/database/postgres-appointment-gateway.js'),
    import('./infrastructure/database/postgres-notes-gateway.js'),
    import('./infrastructure/database/postgres-waba-channel-info-gateway.js'),
    import('./infrastructure/database/pool.js'),
  ]);

  const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6381', {
    lazyConnect: true,
    connectTimeout: 5_000,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  const databaseHealth = new PostgresDependencyHealthProvider();
  const redisHealth = new RedisDependencyHealthProvider(redis);
  const wahaBaseUrl = process.env.WAHA_BASE_URL?.trim();
  const wahaApiKey = process.env.WAHA_API_KEY?.trim();
  const lidIdentityResolver = wahaBaseUrl && wahaApiKey
    ? new WahaLidIdentityResolver({ baseUrl: wahaBaseUrl, apiKey: wahaApiKey })
    : undefined;
  const jwtIssuer = (process.env.LAB_SUPABASE_JWT_ISSUER || process.env.SUPABASE_JWT_ISSUER)?.trim();
  const jwksUrl = (process.env.LAB_SUPABASE_JWKS_URL || process.env.SUPABASE_JWKS_URL)?.trim();
  if (Boolean(jwtIssuer) !== Boolean(jwksUrl)) {
    throw new Error('SUPABASE_JWT_ISSUER (or LAB_SUPABASE_JWT_ISSUER) and SUPABASE_JWKS_URL (or LAB_SUPABASE_JWKS_URL) must be configured together');
  }
  const authenticator = jwtIssuer && jwksUrl
    ? new SupabaseJwtAuthenticator({
      issuer: jwtIssuer,
      jwksUrl,
      audience: process.env.SUPABASE_JWT_AUDIENCE?.trim() || 'authenticated',
    })
    : undefined;
  const workspaceDirectory = new PostgresWorkspaceDirectory(dbPool);
  const cockpitReadGateway = new PostgresCockpitReadGateway(dbPool);
  const handoffOperationsGateway = new PostgresHandoffOperationsGateway(dbPool);
  const journeyOperationsGateway = new PostgresJourneyOperationsGateway(dbPool);
  const commercialOutcomeGateway = new PostgresCommercialOutcomeGateway(dbPool);
  const outboundDispatchGateway = new PostgresOutboundDispatchGateway(dbPool);
  const trafficProofGateway = new PostgresTrafficProofGateway(dbPool);
  const knownFactOperationsGateway = new PostgresKnownFactOperationsGateway(dbPool);
  const appointmentGateway = new PostgresAppointmentGateway(dbPool);
  const notesGateway = new PostgresNotesGateway(dbPool);

  return {
    secretProvider: new EnvironmentWebhookSecretProvider(),
    wahaAdapter: new WahaWebhookAdapter(),
    ingestionGateway: new PostgresInboundIngestionGateway(),
    outboxGateway: new PostgresOutboxProcessingGateway(),
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
    workspaceProvisioningGateway: new PostgresWorkspaceProvisioningGateway(dbPool),
    wabaChannelInfoGateway: new PostgresWabaChannelInfoGateway(dbPool),
    trustProxy: false,
    logger: {
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
      },
    },
    createHealthProvider: (worker) => new CompositeDependencyHealthProvider([
      { name: 'database', check: async () => (await databaseHealth.checkAll()).every((status) => status.healthy) },
      { name: 'redis', check: async () => (await redisHealth.checkAll()).every((status) => status.healthy) },
      { name: 'worker', check: async () => worker.isHealthy() },
    ]),
    close: async () => {
      await redis.quit().catch(() => redis.disconnect());
      await dbPool.end();
    },
  };
}

export async function startServer(options: StartServerOptions = {}): Promise<ServerInstance> {
  const isProduction = process.env.NODE_ENV === 'production';
  let runtime: RuntimeDependencies;

  if (isProduction) {
    // The normal binary composes its dependencies from the deployment-owned
    // server-only runtime factory. Tests may inject an explicit runtime, but
    // production has no path to the local development pool or env fixture.
    runtime = options.runtime ?? await createProductionRuntimeFromEnvironment();
    assertProductionRuntime(runtime);
  } else if (options.runtime) {
    runtime = options.runtime;
  } else {
    const developmentRuntime = await createDevelopmentRuntime();
    const worker = new WahaInboundWorker({
      adapter: developmentRuntime.wahaAdapter,
      outboxGateway: developmentRuntime.outboxGateway,
      lidIdentityResolver: developmentRuntime.lidIdentityResolver,
    });
    runtime = {
      ...developmentRuntime,
    };
    return startComposedServer(runtime, worker, options);
  }

  const worker = new WahaInboundWorker({
    adapter: runtime.wahaAdapter,
    outboxGateway: runtime.outboxGateway,
    lidIdentityResolver: runtime.lidIdentityResolver,
  });
  return startComposedServer(runtime, worker, options);
}

async function startComposedServer(
  runtime: RuntimeDependencies,
  worker: WahaInboundWorker,
  options: StartServerOptions
): Promise<ServerInstance> {
  const port = options.port ?? Number(process.env.PORT || 4334);
  const host = options.host ?? process.env.HOST ?? '0.0.0.0';

  const isCustomOrTestRuntime = process.env.NODE_ENV === 'test' || Boolean(options.runtime) || Boolean(process.env.SOS_SALES_RUNTIME_FACTORY);
  const metaVerifyToken = process.env.META_VERIFY_TOKEN?.trim() || (isCustomOrTestRuntime ? 'test_verify_token' : '');
  const metaAppSecret = process.env.META_APP_SECRET?.trim() || (isCustomOrTestRuntime ? 'test_app_secret' : '');
  if (!metaVerifyToken || !metaAppSecret) {
    if (process.env.NODE_ENV === 'production' && !isCustomOrTestRuntime) {
      throw new Error(
        'Missing required environment variables META_VERIFY_TOKEN and/or META_APP_SECRET for the WABA webhook.'
      );
    }
  }

  const wabaWebhookConfig = (metaVerifyToken && metaAppSecret) ? {
    verifyToken: metaVerifyToken,
    appSecret: metaAppSecret,
  } : undefined;

  const app = buildApp({
    secretProvider: runtime.secretProvider,
    wahaAdapter: runtime.wahaAdapter,
    ingestionGateway: runtime.ingestionGateway,
    healthProvider: runtime.createHealthProvider(worker),
    authenticator: runtime.authenticator,
    workspaceDirectory: runtime.workspaceDirectory,
    cockpitReadGateway: runtime.cockpitReadGateway,
    handoffOperationsGateway: runtime.handoffOperationsGateway,
    journeyOperationsGateway: runtime.journeyOperationsGateway,
    commercialOutcomeGateway: runtime.commercialOutcomeGateway,
    outboundDispatchGateway: runtime.outboundDispatchGateway,
    trafficProofGateway: runtime.trafficProofGateway,
    knownFactOperationsGateway: runtime.knownFactOperationsGateway,
    appointmentGateway: runtime.appointmentGateway,
    notesGateway: runtime.notesGateway,
    workspaceProvisioningGateway: runtime.workspaceProvisioningGateway,
    wabaChannelInfoGateway: runtime.wabaChannelInfoGateway,
    wabaWebhook: wabaWebhookConfig,
    logger: runtime.logger ?? (process.env.NODE_ENV === 'production' ? true : { level: 'info' }),
    trustProxy: runtime.trustProxy ?? false,
  });

  worker.start();

  let outboundWorker: WahaOutboundWorker | undefined;
  if (runtime.outboundDispatchGateway) {
    const wahaBaseUrl = process.env.WAHA_BASE_URL?.trim() || 'http://sos-sales-waha:3000';
    const wahaApiKey = process.env.WAHA_API_KEY?.trim() || (process.env.NODE_ENV === 'production' ? '' : 'mct_sos_waha_dev_secret_2026');
    const outboundAdapter = new WahaOutboundAdapter({ endpoint: wahaBaseUrl, apiKey: wahaApiKey });
    outboundWorker = new WahaOutboundWorker({
      dispatchGateway: runtime.outboundDispatchGateway,
      outboundAdapter,
    });
    outboundWorker.start();
  }

  let receptionistWorker: ReceptionistInboundWorker | undefined;
  if (runtime.outboxGateway) {
    receptionistWorker = new ReceptionistInboundWorker({
      receptionistAgent: getReceptionistAgent(),
      outboxGateway: runtime.outboxGateway,
    });
    receptionistWorker.start();
  }

  try {
    await app.listen({ port, host });
  } catch (error) {
    await worker.stop();
    await outboundWorker?.stop();
    await receptionistWorker?.stop();
    await runtime.close?.();
    throw error;
  }

  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    await worker.stop();
    await outboundWorker?.stop();
    await receptionistWorker?.stop();
    await app.close();
    await runtime.close?.();
  };

  if (options.installSignalHandlers !== false) {
    process.once('SIGTERM', () => void stop());
    process.once('SIGINT', () => void stop());
  }

  return { app, worker, stop };
}
