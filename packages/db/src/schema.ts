import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── users ───────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  fullName: text("full_name").notNull(),
  email: text("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("user"), // 'user' | 'admin'
  // 'unverified' | 'pending' | 'approved' | 'rejected' | 'suspended'
  status: text("status").notNull().default("unverified"),
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerificationToken: text("email_verification_token"),
  emailVerificationExpires: timestamp("email_verification_expires", {
    withTimezone: true,
  }),
  passwordResetToken: text("password_reset_token"),
  passwordResetExpires: timestamp("password_reset_expires", {
    withTimezone: true,
  }),
  rejectionReason: text("rejection_reason"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: uuid("approved_by"),
  emailSuppressed: boolean("email_suppressed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`NOW()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`NOW()`),
});

// ─── refresh_tokens ───────────────────────────────────────────────────────────
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").unique().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
  },
  (t) => [index("idx_refresh_tokens_user_id").on(t.userId)]
);

// ─── monitors ─────────────────────────────────────────────────────────────────
export const monitors = pgTable(
  "monitors",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    intervalMinutes: integer("interval_minutes").notNull().default(10),
    timeoutSeconds: integer("timeout_seconds").notNull().default(10),
    expectedStatus: text("expected_status").notNull().default("2xx_3xx"),
    keyword: text("keyword"),
    keywordCaseInsensitive: boolean("keyword_case_insensitive")
      .notNull()
      .default(false),
    tlsCheckEnabled: boolean("tls_check_enabled").notNull().default(true),
    tlsWarnDays: integer("tls_warn_days").notNull().default(10),
    dnsCheckEnabled: boolean("dns_check_enabled").notNull().default(false),
    additionalEmails: text("additional_emails")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),

    // Runtime state
    isPaused: boolean("is_paused").notNull().default(false),
    // 'UP' | 'DOWN' | 'UNKNOWN'
    currentStatus: text("current_status").notNull().default("UNKNOWN"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastLatencyMs: integer("last_latency_ms"),
    lastStatusChangedAt: timestamp("last_status_changed_at", {
      withTimezone: true,
    }),
    nextCheckAt: timestamp("next_check_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
    lastDownAlertSentAt: timestamp("last_down_alert_sent_at", {
      withTimezone: true,
    }),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),

    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
  },
  (t) => [
    index("idx_monitors_user_id").on(t.userId),
    index("idx_monitors_next_check_at").on(t.nextCheckAt),
  ]
);

// ─── monitor_checks ───────────────────────────────────────────────────────────
export const monitorChecks = pgTable(
  "monitor_checks",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    checkedAt: timestamp("checked_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
    status: text("status").notNull(), // 'UP' | 'DOWN'
    httpStatusCode: integer("http_status_code"),
    latencyMs: integer("latency_ms"),
    errorType: text("error_type"),
    errorMessage: text("error_message"),
    tlsDaysRemaining: integer("tls_days_remaining"),
    tlsCertCn: text("tls_cert_cn"),
    keywordMatch: boolean("keyword_match"),
    dnsResolvedIp: text("dns_resolved_ip"),
  },
  (t) => [
    index("idx_monitor_checks_monitor_id_checked_at").on(
      t.monitorId,
      t.checkedAt
    ),
  ]
);

// ─── alert_events ─────────────────────────────────────────────────────────────
export const alertEvents = pgTable(
  "alert_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    // 'DOWN' | 'RECOVERY' | 'TLS_EXPIRING' | 'TLS_EXPIRED'
    alertType: text("alert_type").notNull(),
    // 'sent' | 'failed'
    status: text("status").notNull().default("sent"),
    sentAt: timestamp("sent_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
    errorDetail: text("error_detail"),
  },
  (t) => [
    index("idx_alert_events_monitor_id_type_sent_at").on(
      t.monitorId,
      t.alertType,
      t.sentAt
    ),
  ]
);

// ─── admin_audit_log ──────────────────────────────────────────────────────────
export const adminAuditLog = pgTable("admin_audit_log", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: uuid("admin_id")
    .notNull()
    .references(() => users.id),
  targetUserId: uuid("target_user_id").references(() => users.id),
  action: text("action").notNull(), // 'approve' | 'reject' | 'suspend'
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`NOW()`),
});

// ─── worker_status ────────────────────────────────────────────────────────────
export const workerStatus = pgTable("worker_status", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  lastHeartbeatAt: timestamp("last_heartbeat_at", {
    withTimezone: true,
  }).notNull(),
});

// ─── Inferred types ───────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type Monitor = typeof monitors.$inferSelect;
export type NewMonitor = typeof monitors.$inferInsert;
export type MonitorCheck = typeof monitorChecks.$inferSelect;
export type NewMonitorCheck = typeof monitorChecks.$inferInsert;
export type AlertEvent = typeof alertEvents.$inferSelect;
export type AdminAuditLog = typeof adminAuditLog.$inferSelect;
