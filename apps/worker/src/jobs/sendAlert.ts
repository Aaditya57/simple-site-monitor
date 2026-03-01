import { Job, UnrecoverableError } from "bullmq";
import nodemailer from "nodemailer";
import { getDb, monitors, users, alertEvents } from "@monitor/db";
import { eq } from "drizzle-orm";
import { CheckResult } from "../checkers/http";

export interface SendAlertJob {
  monitorId: string;
  alertType: "DOWN" | "RECOVERY" | "TLS_EXPIRING" | "TLS_EXPIRED";
  checkResult: CheckResult;
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function subject(monitor: { name: string; url: string }, alertType: string): string {
  switch (alertType) {
    case "DOWN": return `[DOWN] ${monitor.name} (${monitor.url}) is not responding`;
    case "RECOVERY": return `[RECOVERED] ${monitor.name} is back up`;
    case "TLS_EXPIRING": return `[TLS WARNING] ${monitor.name} certificate expiring soon`;
    case "TLS_EXPIRED": return `[TLS EXPIRED] ${monitor.name} certificate has expired`;
    default: return `[ALERT] ${monitor.name}`;
  }
}

function body(
  monitor: { name: string; url: string },
  alertType: string,
  result: CheckResult,
  appUrl: string
): string {
  const timestamp = new Date().toUTCString();
  const settingsLink = `${appUrl}/settings`;

  let details = `
    <p><strong>Monitor:</strong> ${monitor.name}</p>
    <p><strong>URL:</strong> ${monitor.url}</p>
    <p><strong>Time:</strong> ${timestamp}</p>
  `;

  if (alertType === "DOWN") {
    details += `
      <p><strong>Status:</strong> DOWN</p>
      ${result.httpStatusCode ? `<p><strong>HTTP Status:</strong> ${result.httpStatusCode}</p>` : ""}
      ${result.errorType ? `<p><strong>Error:</strong> ${result.errorType}</p>` : ""}
      ${result.errorMessage ? `<p><strong>Details:</strong> ${result.errorMessage}</p>` : ""}
      ${result.latencyMs ? `<p><strong>Last Latency:</strong> ${result.latencyMs}ms</p>` : ""}
    `;
  } else if (alertType === "RECOVERY") {
    details += `
      <p><strong>Status:</strong> RECOVERED ✓</p>
      ${result.latencyMs ? `<p><strong>Latency:</strong> ${result.latencyMs}ms</p>` : ""}
    `;
  } else if (alertType === "TLS_EXPIRING" || alertType === "TLS_EXPIRED") {
    details += `
      <p><strong>TLS Days Remaining:</strong> ${result.tlsDaysRemaining}</p>
      ${result.tlsCertCn ? `<p><strong>Certificate CN:</strong> ${result.tlsCertCn}</p>` : ""}
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
    <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: ${alertType === "RECOVERY" ? "#16a34a" : "#dc2626"}">
        ${subject(monitor, alertType)}
      </h2>
      ${details}
      <hr>
      <p style="color: #6b7280; font-size: 12px;">
        You're receiving this because you manage monitors at ${appUrl}.
        <a href="${settingsLink}">Manage alert settings</a>
      </p>
    </body>
    </html>
  `;
}

export async function processSendAlert(job: Job<SendAlertJob>): Promise<void> {
  const { monitorId, alertType, checkResult } = job.data;
  const db = getDb();

  const [monitor] = await db
    .select()
    .from(monitors)
    .where(eq(monitors.id, monitorId))
    .limit(1);

  if (!monitor) return;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, monitor.userId))
    .limit(1);

  if (!user || user.emailSuppressed) return;

  const appUrl = process.env.APP_URL ?? "http://localhost:5173";
  const subjectLine = subject(monitor, alertType);
  const htmlBody = body(monitor, alertType, checkResult, appUrl);

  const recipients = [user.email, ...monitor.additionalEmails].join(",");

  if (process.env.SMTP_ENABLED !== "true") {
    console.log(`[email] SMTP disabled — skipping ${alertType} alert for "${monitor.name}" to ${recipients}`);
    return;
  }

  const transporter = createTransport();
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: recipients,
      subject: subjectLine,
      html: htmlBody,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Auth failures (535) are permanent — no point retrying with the same credentials
    if (msg.includes("535") || msg.includes("Invalid login") || msg.includes("Authentication failed")) {
      await db.insert(alertEvents).values({ monitorId, alertType, status: "failed", errorDetail: msg });
      throw new UnrecoverableError(`SMTP auth failed: ${msg}`);
    }
    throw err;
  }

  await db.insert(alertEvents).values({
    monitorId,
    alertType,
    status: "sent",
  });
}
