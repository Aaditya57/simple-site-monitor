import dotenv from "dotenv";
dotenv.config();

import { Worker, Queue } from "bullmq";
import type { ConnectionOptions } from "bullmq";
import { getDb } from "@monitor/db";
import { startScheduler } from "./scheduler";
import { processCheckMonitor } from "./jobs/checkMonitor";
import { processSendAlert } from "./jobs/sendAlert";
import { sql } from "drizzle-orm";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const WORKER_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 10);

// Parse Redis URL into BullMQ ConnectionOptions (avoids ioredis version conflict)
function parseRedisUrl(url: string): ConnectionOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || "localhost",
    port: parseInt(parsed.port) || 6379,
    password: parsed.password || undefined,
    db: parsed.pathname ? parseInt(parsed.pathname.replace("/", "")) || 0 : 0,
  };
}

const connection = parseRedisUrl(REDIS_URL);

const checkQueue = new Queue("checkMonitor", { connection });
const alertQueue = new Queue("sendAlert", { connection });

// ── Check monitor worker ───────────────────────────────────────────────────────
const checkWorker = new Worker(
  "checkMonitor",
  async (job) => {
    await processCheckMonitor(job, checkQueue, alertQueue);
  },
  {
    connection,
    concurrency: WORKER_CONCURRENCY,
    removeOnComplete: { count: 0 },
    removeOnFail: { count: 10 },
  }
);

// ── Alert sender worker ───────────────────────────────────────────────────────
const alertWorker = new Worker(
  "sendAlert",
  async (job) => {
    await processSendAlert(job);
  },
  {
    connection,
    concurrency: 5,
    removeOnComplete: { count: 0 },
    removeOnFail: { count: 10 },
  }
);

// ── Scheduler ─────────────────────────────────────────────────────────────────
startScheduler(checkQueue);

// ── Heartbeat ─────────────────────────────────────────────────────────────────
async function heartbeat() {
  const db = getDb();
  const rows = (await db.execute(
    sql`UPDATE worker_status SET last_heartbeat_at = NOW() RETURNING id`
  )) as unknown as Array<{ id: string }>;
  if (!rows || rows.length === 0) {
    await db.execute(
      sql`INSERT INTO worker_status (id, last_heartbeat_at) VALUES (gen_random_uuid(), NOW())`
    );
  }
}

heartbeat();
setInterval(heartbeat, 30_000);

// ── Error handling ────────────────────────────────────────────────────────────
checkWorker.on("failed", (job, err) => {
  console.error(`[worker] check job failed: ${job?.id}`, err.message);
});
alertWorker.on("failed", (job, err) => {
  console.error(`[worker] alert job failed: ${job?.id}`, err.message);
});

console.log(`[worker] started (concurrency=${WORKER_CONCURRENCY})`);

process.on("SIGTERM", async () => {
  console.log("[worker] SIGTERM received, shutting down gracefully");
  await checkWorker.close();
  await alertWorker.close();
  process.exit(0);
});
