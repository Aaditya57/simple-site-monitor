import { Job, Queue } from "bullmq";
import { getDb, monitors, monitorChecks, alertEvents } from "@monitor/db";
import { eq, and, sql, gt } from "drizzle-orm";
import { runCheck } from "../checkers/http";

export interface CheckMonitorJob {
  monitorId: string;
  attempt?: number; // 1 = first try, 2 = retry
}

export async function processCheckMonitor(
  job: Job<CheckMonitorJob>,
  checkQueue: Queue,
  alertQueue: Queue
): Promise<void> {
  const { monitorId, attempt = 1 } = job.data;
  const db = getDb();

  const [monitor] = await db
    .select()
    .from(monitors)
    .where(eq(monitors.id, monitorId))
    .limit(1);

  if (!monitor || monitor.isPaused || monitor.deletedAt) return;

  console.log(`[check] ${monitor.name} (${monitor.url}) attempt=${attempt}`);
  const result = await runCheck({
    url: monitor.url,
    timeoutSeconds: monitor.timeoutSeconds,
    expectedStatus: monitor.expectedStatus,
    keyword: monitor.keyword,
    keywordCaseInsensitive: monitor.keywordCaseInsensitive,
    tlsCheckEnabled: monitor.tlsCheckEnabled,
    tlsWarnDays: monitor.tlsWarnDays,
    dnsCheckEnabled: monitor.dnsCheckEnabled,
  });

  // ── Retry once on failure ─────────────────────────────────────────────────
  if (result.status === "DOWN" && attempt === 1) {
    console.log(`[check] ${monitor.name} DOWN on attempt 1 (${result.errorType ?? "?"}: ${result.errorMessage ?? ""}) — retrying in 60s`);
    await checkQueue.add(
      "checkMonitor",
      { monitorId, attempt: 2 },
      { delay: 60_000, removeOnComplete: true, removeOnFail: 10 }
    );
    return; // Don't update state yet; wait for retry
  }

  // ── Insert check record ───────────────────────────────────────────────────
  await db.insert(monitorChecks).values({
    monitorId,
    status: result.status,
    httpStatusCode: result.httpStatusCode,
    latencyMs: result.latencyMs,
    errorType: result.errorType ?? null,
    errorMessage: result.errorMessage ?? null,
    tlsDaysRemaining: result.tlsDaysRemaining,
    tlsCertCn: result.tlsCertCn ?? null,
    keywordMatch: result.keywordMatch,
    dnsResolvedIp: result.dnsResolvedIp ?? null,
  });

  // Trim to last 100 checks
  await db.execute(
    sql`DELETE FROM monitor_checks WHERE id NOT IN (
      SELECT id FROM monitor_checks WHERE monitor_id = ${monitorId}
      ORDER BY checked_at DESC LIMIT 100
    ) AND monitor_id = ${monitorId}`
  );

  // ── State machine ─────────────────────────────────────────────────────────
  const prevStatus = monitor.currentStatus; // 'UP' | 'DOWN' | 'UNKNOWN'
  const now = new Date();

  const statusChanged = prevStatus !== result.status;

  await db
    .update(monitors)
    .set({
      currentStatus: result.status,
      lastCheckedAt: now,
      lastLatencyMs: result.latencyMs ?? null,
      lastStatusChangedAt: statusChanged ? now : monitor.lastStatusChangedAt,
      consecutiveFailures:
        result.status === "DOWN"
          ? (monitor.consecutiveFailures ?? 0) + 1
          : 0,
      updatedAt: now,
    })
    .where(eq(monitors.id, monitorId));

  // ── Alert: DOWN ───────────────────────────────────────────────────────────
  if (result.status === "DOWN") {
    const lastAlert = monitor.lastDownAlertSentAt;
    const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000);

    const shouldAlert = !lastAlert || lastAlert < thirtyMinsAgo;
    if (shouldAlert) {
      await alertQueue.add(
        "sendAlert",
        { monitorId, alertType: "DOWN", checkResult: result },
        { attempts: 3, backoff: { type: "exponential", delay: 30_000 }, removeOnComplete: true, removeOnFail: 10 }
      );
      await db
        .update(monitors)
        .set({ lastDownAlertSentAt: now, updatedAt: now })
        .where(eq(monitors.id, monitorId));
    }
  }

  // ── Alert: RECOVERY ───────────────────────────────────────────────────────
  if (result.status === "UP" && prevStatus === "DOWN") {
    await alertQueue.add(
      "sendAlert",
      { monitorId, alertType: "RECOVERY", checkResult: result },
      { attempts: 3, backoff: { type: "exponential", delay: 30_000 }, removeOnComplete: true, removeOnFail: 10 }
    );
  }

  // ── Alert: TLS expiring ───────────────────────────────────────────────────
  if (
    result.status === "UP" &&
    result.tlsDaysRemaining !== undefined &&
    result.tlsDaysRemaining <= monitor.tlsWarnDays &&
    result.tlsDaysRemaining > 0
  ) {
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const [recentTlsAlert] = await db
      .select({ id: alertEvents.id })
      .from(alertEvents)
      .where(
        and(
          eq(alertEvents.monitorId, monitorId),
          eq(alertEvents.alertType, "TLS_EXPIRING"),
          gt(alertEvents.sentAt, oneDayAgo)
        )
      )
      .limit(1);

    if (!recentTlsAlert) {
      await alertQueue.add(
        "sendAlert",
        { monitorId, alertType: "TLS_EXPIRING", checkResult: result },
        { attempts: 3, backoff: { type: "exponential", delay: 30_000 }, removeOnComplete: true, removeOnFail: 10 }
      );
    }
  }
}
