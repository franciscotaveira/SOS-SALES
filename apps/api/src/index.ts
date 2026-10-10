import "dotenv/config";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { logger } from "@sos-sales/observability";
import { checkDatabaseHealth, type Keyring } from "@sos-sales/database";
import crypto from "node:crypto";
import { Redis } from "ioredis";
import { authPlugin } from "./plugins/auth.plugin";
import { rawBodyPlugin } from "./plugins/raw-body.plugin";
import { meRoutes } from "./routes/me.routes";
import { authRoutes } from "./routes/auth.routes";
import { workspaceRoutes } from "./routes/workspace.routes";
import { webhookRoutes } from "./routes/webhook.routes";
import { outboundMessagesRoutes } from "./routes/outbound-messages.routes";
import { threadsRoutes } from "./routes/threads.routes";
import { channelsRoutes } from "./routes/channels.routes";
import { commercialRoutes } from "./routes/commercial.routes";
import { contactsRoutes } from "./routes/contacts.routes";
import { templatesRoutes } from "./routes/templates.routes";
import { flowsRoutes } from "./routes/flows.routes";
import { productsRoutes } from "./routes/products.routes";
import { pixRoutes } from "./routes/pix.routes";
import { pixWebhookRoutes } from "./routes/pix-webhook.routes";
import { mediaUploadRoutes } from "./routes/media-upload.routes";
import type { MediaStorage } from "./services/media-storage";
import { integrationRoutes } from "./routes/integration.routes";
import { outboundWebhooksRoutes } from "./routes/outbound-webhooks.routes";
import { commercialActionsRoutes } from "./routes/commercial-actions.routes";
import { commercialProposalsRoutes } from "./routes/commercial-proposals.routes";
import { aiAgentRoutes } from "./routes/ai-agent.routes";
import { broadcastsRoutes } from "./routes/broadcasts.routes";
import type { ISigningSecretResolver, ITransactionalOutboundProducerService } from "@sos-sales/application";


let redisClient: Redis | null = null;
export function getRedisClient(): Redis {
  if (!redisClient) {
    const url = process.env.REDIS_URL || "redis://localhost:6389";
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
    });
  }
  return redisClient;
}

export async function checkRedisHealth(): Promise<{ healthy: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    const client = getRedisClient();
    if (client.status === "wait") {
      await client.connect();
    }
    const pong = await client.ping();
    return { healthy: pong === "PONG", latencyMs: Date.now() - start };
  } catch (error) {
    logger.error({ error }, "Redis readiness check failed");
    return { healthy: false, latencyMs: Date.now() - start };
  }
}

import type { IIdentityProvider, IdentityProviderConfig } from "@sos-sales/auth";
import {
  RedisTwoTierRateLimiter,
  BoundedTwoTierRateLimiter,
  type IRateLimiter,
} from "./services/redis-rate-limiter";

export interface BuildAppOptions {
  providerType?: "local-jwt" | "supabase-jwks";
  jwtSecret?: string;
  issuer?: string;
  audience?: string;
  supabaseUrl?: string;
  jwksUri?: string;
  identityProvider?: IIdentityProvider;
  identityProviderConfig?: IdentityProviderConfig;
  secretResolver?: ISigningSecretResolver;
  masterKeyHex?: string;
  keyring?: Keyring;
  activeKeyVersion?: number;
  ingressPool?: import("@sos-sales/database").Pool;
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
  rateLimiter?: IRateLimiter;
  keyPrefix?: string;
  trustProxy?: boolean | string | string[];
  outboundProducerService?: ITransactionalOutboundProducerService;
  /** Outbound media storage (null = explicitly unconfigured). Defaults to Supabase Storage from env. */
  mediaStorage?: MediaStorage | null;
}

export function sanitizeUrl(rawUrl: string | undefined): string {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  return rawUrl.replace(/\/v1\/webhooks\/whatsapp\/[^/?#]+/g, "/v1/webhooks/whatsapp/[redacted]");
}

export function resolveTrustProxy(
  optionValue?: boolean | string | string[]
): boolean | string | string[] {
  if (optionValue !== undefined) {
    return optionValue;
  }
  const envVal = process.env.TRUST_PROXY;
  if (envVal) {
    if (envVal === "true") return true;
    if (envVal === "false") return false;
    const split = envVal
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (split.length > 0) return split;
  }
  // Secure default: strictly local and RFC 1918 / RFC 4193 private subnets
  return ["127.0.0.1", "::1", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"];
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: logger as any,
    trustProxy: resolveTrustProxy(options.trustProxy),
    requestIdHeader: "x-correlation-id",
    genReqId: () => crypto.randomUUID(),
    bodyLimit: 524288, // Strict 512 KB payload ceiling
  });

  // Register raw body plugin strictly before any route registration
  await app.register(rawBodyPlugin);

  await app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Workspace-Id",
      "Idempotency-Key",
      "x-correlation-id",
    ],
  });

  // RFC 9457 Problem Details standard error handler
  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    let statusCode = error.statusCode;
    if (!statusCode) {
      if (error.name === "SyntaxError" || (error as any).code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") {
        statusCode = 400;
      } else {
        statusCode = 500;
      }
    }
    request.log.error({ err: error, correlationId: request.id }, "Request execution error");

    reply.status(statusCode).send({
      type: "https://sos-sales.mct.br/errors/api-error",
      title: error.name || "Internal Server Error",
      status: statusCode,
      detail: sanitizeUrl(error.message),
      instance: sanitizeUrl(request.url),
      correlationId: request.id,
    });
  });

  // Register Core Authentication & Tenant Isolation Plugin
  await app.register(authPlugin, options);

  // Register Public & Channel Ingress Routes
  let effectiveRateLimiter: IRateLimiter = options.rateLimiter!;
  if (!effectiveRateLimiter) {
    if (process.env.NODE_ENV === "test" && !options.keyPrefix && !process.env.ENABLE_TEST_REDIS_RATE_LIMIT) {
      effectiveRateLimiter = new BoundedTwoTierRateLimiter({
        maxIpRequests: options.rateLimitMax ?? 100,
        maxChannelRequests: (options.rateLimitMax ?? 100) * 3,
        windowMs: options.rateLimitWindowMs ?? 60_000,
      });
    } else {
      const redis = getRedisClient();
      effectiveRateLimiter = new RedisTwoTierRateLimiter({
        redisClient: redis,
        keyPrefix: options.keyPrefix ?? "sos:ratelimit:v1",
        maxIpRequests: options.rateLimitMax ?? 100,
        maxChannelRequests: (options.rateLimitMax ?? 100) * 3,
        windowMs: options.rateLimitWindowMs ?? 60_000,
      });
    }
  }

  await app.register(webhookRoutes, {
    secretResolver: options.secretResolver,
    masterKeyHex: options.masterKeyHex,
    keyring: options.keyring,
    activeKeyVersion: options.activeKeyVersion,
    ingressPool: options.ingressPool,
    rateLimitMax: options.rateLimitMax,
    rateLimitWindowMs: options.rateLimitWindowMs,
    rateLimiter: effectiveRateLimiter,
  });

  // Register Domain Routes
  await app.register(authRoutes);
  await app.register(meRoutes);
  await app.register(workspaceRoutes);
  await app.register(channelsRoutes);
  await app.register(threadsRoutes);
  await app.register(commercialRoutes);
  await app.register(contactsRoutes);
  await app.register(templatesRoutes);
  await app.register(flowsRoutes);
  await app.register(productsRoutes);
  await app.register(pixRoutes);
  await app.register(pixWebhookRoutes);
  await app.register(mediaUploadRoutes, { storage: options.mediaStorage });
  await app.register(integrationRoutes);
  await app.register(outboundWebhooksRoutes);
  await app.register(commercialActionsRoutes);
  await app.register(commercialProposalsRoutes);
  await app.register(aiAgentRoutes);
  await app.register(broadcastsRoutes, {
    producerService: options.outboundProducerService,
  });
  await app.register(outboundMessagesRoutes, {
    producerService: options.outboundProducerService,
    rateLimiter: effectiveRateLimiter,
    rateLimitMax: options.rateLimitMax,
    rateLimitWindowMs: options.rateLimitWindowMs,
  });

  // Liveness Check
  app.get("/health", async () => {
    return {
      status: "live",
      service: "sos-sales-api",
      version: "3.0.0-alpha.1",
      timestamp: new Date().toISOString(),
    };
  });

  // Readiness Check (Dependency Probes for Postgres + Redis)
  app.get("/ready", async (_request, reply) => {
    const [dbHealth, redisHealth] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
    ]);

    const isReady = dbHealth.healthy && redisHealth.healthy;
    const responsePayload = {
      status: isReady ? "ready" : "degraded",
      service: "sos-sales-api",
      checks: {
        database: {
          healthy: dbHealth.healthy,
          latencyMs: dbHealth.latencyMs,
        },
        redis: {
          healthy: redisHealth.healthy,
          latencyMs: redisHealth.latencyMs,
        },
      },
      timestamp: new Date().toISOString(),
    };

    return reply.status(isReady ? 200 : 503).send(responsePayload);
  });

  // Root Info
  app.get("/", async () => {
    return {
      name: "SOS Sales V3 API",
      status: "operational",
      docs: "/documentation",
    };
  });

  await app.ready();

  return app;
}

async function start() {
  const port = Number(process.env.API_PORT || process.env.PORT_API || 4400);
  const host = process.env.API_HOST || "0.0.0.0";

  try {
    const app = await buildApp();
    await app.listen({ port, host });
    logger.info({ port, host }, "🚀 SOS Sales V3 API started successfully");
  } catch (err) {
    logger.fatal({ err }, "Fatal error starting SOS Sales V3 API");
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== "test") {
  start();
}
