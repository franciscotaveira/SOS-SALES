import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import rateLimit, { RateLimitPluginOptions } from '@fastify/rate-limit';
import { WebhookSecretProvider } from '../../application/ports/webhook-secret-provider.js';
import { ChannelWebhookAdapter } from '../../application/ports/channel-webhook-adapter.js';
import { InboundIngestionGateway } from '../../application/ports/inbound-ingestion-gateway.js';
import { DependencyHealthProvider } from '../../application/ports/dependency-health-provider.js';
import { OperatorAuthenticator } from '../../application/ports/operator-authenticator.js';
import { WorkspaceDirectory } from '../../application/ports/workspace-directory.js';
import { wahaWebhookRoutes } from './routes/webhooks/waha.js';
import { operatorAuthRoutes } from './routes/operator-auth.js';

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
  /**
   * Server-side Supabase JWT verifier. When absent, operator routes fail
   * closed with 401; no local/user header fallback is permitted.
   */
  authenticator?: OperatorAuthenticator;
  /** Read-only workspace membership source for authenticated operator routes. */
  workspaceDirectory?: WorkspaceDirectory;
  logger?: boolean | Record<string, unknown>;
  rateLimit?: RateLimitOptions | false;
  /**
   * Trust-proxy setting for the Fastify server.
   * See TrustProxyOption documentation above.
   * Defaults to false (no proxy trusted).
   */
  trustProxy?: TrustProxyOption;
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

  const { secretProvider, wahaAdapter, ingestionGateway, healthProvider } = dependencies;

  // trustProxy MUST be set explicitly — no implicit fallback to trusting all headers.
  const trustProxy: TrustProxyOption = dependencies.trustProxy ?? false;

  const app = Fastify({
    logger: dependencies.logger !== undefined ? dependencies.logger : { level: 'info' },
    trustProxy,
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
  });

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
    system: 'TX Commercial Core',
    version: '1.0.0',
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
      // No health provider configured — report degraded rather than silently passing
      return reply.status(503).send({
        status: 'degraded',
        reason: 'No health provider configured',
        timestamp: new Date().toISOString(),
      });
    }

    let statuses;
    try {
      statuses = await healthProvider.checkAll();
    } catch {
      return reply.status(503).send({
        status: 'degraded',
        reason: 'Dependency health check unavailable',
        timestamp: new Date().toISOString(),
      });
    }
    const byName = new Map(statuses.map((status) => [status.name, status]));
    const dependencies = REQUIRED_READINESS_DEPENDENCIES.map((name) => ({
      name,
      status: byName.get(name)?.healthy ? 'ok' : 'degraded',
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
