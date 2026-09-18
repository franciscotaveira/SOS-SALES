import "dotenv/config";
import fs from "node:fs";
import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { logger } from "@sos-sales/observability";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6389";
const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

connection.on("connect", () => {
  logger.info({ redisUrl }, "✅ Worker connected to Redis");
});

connection.on("error", (err) => {
  logger.error({ err }, "❌ Redis connection error in Worker");
});

// Inbound Processor Worker
export const inboundWorker = new Worker(
  "inbound-messages",
  async (job: Job) => {
    logger.info({ jobId: job.id, name: job.name }, "📥 Processing inbound message job");
    // Idempotent processing logic implemented in later iterations
    return { processed: true, timestamp: new Date().toISOString() };
  },
  { connection, concurrency: 5 }
);

// CAPI Dispatcher Worker
export const capiWorker = new Worker(
  "capi-conversions",
  async (job: Job) => {
    logger.info({ jobId: job.id, name: job.name }, "📤 Dispatching CAPI conversion job");
    // Conversion policy & receipt logic
    return { dispatched: true, timestamp: new Date().toISOString() };
  },
  { connection, concurrency: 3 }
);

const HEARTBEAT_FILE = "/tmp/worker-healthy";

// Periodic heartbeat touch when Redis connection is alive
const heartbeatInterval = setInterval(() => {
  if (connection.status === "ready") {
    try {
      fs.writeFileSync(HEARTBEAT_FILE, new Date().toISOString(), "utf8");
    } catch {
      // ignore
    }
  } else {
    try {
      if (fs.existsSync(HEARTBEAT_FILE)) fs.unlinkSync(HEARTBEAT_FILE);
    } catch {
      // ignore
    }
  }
}, 2000);

logger.info("🚀 SOS Sales V3 BullMQ Worker engine running");

// Graceful termination
async function shutdown() {
  logger.info("Gracefully shutting down workers...");
  clearInterval(heartbeatInterval);
  try {
    if (fs.existsSync(HEARTBEAT_FILE)) fs.unlinkSync(HEARTBEAT_FILE);
  } catch {
    // ignore
  }
  await inboundWorker.close();
  await capiWorker.close();
  await connection.quit();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
