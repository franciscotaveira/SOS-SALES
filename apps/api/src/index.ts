import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { logger } from "@sos-sales/observability";
import { checkDatabaseHealth } from "@sos-sales/database";
import crypto from "node:crypto";

export async function buildApp() {
  const app = Fastify({
    loggerInstance: logger as any,
    requestIdHeader: "x-correlation-id",
    genReqId: () => crypto.randomUUID(),
  });

  await app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Workspace-Id", "Idempotency-Key", "x-correlation-id"],
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

  // Liveness Check
  app.get("/health", async () => {
    return {
      status: "live",
      service: "sos-sales-api",
      version: "3.0.0-alpha.1",
      timestamp: new Date().toISOString(),
    };
  });

  // Readiness Check (Dependency Probes)
  app.get("/ready", async (_request, reply) => {
    const dbHealth = await checkDatabaseHealth();

    const isReady = dbHealth.healthy;
    const responsePayload = {
      status: isReady ? "ready" : "degraded",
      service: "sos-sales-api",
      checks: {
        database: {
          healthy: dbHealth.healthy,
          latencyMs: dbHealth.latencyMs,
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
