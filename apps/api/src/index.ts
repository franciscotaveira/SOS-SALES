import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { logger } from "@sos-sales/observability";
import { checkDatabaseHealth } from "@sos-sales/database";
import crypto from "node:crypto";
import { Redis } from "ioredis";
import { authPlugin } from "./plugins/auth.plugin";
import { meRoutes } from "./routes/me.routes";
import { workspaceRoutes } from "./routes/workspace.routes";

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

export interface BuildAppOptions {
  jwtSecret?: string;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    loggerInstance: logger as any,
    requestIdHeader: "x-correlation-id",
    genReqId: () => crypto.randomUUID(),
  });

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
    const statusCode = error.statusCode || 500;
    request.log.error({ err: error, correlationId: request.id }, "Request execution error");

    reply.status(statusCode).send({
      type: "https://sos-sales.mct.br/errors/api-error",
      title: error.name || "Internal Server Error",
      status: statusCode,
      detail: error.message,
      instance: request.url,
      correlationId: request.id,
    });
  });

  // Register Core Authentication & Tenant Isolation Plugin
  await app.register(authPlugin, {
    jwtSecret: options.jwtSecret,
  });

  // Register Domain Routes
  await app.register(meRoutes);
  await app.register(workspaceRoutes);

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
