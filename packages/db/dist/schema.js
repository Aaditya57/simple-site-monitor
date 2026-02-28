"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workerStatus = exports.adminAuditLog = exports.alertEvents = exports.monitorChecks = exports.monitors = exports.refreshTokens = exports.users = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
// ─── users ───────────────────────────────────────────────────────────────────
exports.users = (0, pg_core_1.pgTable)("users", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    fullName: (0, pg_core_1.text)("full_name").notNull(),
    email: (0, pg_core_1.text)("email").unique().notNull(),
    passwordHash: (0, pg_core_1.text)("password_hash").notNull(),
    role: (0, pg_core_1.text)("role").notNull().default("user"), // 'user' | 'admin'
    // 'unverified' | 'pending' | 'approved' | 'rejected' | 'suspended'
    status: (0, pg_core_1.text)("status").notNull().default("unverified"),
    emailVerified: (0, pg_core_1.boolean)("email_verified").notNull().default(false),
    emailVerificationToken: (0, pg_core_1.text)("email_verification_token"),
    emailVerificationExpires: (0, pg_core_1.timestamp)("email_verification_expires", {
        withTimezone: true,
    }),
    passwordResetToken: (0, pg_core_1.text)("password_reset_token"),
    passwordResetExpires: (0, pg_core_1.timestamp)("password_reset_expires", {
        withTimezone: true,
    }),
    rejectionReason: (0, pg_core_1.text)("rejection_reason"),
    approvedAt: (0, pg_core_1.timestamp)("approved_at", { withTimezone: true }),
    approvedBy: (0, pg_core_1.uuid)("approved_by"),
    emailSuppressed: (0, pg_core_1.boolean)("email_suppressed").notNull().default(false),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
        .notNull()
        .default((0, drizzle_orm_1.sql) `NOW()`),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
        .notNull()
        .default((0, drizzle_orm_1.sql) `NOW()`),
});
// ─── refresh_tokens ───────────────────────────────────────────────────────────
exports.refreshTokens = (0, pg_core_1.pgTable)("refresh_tokens", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.uuid)("user_id")
        .notNull()
        .references(() => exports.users.id, { onDelete: "cascade" }),
    tokenHash: (0, pg_core_1.text)("token_hash").unique().notNull(),
    expiresAt: (0, pg_core_1.timestamp)("expires_at", { withTimezone: true }).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
        .notNull()
        .default((0, drizzle_orm_1.sql) `NOW()`),
}, (t) => [(0, pg_core_1.index)("idx_refresh_tokens_user_id").on(t.userId)]);
// ─── monitors ─────────────────────────────────────────────────────────────────
exports.monitors = (0, pg_core_1.pgTable)("monitors", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    userId: (0, pg_core_1.uuid)("user_id")
        .notNull()
        .references(() => exports.users.id, { onDelete: "cascade" }),
    name: (0, pg_core_1.text)("name").notNull(),
    url: (0, pg_core_1.text)("url").notNull(),
    intervalMinutes: (0, pg_core_1.integer)("interval_minutes").notNull().default(10),
    timeoutSeconds: (0, pg_core_1.integer)("timeout_seconds").notNull().default(10),
    expectedStatus: (0, pg_core_1.text)("expected_status").notNull().default("2xx_3xx"),
    keyword: (0, pg_core_1.text)("keyword"),
    keywordCaseInsensitive: (0, pg_core_1.boolean)("keyword_case_insensitive")
        .notNull()
        .default(false),
    tlsCheckEnabled: (0, pg_core_1.boolean)("tls_check_enabled").notNull().default(true),
    tlsWarnDays: (0, pg_core_1.integer)("tls_warn_days").notNull().default(10),
    dnsCheckEnabled: (0, pg_core_1.boolean)("dns_check_enabled").notNull().default(false),
    additionalEmails: (0, pg_core_1.text)("additional_emails")
        .array()
        .notNull()
        .default((0, drizzle_orm_1.sql) `'{}'::text[]`),
    // Runtime state
    isPaused: (0, pg_core_1.boolean)("is_paused").notNull().default(false),
    // 'UP' | 'DOWN' | 'UNKNOWN'
    currentStatus: (0, pg_core_1.text)("current_status").notNull().default("UNKNOWN"),
    lastCheckedAt: (0, pg_core_1.timestamp)("last_checked_at", { withTimezone: true }),
    lastLatencyMs: (0, pg_core_1.integer)("last_latency_ms"),
    lastStatusChangedAt: (0, pg_core_1.timestamp)("last_status_changed_at", {
        withTimezone: true,
    }),
    nextCheckAt: (0, pg_core_1.timestamp)("next_check_at", { withTimezone: true })
        .notNull()
        .default((0, drizzle_orm_1.sql) `NOW()`),
    lastDownAlertSentAt: (0, pg_core_1.timestamp)("last_down_alert_sent_at", {
        withTimezone: true,
    }),
    consecutiveFailures: (0, pg_core_1.integer)("consecutive_failures").notNull().default(0),
    deletedAt: (0, pg_core_1.timestamp)("deleted_at", { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
        .notNull()
        .default((0, drizzle_orm_1.sql) `NOW()`),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { withTimezone: true })
        .notNull()
        .default((0, drizzle_orm_1.sql) `NOW()`),
}, (t) => [
    (0, pg_core_1.index)("idx_monitors_user_id").on(t.userId),
    (0, pg_core_1.index)("idx_monitors_next_check_at").on(t.nextCheckAt),
]);
// ─── monitor_checks ───────────────────────────────────────────────────────────
exports.monitorChecks = (0, pg_core_1.pgTable)("monitor_checks", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    monitorId: (0, pg_core_1.uuid)("monitor_id")
        .notNull()
        .references(() => exports.monitors.id, { onDelete: "cascade" }),
    checkedAt: (0, pg_core_1.timestamp)("checked_at", { withTimezone: true })
        .notNull()
        .default((0, drizzle_orm_1.sql) `NOW()`),
    status: (0, pg_core_1.text)("status").notNull(), // 'UP' | 'DOWN'
    httpStatusCode: (0, pg_core_1.integer)("http_status_code"),
    latencyMs: (0, pg_core_1.integer)("latency_ms"),
    errorType: (0, pg_core_1.text)("error_type"),
    errorMessage: (0, pg_core_1.text)("error_message"),
    tlsDaysRemaining: (0, pg_core_1.integer)("tls_days_remaining"),
    tlsCertCn: (0, pg_core_1.text)("tls_cert_cn"),
    keywordMatch: (0, pg_core_1.boolean)("keyword_match"),
    dnsResolvedIp: (0, pg_core_1.text)("dns_resolved_ip"),
}, (t) => [
    (0, pg_core_1.index)("idx_monitor_checks_monitor_id_checked_at").on(t.monitorId, t.checkedAt),
]);
// ─── alert_events ─────────────────────────────────────────────────────────────
exports.alertEvents = (0, pg_core_1.pgTable)("alert_events", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    monitorId: (0, pg_core_1.uuid)("monitor_id")
        .notNull()
        .references(() => exports.monitors.id, { onDelete: "cascade" }),
    // 'DOWN' | 'RECOVERY' | 'TLS_EXPIRING' | 'TLS_EXPIRED'
    alertType: (0, pg_core_1.text)("alert_type").notNull(),
    // 'sent' | 'failed'
    status: (0, pg_core_1.text)("status").notNull().default("sent"),
    sentAt: (0, pg_core_1.timestamp)("sent_at", { withTimezone: true })
        .notNull()
        .default((0, drizzle_orm_1.sql) `NOW()`),
    errorDetail: (0, pg_core_1.text)("error_detail"),
}, (t) => [
    (0, pg_core_1.index)("idx_alert_events_monitor_id_type_sent_at").on(t.monitorId, t.alertType, t.sentAt),
]);
// ─── admin_audit_log ──────────────────────────────────────────────────────────
exports.adminAuditLog = (0, pg_core_1.pgTable)("admin_audit_log", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    adminId: (0, pg_core_1.uuid)("admin_id")
        .notNull()
        .references(() => exports.users.id),
    targetUserId: (0, pg_core_1.uuid)("target_user_id").references(() => exports.users.id),
    action: (0, pg_core_1.text)("action").notNull(), // 'approve' | 'reject' | 'suspend'
    reason: (0, pg_core_1.text)("reason"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { withTimezone: true })
        .notNull()
        .default((0, drizzle_orm_1.sql) `NOW()`),
});
// ─── worker_status ────────────────────────────────────────────────────────────
exports.workerStatus = (0, pg_core_1.pgTable)("worker_status", {
    id: (0, pg_core_1.uuid)("id").primaryKey().default((0, drizzle_orm_1.sql) `gen_random_uuid()`),
    lastHeartbeatAt: (0, pg_core_1.timestamp)("last_heartbeat_at", {
        withTimezone: true,
    }).notNull(),
});
//# sourceMappingURL=schema.js.map