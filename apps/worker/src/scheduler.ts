import { Queue } from "bullmq";
import { getDb, monitors } from "@monitor/db";
import { isNull, lte, eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

const POLL_INTERVAL_MS = 30_000; // 30 seconds

export function startScheduler(checkQueue: Queue) {
  console.log("[scheduler] starting — polling every 30s");

  async function tick() {
    try {
      const db = getDb();

      // Atomically claim monitors that are due by updating next_check_at first
      // This prevents duplicate execution across multiple worker instances.
      // Uses a raw query for atomic update-then-select.
      const now = new Date();

      const dueMongsters = await db
        .select({ id: monitors.id, intervalMinutes: monitors.intervalMinutes })
        .from(monitors)
        .where(
          and(
            lte(monitors.nextCheckAt, now),
            eq(monitors.isPaused, false),
            isNull(monitors.deletedAt)
          )
        );

      for (const monitor of dueMongsters) {
        // Atomically update next_check_at; if another worker already did it,
        // the WHERE condition will not match and we skip.
        const updated = await db
          .update(monitors)
          .set({
            nextCheckAt: sql`NOW() + (${monitor.intervalMinutes} || ' minutes')::interval`,
            updatedAt: now,
          })
          .where(
            and(
              eq(monitors.id, monitor.id),
              lte(monitors.nextCheckAt, now)
            )
          )
          .returning({ id: monitors.id });

        if (updated.length > 0) {
          await checkQueue.add(
            "checkMonitor",
            { monitorId: monitor.id, attempt: 1 },
            { removeOnComplete: true, removeOnFail: 10 }
          );
        }
      }

      if (dueMongsters.length > 0) {
        console.log(`[scheduler] enqueued ${dueMongsters.length} checks`);
      }
    } catch (err) {
      console.error("[scheduler] tick error", err);
    }
  }

  // Run immediately, then on interval
  tick();
  return setInterval(tick, POLL_INTERVAL_MS);
}
