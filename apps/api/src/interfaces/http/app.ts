import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import rateLimit, { RateLimitPluginOptions } from '@fastify/rate-limit';
import { WebhookSecretProvider } from '../../application/ports/webhook-secret-provider.js';
import { ChannelWebhookAdapter } from '../../application/ports/channel-webhook-adapter.js';
import { InboundIngestionGateway } from '../../application/ports/inbound-ingestion-gateway.js';
import { DependencyHealthProvider } from '../../application/ports/dependency-health-provider.js';
import { OperatorAuthenticator } from '../../application/ports/operator-authenticator.js';
import { WorkspaceDirectory } from '../../application/ports/workspace-directory.js';
import { CockpitReadGateway } from '../../application/ports/cockpit-read-gateway.js';
import { HandoffOperationsGateway } from '../../application/ports/handoff-operations-gateway.js';
import { JourneyOperationsGateway } from '../../application/ports/journey-operations-gateway.js';
import { CommercialOutcomeGateway } from '../../application/ports/commercial-outcome-gateway.js';
import { OutboundDispatchGateway } from '../../application/ports/outbound-dispatch-gateway.js';
import { TrafficProofGateway } from '../../application/ports/traffic-proof-gateway.js';
import { KnownFactOperationsGateway } from '../../application/ports/known-fact-operations-gateway.js';
import { AppointmentGateway } from '../../application/ports/appointment-gateway.js';
import { NotesGateway } from '../../application/ports/notes-gateway.js';
import { WorkspaceProvisioningGateway } from '../../application/ports/workspace-provisioning-gateway.js';
import { WabaChannelInfoGateway } from '../../application/ports/waba-channel-info-gateway.js';
import fs from 'node:fs';
import path from 'node:path';
import { publicSupplierRoutes } from './routes/public-supplier-routes.js';
import { wahaWebhookRoutes } from './routes/webhooks/waha.js';
import { wabaWebhookPlugin } from './routes/webhooks/waba-webhook.js';
import { operatorAuthRoutes } from './routes/operator-auth.js';
import { abacatePayRoutes } from './routes/abacatepay-routes.js';
import { aiCopilotRoutes } from './routes/ai-copilot-routes.js';
import { whatsappChannelRoutes } from './routes/whatsapp-channel-routes.js';
import { agentRoutes } from './routes/agent-routes.js';
import { metaPartnerRoutes } from './routes/meta-partner-routes.js';

function loadReleaseManifest() {
  let manifest: Record<string, unknown> = {};
  try {
    const manifestPath = path.resolve(process.cwd(), 'dist', 'release-manifest.json');
    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    }
  } catch {}

  const activeEnv = process.env.APP_ENV || (process.env.NODE_ENV === 'production' && !process.env.LAB_DATABASE_URL ? 'production' : process.env.NODE_ENV || 'development');
  const releaseStr = activeEnv === 'production' ? ((manifest.release as string) || 'v2.0.0-prod') : `v2.0.0-${activeEnv}`;

  return {
    product: 'SOS Sales',
    edition: 'Enterprise Multi-Tenant WhatsApp CRM',
    version: '2.0.0',
    kernel: 'TX Commercial Core v2.0',
    commitSha: (manifest.commitSha as string) || process.env.GIT_COMMIT_SHA || (activeEnv === 'production' ? 'UNKNOWN_UNCOMMITTED' : 'dev-local'),
    cleanTree: manifest.cleanTree ?? (activeEnv !== 'production'),
    buildTimestamp: (manifest.buildTimestamp as string) || new Date().toISOString(),
    ...manifest,
    release: releaseStr,
    environment: activeEnv,
  };
}

export interface RateLimitOptions {
  max?: number;
  timeWindow?: string | number;
  allowList?: string[] | ((req: FastifyRequest) => boolean);
}

/**
 * Trust-proxy configuration.
 *
 * Must be set explicitly for the production reverse-proxy topology.
 * Valid values:
 *   false        — no proxy; use socket remote address (default for dev/test)
 *   true         — trust all X-Forwarded-For hops (ONLY valid behind a controlled LB)
 *   number       — trust the last N hops (recommended for single-hop reverse proxies)
 *   string/array — trust only requests from the listed CIDR ranges
 *
 * Never use `true` unless the application is behind a load balancer that
 * strips client-supplied X-Forwarded-For headers before forwarding.
 */
export type TrustProxyOption = boolean | string | string[] | number;
const REQUIRED_READINESS_DEPENDENCIES = ['database', 'redis', 'worker'] as const;

export interface AppDependencies {
  secretProvider: WebhookSecretProvider;
  wahaAdapter: ChannelWebhookAdapter;
  ingestionGateway: InboundIngestionGateway;
  /** Optional: injected for /ready checks. If omitted, /ready always returns degraded. */
  healthProvider?: DependencyHealthProvider;
  /** Exact probes that must be present once each for this composed runtime. */
  readinessDependencyNames?: readonly string[];
  /**
   * Server-side Supabase JWT verifier. When absent, operator routes fail
   * closed with 401; no local/user header fallback is permitted.
   */
  authenticator?: OperatorAuthenticator;
  /** Read-only workspace membership source for authenticated operator routes. */
  workspaceDirectory?: WorkspaceDirectory;
  /** Authenticated, RLS-scoped operator cockpit read model. */
  cockpitReadGateway?: CockpitReadGateway;
  /** Authenticated, RLS-scoped handoff state-machine mutations. */
  handoffOperationsGateway?: HandoffOperationsGateway;
  /** Authenticated, RLS-scoped journey stage and follow-up mutations. */
  journeyOperationsGateway?: JourneyOperationsGateway;
  /** Authenticated, RLS-scoped immutable commercial outcome mutation. */
  commercialOutcomeGateway?: CommercialOutcomeGateway;
  /** Authenticated, RLS-scoped supervised outbound draft lifecycle. */
  outboundDispatchGateway?: OutboundDispatchGateway;
  /** Authenticated, RLS-scoped attribution and imported-spend read model. */
  trafficProofGateway?: TrafficProofGateway;
  /** Authenticated, RLS-scoped append-only human known-fact commands. */
  knownFactOperationsGateway?: KnownFactOperationsGateway;
  /** Authenticated, RLS-scoped commercial appointments CRUD gateway. */
  appointmentGateway?: AppointmentGateway;
  /** Authenticated, RLS-scoped operational notes CRUD gateway. */
  notesGateway?: NotesGateway;
  /** Authenticated first-login workspace auto-provisioning gateway. */
  workspaceProvisioningGateway?: WorkspaceProvisioningGateway;
  /** Production-owned read gateway for connected Meta WABA channel metadata. */
  wabaChannelInfoGateway?: WabaChannelInfoGateway;
  logger?: boolean | Record<string, unknown>;
  rateLimit?: RateLimitOptions | false;
  /**
   * Trust-proxy setting for the Fastify server.
   * See TrustProxyOption documentation above.
   * Defaults to false (no proxy trusted).
   */
  trustProxy?: TrustProxyOption;
  /**
   * Meta WABA Cloud API webhook verification config. Required to register
   * the WABA webhook routes. Fails closed with no hardcoded fallback —
   * source from META_VERIFY_TOKEN / META_APP_SECRET at the composition root.
   */
  wabaWebhook?: {
    verifyToken: string;
    appSecret: string;
  };
}

export function buildApp(dependencies: AppDependencies): FastifyInstance {
  if (!dependencies?.ingestionGateway) {
    throw new Error(
      'buildApp requires an InboundIngestionGateway instance. ' +
      'In production, configure a production server-only gateway; ' +
      'in development/test, provide PostgresInboundIngestionGateway.'
    );
  }
  if (!dependencies.secretProvider) {
    throw new Error(
      'buildApp requires a WebhookSecretProvider instance.'
    );
  }
  if (!dependencies.wahaAdapter) {
    throw new Error(
      'buildApp requires a ChannelWebhookAdapter instance.'
    );
  }

  const { secretProvider, wahaAdapter, ingestionGateway, healthProvider, wabaWebhook } = dependencies;
  const requiredReadinessDependencies = dependencies.readinessDependencyNames ?? REQUIRED_READINESS_DEPENDENCIES;

  // trustProxy MUST be set explicitly — no implicit fallback to trusting all headers.
  const trustProxy: TrustProxyOption = dependencies.trustProxy ?? false;

  const app = Fastify({
    logger: dependencies.logger !== undefined ? dependencies.logger : { level: 'info' },
    trustProxy,
  });

  // Fastify 4 remains in the compatibility line for this release. Reject
  // ambiguous Content-Type whitespace before body parsing so validation cannot
  // be bypassed with a tab-delimited media type.
  app.addHook('onRequest', async (request, reply) => {
    const rawHeaders = request.raw.rawHeaders;
    for (let index = 0; index < rawHeaders.length; index += 2) {
      if (rawHeaders[index]?.toLowerCase() !== 'content-type') continue;
      if (/[\t\r\n]/.test(rawHeaders[index + 1] || '')) {
        return reply.status(400).send({ error: 'Invalid Content-Type header' });
      }
    }
  });

  // Attach rawBody buffer to request for cryptographic signature verification
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body, done) => {
      try {
        (req as unknown as { rawBody: Buffer }).rawBody = body as Buffer;
        const parsed = JSON.parse((body as Buffer).toString('utf8'));
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  // Security Plugins
  app.register(helmet, { contentSecurityPolicy: false });
  app.register(cors, { origin: true });
  app.register(sensible);

  // OpenAPI / Swagger
  app.register(fastifySwagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'SOS Sales API',
        version: '1.0.0',
        description: 'API do SOS Sales — Sistema Operacional Comercial (TX Commercial Core). Todas as rotas exigem Bearer JWT emitido pelo Supabase Auth.'
      },
      servers: [
        { url: 'http://localhost:4334', description: 'Local Dev' },
        { url: 'https://sos.mct.com.br', description: 'Produção VPS' }
      ],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
        }
      },
      security: [{ bearerAuth: [] }]
    }
  });

  // Swagger UI carries static-file routing and is for local/Lab diagnostics.
  // Production exposes no public documentation surface.
  if (process.env.APP_ENV !== 'production') {
    app.register(fastifySwaggerUi, {
      routePrefix: '/docs',
      uiConfig: { docExpansion: 'list', deepLinking: true },
      staticCSP: true,
    });
  }

  // Rate Limiting (Default 600 req/min, bypass for /health and /ready)
  if (dependencies.rateLimit !== false) {
    const rateConfig = typeof dependencies.rateLimit === 'object' ? dependencies.rateLimit : {};
    app.register(rateLimit, {
      global: true,
      max: rateConfig.max !== undefined ? rateConfig.max : 600,
      timeWindow: rateConfig.timeWindow !== undefined ? rateConfig.timeWindow : '1 minute',
      allowList: rateConfig.allowList !== undefined
        ? rateConfig.allowList
        : (req: FastifyRequest) => req.url === '/health' || req.url === '/ready',
      errorResponseBuilder: (_req, context) => ({
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded, retry in ${context.after}`,
      }),
    } as RateLimitPluginOptions);
  }

  // Webhook Routes
  app.register(wahaWebhookRoutes, {
    secretProvider,
    wahaAdapter,
    ingestionGateway,
  });

  // Operator API: an isolated auth scope that accepts only verifier-derived
  // actors. It is deliberately separate from unauthenticated webhook routes.
  app.register(operatorAuthRoutes, {
    prefix: '/api/v1',
    authenticator: dependencies.authenticator,
    workspaceDirectory: dependencies.workspaceDirectory,
    cockpitReadGateway: dependencies.cockpitReadGateway,
    handoffOperationsGateway: dependencies.handoffOperationsGateway,
    journeyOperationsGateway: dependencies.journeyOperationsGateway,
    commercialOutcomeGateway: dependencies.commercialOutcomeGateway,
    outboundDispatchGateway: dependencies.outboundDispatchGateway,
    trafficProofGateway: dependencies.trafficProofGateway,
    knownFactOperationsGateway: dependencies.knownFactOperationsGateway,
    appointmentGateway: dependencies.appointmentGateway,
    notesGateway: dependencies.notesGateway,
    workspaceProvisioningGateway: dependencies.workspaceProvisioningGateway,
  });

  // ─── 1. Public Supplier Webhooks & Crypto Handshakes (Protected by Provider Secrets & HMAC) ───
  app.register(publicSupplierRoutes);
  app.register(abacatePayRoutes, {
    authenticator: dependencies.authenticator,
    workspaceDirectory: dependencies.workspaceDirectory,
  });
  if (wabaWebhook) {
    app.register(wabaWebhookPlugin, {
      verifyToken: wabaWebhook.verifyToken,
      appSecret: wabaWebhook.appSecret,
    });
  }

  // ─── 2. Authenticated Operator Routes (Protected by Bearer JWT & Workspace Isolation) ───────────
  app.register(whatsappChannelRoutes, {
    authenticator: dependencies.authenticator,
    workspaceDirectory: dependencies.workspaceDirectory,
    wabaChannelInfoGateway: dependencies.wabaChannelInfoGateway,
    outboundDispatchGateway: dependencies.outboundDispatchGateway,
  });

  app.register(aiCopilotRoutes, {
    authenticator: dependencies.authenticator,
  });

  app.register(agentRoutes, {
    authenticator: dependencies.authenticator,
    workspaceDirectory: dependencies.workspaceDirectory,
  });

  app.register(metaPartnerRoutes, {
    authenticator: dependencies.authenticator,
    workspaceDirectory: dependencies.workspaceDirectory,
  });

  const releaseManifest = loadReleaseManifest();

  /**
   * GET /health — Liveness probe.
   * Only verifies that the process is alive and the HTTP server is responsive.
   * Does NOT probe external dependencies (database, Redis, worker).
   * Never rate-limited (excluded from allowList above).
   */
  app.get('/health', {
    config: { rateLimit: false },
  }, async () => ({
    status: 'ok',
    system: 'SOS Sales Commercial Core',
    kernel: 'TX Commercial Core',
    version: releaseManifest.version,
    release: releaseManifest.release,
    environment: releaseManifest.environment,
    commit: releaseManifest.commitSha,
    timestamp: new Date().toISOString(),
  }));

  /**
   * GET /version — Product release metadata & build provenance
   */
  app.get('/version', {
    config: { rateLimit: false },
  }, async () => ({
    ...releaseManifest,
    timestamp: new Date().toISOString(),
  }));

  /**
   * GET /ready — Readiness probe.
   * Returns 200 when all required dependencies are healthy.
   * Returns 503 Service Unavailable when any dependency is degraded.
   * Never exposes internal error details — only sanitised dependency names and status.
   * Never rate-limited (excluded from allowList above).
   */
  app.get('/ready', {
    config: { rateLimit: false },
  }, async (_req, reply) => {
    if (!healthProvider) {
      // No health provider configured — report degraded rather than silently
      // passing. Deliberately do not expose configuration details to an
      // unauthenticated endpoint.
      return reply.status(503).send({
        status: 'degraded',
        dependencies: requiredReadinessDependencies.map((name) => ({ name, status: 'degraded' })),
        timestamp: new Date().toISOString(),
      });
    }

    let statuses;
    try {
      statuses = await healthProvider.checkAll();
    } catch {
      return reply.status(503).send({
        status: 'degraded',
        dependencies: requiredReadinessDependencies.map((name) => ({ name, status: 'degraded' })),
        timestamp: new Date().toISOString(),
      });
    }

    // A Map would silently accept duplicates by keeping the last status. That
    // can turn a broken health adapter into a false positive. Readiness is
    // fail-closed: each mandatory dependency must be reported exactly once and
    // that single probe must be healthy.
    const dependencies = requiredReadinessDependencies.map((name) => ({
      name,
      status: statuses.filter((status) => status.name === name).length === 1
        && statuses.find((status) => status.name === name)?.healthy === true
        ? 'ok'
        : 'degraded',
    }));
    const allHealthy = dependencies.every((dependency) => dependency.status === 'ok');

    const body = {
      status: allHealthy ? 'ready' : 'degraded',
      // Do not reflect adapter-provided details. They can contain a host, a
      // connection string, or another operational detail that does not belong
      // in an unauthenticated readiness response.
      dependencies,
      timestamp: new Date().toISOString(),
    };

    return reply.status(allHealthy ? 200 : 503).send(body);
  });

  return app;
}
