Below is a solid **Requirements Document** for your SaaS "site health monitor" (Site24x7-lite) focused on **HTTP + latency + keyword + TLS expiry + optional DNS**, with **email alerts**, **user signup + captcha + admin approval**, and **URL checks + history (last 100)**.

---

# Requirements Document (Draft v1.1)

> **Revision notes (v1.1):** Added password reset, email verification, session model, CSRF protection, IDOR/ownership auth, scheduler recovery strategy, full DB schemas, alert flapping protection, admin bootstrap, complete API list, Docker-compose stack with Redis + worker + Nginx, and missing env vars. See §15 for full change log.

---

## Product Name

**Uptime & TLS Monitor (Working name)**

---

## 1. Purpose

Provide a SaaS platform where approved users can monitor up to ~50 websites for availability and basic "good standing" signals:

* HTTP status + response latency
* Keyword presence (optional)
* TLS certificate expiry (alert if expiring within N days)
* Optional DNS sanity checks
* Email alerts on failures and warnings

---

## 2. Goals

* Simple, reliable monitoring with minimal false positives
* Fast onboarding: signup → email verify → admin approval → add URLs → start monitoring
* Clear visibility into recent check results (last 100 per URL) with uptime % summary
* Flexible check intervals (5–30 minutes)
* Email-based alerting with spam/flapping protection

---

## 3. Non-Goals (v1)

* JavaScript injection/malware detection
* Full synthetic browser journeys (login flows)
* Multi-region probing / geo checks
* SMS/phone alerts (email only in v1)
* Advanced APM metrics (CPU/memory tracing)
* Public status page (v2)

---

## 4. Users & Roles

### 4.1 Roles

* **Visitor**: can view marketing pages, sign up.
* **Unverified User**: signed up but has not yet clicked the email verification link; cannot be approved.
* **Pending User**: email verified but awaiting admin approval; cannot add monitors.
* **Approved User**: can add/manage monitors, view history, configure alerts.
* **Suspended User**: account disabled by admin; cannot log in (existing session invalidated).
* **Admin**: can approve/disable users, view system health, see all monitors, edit global settings.

### 4.2 Authentication & Access Control

* Email + password login
* Captcha on signup (and optionally on login after N failed attempts)
* Email verification required before admin approval workflow begins
* Account approval required before access to monitoring features
* Role-based access control enforced server-side on every request
* All monitor CRUD endpoints must verify the requesting user owns the resource (IDOR protection); return `403 Forbidden` if ownership check fails. Use UUID primary keys for monitors to reduce enumeration risk.
* Suspended users are rejected at the session layer on every request (session invalidated server-side on suspension).

---

## 5. Core Features

## 5.1 Auth Workflows

### 5.1.1 Signup

* Fields: full name, email (unique), password, confirm password
* Captcha required
* On submit: create user with status = **Unverified**, send email verification link
* User sees: "Check your inbox to verify your email before your account can be reviewed."
* After email verification: user status becomes **Pending**; admin receives notification email

### 5.1.2 Email Verification

* On signup, send a signed link: `GET /api/auth/verify-email?token=<token>`
* Token: 32-byte `crypto.randomBytes`, base64url-encoded, stored hashed in DB
* Token TTL: 24 hours; single-use (deleted after first use)
* On success: status → Pending; redirect to "Pending approval" page
* On expired/invalid token: show error with option to resend verification email
* Resend endpoint: `POST /api/auth/resend-verification` (rate-limited: max 3 per hour per email)

### 5.1.3 Admin Approval

* Admin receives email when a new user completes email verification
* Admin UI shows Pending Users list
* Admin actions:
  * **Approve** — status → Approved; user receives approval email
  * **Reject** — status → Rejected (with optional reason); user receives rejection email
  * **Suspend** — status → Suspended; all active sessions invalidated immediately
* Approved users can log in and access the dashboard

### 5.1.4 Login

* Email + password
* Captcha after 3 consecutive failed attempts (per IP and per email, whichever fires first)
* Returns: access token (short-lived) + sets httpOnly refresh token cookie
* Rejected/Suspended users receive a clear `403` with a specific `error_code` (`ACCOUNT_REJECTED` or `ACCOUNT_SUSPENDED`) so the frontend can show an appropriate message instead of a generic auth error

### 5.1.5 Session Model

* **Access token**: JWT, signed with `JWT_SECRET`, expiry: **15 minutes**, includes `{ userId, role, status }`
* **Refresh token**: opaque 32-byte random token, stored hashed in `refresh_tokens` table, expiry: **7 days**, delivered as `httpOnly; Secure; SameSite=Strict` cookie
* On each refresh: validate token, recheck user `status` from DB (catches suspensions), issue new access token + rotate refresh token (refresh token rotation)
* On logout: delete refresh token from DB + clear cookie
* `POST /api/auth/logout` invalidates the refresh token server-side

### 5.1.6 Password Reset

* `POST /api/auth/forgot-password` — accepts `{ email }`, always returns `200` regardless of whether email exists (prevent enumeration); sends reset email if email is found
* Reset email contains a link: `GET /reset-password?token=<token>` (frontend handles routing)
* Token: 32-byte `crypto.randomBytes`, stored hashed in DB with `expires_at = NOW() + 1 hour`; single-use
* `POST /api/auth/reset-password` — accepts `{ token, newPassword }`, validates token, updates `password_hash`, deletes token, invalidates all active refresh tokens for this user
* Rate limit: `forgot-password` max 5 requests per 15 minutes per IP

### 5.1.7 Password Policy

* Password hashing: **argon2id** (preferred) or bcrypt (fallback)
* Minimum requirements:
  * 10 characters
  * At least 1 letter and 1 number
* Passwords are never logged or stored in plaintext

### 5.1.8 Admin Bootstrap

* On first startup, if no admin user exists, create one from env vars `ADMIN_EMAIL` + `ADMIN_PASSWORD`
* This bootstrap user has `status = approved`, `role = admin`, `email_verified = true`
* Bootstrap skips if an admin already exists (idempotent)
* Document this in the deployment README

---

## 5.2 Monitor Management (URL Checks)

### Add Monitor

Approved user can add a monitor with:

* Monitor name (friendly label)
* URL (required):
  * must start with `http://` or `https://`
  * must be parseable (valid hostname required, no embedded credentials, e.g. reject `http://user:pass@host`)
  * max length: 2048 characters
  * unicode/IDN hostnames: normalize to punycode before validation
* Check interval (required): **5, 10, 15, 30 minutes**
* Method: GET (v1 only)
* Timeout (optional): default 10 seconds, range 5–30 seconds
* Expected HTTP status (optional): default "any 2xx or 3xx"
* Keyword check (optional):
  * keyword string (max 500 characters)
  * match mode: "contains" (v1), case-insensitive toggle
* TLS expiry check:
  * enabled by default for `https://`
  * warn threshold: default **10 days** (user-configurable 1–60 days)
* DNS check (optional):
  * resolve A/AAAA records (basic sanity)
  * if DNS resolution fails entirely → DOWN
  * resolved IP stored in check log

### Monitor Limits

* v1: up to **50 monitors per user account** (configurable via `MAX_MONITORS_PER_USER` env var / admin setting)
* When limit is reached:
  * API returns `422` with `{ "error": "MONITOR_LIMIT_REACHED", "limit": 50 }`
  * UI: "Add Monitor" button is disabled with tooltip explaining the limit

### Edit Monitor

User can:

* change name, URL, interval, timeout, expected status
* toggle keyword / TLS / DNS checks
* change keyword string and case-sensitivity
* change TLS warn threshold
* add/remove additional alert email recipients
* pause/resume monitor

### Pause Behavior

* Paused monitors are excluded from the scheduler (`WHERE is_paused = false`)
* Dashboard shows paused monitors with a **PAUSED** status badge
* `current_status` is preserved from before pausing so state machine resumes correctly
* No checks run while paused; no alerts fire

### Delete Monitor

* Hard delete in v1 (simple); v2 considers soft delete with audit trail
* Associated check history (`monitor_checks`) deleted on cascade

### Status Determination (Authoritative Definition)

For each check run, the resulting status (`UP` or `DOWN`) is determined as follows:

| Condition | Status |
|---|---|
| DNS fails to resolve (if DNS check enabled) | DOWN |
| TCP connection timeout | DOWN |
| TLS handshake failure | DOWN |
| HTTP request timeout | DOWN |
| HTTP response status matches expected (default: 2xx or 3xx) | UP (so far) |
| HTTP response status does not match expected | DOWN |
| Keyword check enabled and keyword found | UP (so far) |
| Keyword check enabled and keyword not found | DOWN |
| TLS cert expired | DOWN |
| TLS cert expiring within threshold | UP + TLS warning |
| All checks pass | UP |

---

## 5.3 Monitoring Execution & Scheduling

### Scheduler

* Background scheduler polls the DB for monitors where `next_check_at <= NOW() AND is_paused = false AND deleted_at IS NULL`
* Scheduler poll frequency: every **30 seconds**
* After picking up a monitor for a check, atomically update `next_check_at = NOW() + interval` before executing the check (prevents duplicate execution across concurrent workers)
* Use `SELECT ... FOR UPDATE SKIP LOCKED` when using a cron+DB pattern; if using BullMQ, the native job lock handles this

### Scheduler Recovery (Restart Behavior)

* No backfill of missed checks on restart
* The `next_check_at` mechanism naturally skips missed windows: a monitor due at 10:05 that is picked up at 10:12 will next run at 10:12 + interval (not 10:15)
* This prevents thundering-herd on restart when many monitors are overdue simultaneously

### Retry / False Positive Control

* v1 default: **retry once after 60 seconds** before treating as DOWN and alerting (reduces false positives from transient blips)
* Retry is only for connectivity failures (DNS, timeout, TCP); HTTP 5xx responses also retry once
* If retry also fails → mark DOWN, update state, trigger alert if transition occurred
* Total time budget per check (both attempts): `2 * timeout + 60s` — the scheduler must account for this when sizing concurrency

### Check Types (per run)

For each run, record:

* DNS resolution result + resolved IP (if DNS check enabled)
* TCP connect + TLS handshake timing (if https)
* HTTP request timing + status
* Response body keyword scan result (if enabled)
* TLS expiry remaining days + cert common name (if https)

### Latency

Record:

* Total elapsed time (ms) from start of check to response received
* Optional breakdown in v1.1 (DNS/connect/TLS/TTFB)

---

## 5.4 Logs & History (Last 100 Entries)

For each monitor, show a table of **last 100 checks** with columns:

* Timestamp (UTC stored; displayed in user's local timezone)
* Status: **UP / DOWN**
* HTTP status code (if available)
* Latency (ms)
* Error type (enum, null if UP)
* Error description (string, null if UP)
* TLS days remaining (if https)
* Keyword result (pass/fail/n/a)
* Resolved IP (if DNS check enabled)

Retention:

* Keep last 100 checks per monitor in `monitor_checks`
* After each insert, trim old records: `DELETE FROM monitor_checks WHERE id NOT IN (SELECT id FROM monitor_checks WHERE monitor_id = $1 ORDER BY checked_at DESC LIMIT 100)`
* Optional: keep older checks in cold storage / archive table in v2

Dashboard summary shows **uptime % over last 24h** per monitor (calculated from check history).

---

## 5.5 Alerts (Email)

### Alert Types

* **Down alert**: monitor transitions UP → DOWN
* **Recovery alert**: monitor transitions DOWN → UP
* **TLS expiry warning**: cert expires within threshold (separate from DOWN; site may still be reachable)
* **Keyword mismatch alert**: keyword not found (if enabled) — treated as DOWN (see §5.2 Status Determination)

### Alert Rules

**State transitions:**

* DOWN alert fires when `current_status` transitions from `UP` (or `UNKNOWN`) → `DOWN`
* RECOVERY alert fires when `current_status` transitions from `DOWN` → `UP`
* Both alerts use the `alert_events` table to track what was sent and when

**Flapping / spam protection:**

* If a DOWN alert was already sent within the last **30 minutes** for this monitor, suppress the next DOWN alert (the monitor is flapping)
* If a monitor goes DOWN → UP in under 1 check cycle with no alert sent, suppress the RECOVERY alert
* Suppression state tracked via `last_down_alert_sent_at` column on the monitor

**TLS warning:**

* Fire TLS warning at most **once per 24 hours** per monitor while cert is within threshold
* Check `alert_events` for `alert_type = 'TLS_EXPIRING'` sent within last 24h before sending
* An already-expired TLS cert (`TLS_CERT_EXPIRED`) is treated as a DOWN event (separate from TLS warning)

**Keyword mismatch:**

* Keyword failure → DOWN status → DOWN alert fires (subject to flapping protection above)
* When keyword returns → RECOVERY alert fires
* No separate keyword-specific alert channel in v1 (keyword failure = DOWN)

### Email Failure Handling

* Email sends are queued as BullMQ jobs
* Retry policy: max 3 attempts with exponential backoff (30s, 2m, 10m)
* After max retries: mark `alert_events.status = 'FAILED'`, log error; do not re-alert on next check cycle
* Dead-letter queue for permanently failed alert jobs

### Email Recipients

* Primary: account email
* v1: additional alert emails stored per monitor as a Postgres `TEXT[]` column (max 10 addresses)
* UI: comma-separated input on monitor create/edit form; stored as array in DB

### Email Templates

Branded subject lines, e.g.:

* `[DOWN] My Blog (https://myblog.com) is not responding`
* `[RECOVERED] My Blog is back up`
* `[TLS WARNING] My Blog cert expires in 7 days`

Body includes:

* URL, timestamp (UTC), status, error details, last latency, next check time
* For TLS: expiry date, days remaining, cert CN
* Footer: "You're receiving this because you manage monitors at [APP_URL]. Manage alert settings: [link]"

---

## 6. Admin Features

* Approve / reject (with reason) / suspend users
* View all users (all statuses), sortable/filterable
* View all monitors across all users (read-only)
* Global settings (persisted in DB, overridable via env var for defaults):
  * default check interval options
  * default TLS warning days
  * max monitors per user
* System health page:
  * worker process status (last heartbeat)
  * scheduler last run timestamp
  * queue depth (jobs pending / active / failed)
  * DB row counts (total monitors, total checks today)
* Admin audit log: every approve/reject/suspend action recorded with admin user, target user, timestamp, and reason

---

## 7. UI Requirements (React)

### Pages

* Landing page (marketing)
* Signup
* Email verification pending ("check your inbox")
* Login
* Forgot password
* Reset password
* Pending approval
* Account suspended/rejected
* Dashboard (monitor list)
* Monitor detail page (config summary + logs table)
* Add / Edit monitor form
* User settings (change email preferences, alert recipients, password)
* Admin panel (user list, approve/reject/suspend, system health, global settings)
* 404 Not Found
* Generic error page

### Dashboard Requirements

* Table of monitors:
  * Name, URL, current status (UP / DOWN / PAUSED / UNKNOWN), last checked, last latency, uptime % (24h), TLS days remaining, interval, actions
* Quick filters: All / Up / Down / Paused / Expiring soon (TLS < 10 days)
* Empty state: "You have no monitors yet. [Add your first monitor →]"
* Add Monitor CTA button (disabled with tooltip when limit reached)

### Monitor Detail Requirements

* Config summary header: URL, interval, checks enabled, current status badge, "down since" duration if DOWN
* Action buttons: Edit, Pause/Resume, Delete, Run Check Now (v1.1)
* Table of last 100 checks (columns per §5.4)
* Uptime % and average latency summary for the displayed period

---

## 8. Backend Requirements (Node.js)

### Full API Endpoint List

**Auth:**

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/signup` | Register new user |
| `POST` | `/api/auth/login` | Login, return access token + set refresh cookie |
| `POST` | `/api/auth/logout` | Invalidate refresh token |
| `POST` | `/api/auth/refresh` | Rotate refresh token, return new access token |
| `GET` | `/api/auth/verify-email` | Verify email with token |
| `POST` | `/api/auth/resend-verification` | Resend verification email |
| `POST` | `/api/auth/forgot-password` | Send password reset email |
| `POST` | `/api/auth/reset-password` | Reset password with token |

**User:**

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/me` | Get current user profile |
| `PUT` | `/api/me` | Update profile (name, notification emails) |
| `PUT` | `/api/me/password` | Change password (requires current password) |

**Monitors:**

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/monitors` | Create monitor |
| `GET` | `/api/monitors` | List user's monitors |
| `GET` | `/api/monitors/:id` | Get monitor detail + config |
| `PUT` | `/api/monitors/:id` | Update monitor config |
| `DELETE` | `/api/monitors/:id` | Delete monitor |
| `POST` | `/api/monitors/:id/pause` | Pause monitor |
| `POST` | `/api/monitors/:id/resume` | Resume monitor |
| `POST` | `/api/monitors/:id/run` | Trigger immediate check (v1.1) |
| `GET` | `/api/monitors/:id/checks` | Get check history (`?limit=100`) |

**Admin:**

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/admin/users` | List users (filterable by status) |
| `POST` | `/api/admin/users/:id/approve` | Approve user |
| `POST` | `/api/admin/users/:id/reject` | Reject user (body: `{ reason }`) |
| `POST` | `/api/admin/users/:id/suspend` | Suspend user |
| `GET` | `/api/admin/monitors` | List all monitors (read-only) |
| `GET` | `/api/admin/settings` | Get global settings |
| `PUT` | `/api/admin/settings` | Update global settings |
| `GET` | `/api/admin/health` | System health stats |
| `GET` | `/api/admin/audit-log` | View admin audit log |

### Background Worker

* Separate Node.js process from the API server (separate Docker service)
* Performs checks and writes to `monitor_checks`
* Evaluates state changes: atomically updates `current_status` on `monitors` and detects UP/DOWN transitions
* Triggers alert email jobs on transitions (queued via BullMQ)
* Worker heartbeat: writes `last_heartbeat_at` to a `worker_status` table every 30 seconds; admin health endpoint reads this

### Storage

* Database: **Postgres**
* Cache / job queue: **Redis** (required for BullMQ)

#### `users` table

```sql
CREATE TABLE users (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name                   TEXT NOT NULL,
  email                       TEXT UNIQUE NOT NULL,
  password_hash               TEXT NOT NULL,
  role                        TEXT NOT NULL DEFAULT 'user', -- 'user' | 'admin'
  status                      TEXT NOT NULL DEFAULT 'unverified', -- 'unverified' | 'pending' | 'approved' | 'rejected' | 'suspended'
  email_verified              BOOLEAN NOT NULL DEFAULT false,
  email_verification_token    TEXT,         -- stored hashed
  email_verification_expires  TIMESTAMPTZ,
  password_reset_token        TEXT,         -- stored hashed
  password_reset_expires      TIMESTAMPTZ,
  rejection_reason            TEXT,
  approved_at                 TIMESTAMPTZ,
  approved_by                 UUID REFERENCES users(id),
  email_suppressed            BOOLEAN NOT NULL DEFAULT false, -- bounce/complaint
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `refresh_tokens` table

```sql
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON refresh_tokens (user_id);
```

#### `monitors` table

```sql
CREATE TABLE monitors (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  url                     TEXT NOT NULL,
  interval_minutes        INTEGER NOT NULL DEFAULT 10,  -- 5 | 10 | 15 | 30
  timeout_seconds         INTEGER NOT NULL DEFAULT 10,
  expected_status         TEXT NOT NULL DEFAULT '2xx_3xx',
  keyword                 TEXT,
  keyword_case_insensitive BOOLEAN NOT NULL DEFAULT false,
  tls_check_enabled       BOOLEAN NOT NULL DEFAULT true,
  tls_warn_days           INTEGER NOT NULL DEFAULT 10,
  dns_check_enabled       BOOLEAN NOT NULL DEFAULT false,
  additional_emails       TEXT[] NOT NULL DEFAULT '{}',

  is_paused               BOOLEAN NOT NULL DEFAULT false,
  current_status          TEXT NOT NULL DEFAULT 'UNKNOWN',  -- 'UP' | 'DOWN' | 'UNKNOWN'
  last_checked_at         TIMESTAMPTZ,
  last_latency_ms         INTEGER,
  last_status_changed_at  TIMESTAMPTZ,
  next_check_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_down_alert_sent_at TIMESTAMPTZ,  -- flapping protection
  consecutive_failures    INTEGER NOT NULL DEFAULT 0,

  deleted_at              TIMESTAMPTZ,  -- soft delete optional in v2
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON monitors (user_id);
CREATE INDEX ON monitors (next_check_at) WHERE is_paused = false AND deleted_at IS NULL;
```

#### `monitor_checks` table

```sql
CREATE TABLE monitor_checks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id       UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  checked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status           TEXT NOT NULL,  -- 'UP' | 'DOWN'
  http_status_code INTEGER,
  latency_ms       INTEGER,
  error_type       TEXT,           -- enum values from §9
  error_message    TEXT,
  tls_days_remaining INTEGER,
  tls_cert_cn      TEXT,
  keyword_match    BOOLEAN,        -- null if keyword check not enabled
  dns_resolved_ip  TEXT            -- null if DNS check not enabled
);
CREATE INDEX ON monitor_checks (monitor_id, checked_at DESC);
```

#### `alert_events` table (required, not optional)

```sql
CREATE TABLE alert_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id   UUID NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  alert_type   TEXT NOT NULL,  -- 'DOWN' | 'RECOVERY' | 'TLS_EXPIRING' | 'TLS_EXPIRED'
  status       TEXT NOT NULL DEFAULT 'sent',  -- 'sent' | 'failed'
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_detail TEXT
);
CREATE INDEX ON alert_events (monitor_id, alert_type, sent_at DESC);
```

#### `admin_audit_log` table

```sql
CREATE TABLE admin_audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     UUID NOT NULL REFERENCES users(id),
  target_user_id UUID REFERENCES users(id),
  action       TEXT NOT NULL,  -- 'approve' | 'reject' | 'suspend'
  reason       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `worker_status` table

```sql
CREATE TABLE worker_status (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  last_heartbeat_at TIMESTAMPTZ NOT NULL
);
```

---

## 9. Error Types (Enum)

Stored in `monitor_checks.error_type`:

* `DNS_FAILURE` — hostname could not be resolved
* `TCP_CONNECT_TIMEOUT` — TCP connection timed out
* `TCP_CONNECT_REFUSED` — connection refused
* `TLS_HANDSHAKE_FAILED` — TLS negotiation failed
* `TLS_CERT_EXPIRED` — certificate is already past expiry
* `TLS_CERT_EXPIRING_SOON` — cert is valid but within warn threshold (status = UP)
* `HTTP_TIMEOUT` — request sent but no response within timeout
* `HTTP_STATUS_UNEXPECTED` — response received but HTTP status doesn't match expected
* `KEYWORD_NOT_FOUND` — HTTP success but keyword absent in response body
* `REDIRECT_LIMIT_EXCEEDED` — too many redirects (default max: 10)
* `UNKNOWN_ERROR` — unexpected error; log full message

---

## 10. Security & Compliance (v1)

* **Password hashing**: argon2id (preferred), bcrypt as fallback
* **JWT signing**: RS256 or HS256 with a long random `JWT_SECRET`; access token expiry 15 min
* **Refresh tokens**: httpOnly + Secure + SameSite=Strict cookie; stored hashed in DB
* **CSRF protection**: Because access tokens are sent via Authorization header (not cookies), CSRF is not applicable to API endpoints. Confirm this choice in implementation; if cookies are used for access token delivery, implement Double Submit Cookie CSRF protection.
* **IDOR protection**: every monitor endpoint validates `monitor.user_id = req.user.id`; UUID IDs reduce enumeration risk
* **Rate limiting** (per IP, unless noted):
  * `POST /api/auth/signup`: 10/hour
  * `POST /api/auth/login`: 20/hour
  * `POST /api/auth/forgot-password`: 5/15min
  * `POST /api/auth/resend-verification`: 3/hour per email
  * All authenticated endpoints: 300/minute per user
* **Input validation**: validate and sanitize all inputs server-side; use parameterized queries (no raw string SQL)
* **HTTP security headers**: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy` (strict policy for admin/dashboard pages)
* **SSRF prevention** (applied before any outbound HTTP check):
  * Block internal IP ranges: `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`, `fc00::/7`
  * Disallow schemes other than `http://` and `https://`
  * DNS rebinding protection: resolve hostname, check resolved IP against blocklist, then connect to IP directly
  * Strip embedded credentials from URLs
* **Secrets**: all secrets in env vars, never logged
* **Audit logging**: all admin actions written to `admin_audit_log`
* **Email bounces**: process SMTP bounce/complaint webhooks; set `email_suppressed = true` on affected users to prevent future sends
* **Data privacy**: define a data retention/deletion policy (v1: manual on request; v2: self-service account deletion)
* **Captcha**: reCAPTCHA v3 or hCaptcha on signup; optionally on login after 3 failures

---

## 11. Performance & Reliability

* Must handle:
  * 50 monitors per user
  * Initial target: 100 users (5,000 monitors)
* Worker concurrency: configurable via `WORKER_CONCURRENCY` env var (default: 10 parallel checks)
* Timeouts enforced: request timeout default 10s (configurable per monitor)
* Avoid blocking event loop: use async HTTP client (e.g., `undici` or `axios`)
* DB connection pooling: use `pg-pool` with pool size tuned to environment
* Scheduler poll query indexed on `next_check_at` (see schema)
* Retry once before DOWN (reduces false alerts); total latency budget per check ≤ `2 * timeout + 60s`
* **Observability**: structured JSON logs to stdout (`LOG_LEVEL` env var: debug/info/warn/error); worker emits heartbeat every 30s; admin health endpoint exposes worker + queue metrics

---

## 12. Configurations (Environment Variables)

All services share a common `.env` file; document in `.env.example`.

| Variable | Required | Default | Used By | Description |
|---|---|---|---|---|
| `NODE_ENV` | Yes | — | api, worker | `production` / `development` |
| `PORT` | No | `3000` | api | API server port |
| `DATABASE_URL` | Yes | — | api, worker | Postgres connection URL |
| `REDIS_URL` | Yes | — | api, worker | Redis connection URL for BullMQ |
| `JWT_SECRET` | Yes | — | api | Secret for signing JWTs (min 32 chars) |
| `SESSION_COOKIE_DOMAIN` | No | — | api | Cookie domain for refresh token |
| `APP_URL` | Yes | — | api, worker | Base URL for email links (e.g. `https://monitor.example.com`) |
| `ADMIN_EMAIL` | Yes | — | api | Bootstrap admin email |
| `ADMIN_PASSWORD` | Yes | — | api | Bootstrap admin password |
| `SMTP_HOST` | Yes | — | worker | SMTP host |
| `SMTP_PORT` | No | `587` | worker | SMTP port |
| `SMTP_USER` | Yes | — | worker | SMTP username |
| `SMTP_PASS` | Yes | — | worker | SMTP password |
| `SMTP_FROM` | Yes | — | worker | From address for alert emails |
| `CAPTCHA_PROVIDER` | No | `hcaptcha` | api | `recaptcha` or `hcaptcha` |
| `CAPTCHA_SECRET` | Yes | — | api | Captcha server-side secret |
| `CAPTCHA_SITE_KEY` | Yes | — | frontend | Captcha client-side key |
| `WORKER_CONCURRENCY` | No | `10` | worker | Parallel check limit |
| `MAX_MONITORS_PER_USER` | No | `50` | api, worker | Monitor limit (overrides DB admin setting) |
| `DEFAULT_TLS_WARN_DAYS` | No | `10` | api | Default TLS warning threshold |
| `DEFAULT_CHECK_INTERVAL` | No | `10` | api | Default interval in minutes |
| `LOG_LEVEL` | No | `info` | api, worker | Logging verbosity |

---

## 13. Acceptance Criteria (v1)

1. User can sign up with captcha; cannot log in or access monitoring until email is verified AND admin approves.
2. Admin receives email notification when a new user verifies their email.
3. Admin can approve, reject (with reason), or suspend a user.
4. Suspended user's active sessions are invalidated immediately.
5. Approved user can log in, create a monitor with interval + keyword + TLS warn threshold + additional recipients.
6. API returns `422 MONITOR_LIMIT_REACHED` and UI disables "Add Monitor" when limit is reached.
7. User A cannot read, modify, or delete User B's monitors (IDOR protection verified).
8. System performs checks at configured interval; missed checks are not backfilled on worker restart.
9. Monitor detail shows last 100 checks with all columns defined in §5.4.
10. Dashboard shows current status, last latency, and 24h uptime % for each monitor.
11. DOWN alert fires on first DOWN detection; does not re-fire within 30 minutes (flapping protection).
12. RECOVERY alert fires when monitor returns UP after being DOWN.
13. TLS expiry warning fires at most once per 24h while cert is within threshold.
14. Keyword mismatch is treated as DOWN; triggers DOWN alert (subject to flapping rules).
15. An expired TLS cert triggers a DOWN event.
16. Retry once (after 60s) before marking DOWN; alert only fires after retry also fails.
17. Failed alert emails are retried 3 times and logged to `alert_events` as FAILED; no re-alert on next check.
18. Admin can view and edit global settings (max monitors, default TLS warn days).
19. All admin approve/reject/suspend actions are recorded in `admin_audit_log`.
20. SSRF protections block requests to internal IP ranges and non-http(s) schemes.
21. Rate limits are enforced on signup, login, forgot-password, and resend-verification endpoints.
22. Password reset flow works end-to-end; all active sessions for the user are invalidated after reset.
23. Paused monitors do not run checks; resume restores correct prior state.
24. Docker-compose `up` starts all 5 services (db, redis, api, worker, nginx) with correct dependency ordering.

---

## 14. Deployment

### Docker Compose Services

```yaml
services:
  db:
    image: postgres:16
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: monitor
      POSTGRES_USER: monitor
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U monitor"]
      interval: 10s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      retries: 5
    restart: unless-stopped

  api:
    build:
      context: .
      target: api
    env_file: .env
    depends_on:
      db: { condition: service_healthy }
      redis: { condition: service_healthy }
    restart: unless-stopped

  worker:
    build:
      context: .
      target: worker
    env_file: .env
    depends_on:
      db: { condition: service_healthy }
      redis: { condition: service_healthy }
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./frontend/build:/usr/share/nginx/html:ro
      - certs:/etc/nginx/certs
    depends_on:
      - api
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
  certs:
```

### Dockerfile Strategy

* Multi-stage Dockerfile: `base` → `api` target (Node.js API server) + `worker` target (Node.js worker process)
* React frontend: built with `npm run build` and served as static files via Nginx
* Nginx proxies `/api/` to the `api` container; all other paths serve the React app

### First-Run Setup

1. Copy `.env.example` → `.env` and fill in all required variables
2. `docker-compose up -d` — starts all services; migrations run on API startup
3. Admin user is bootstrapped automatically from `ADMIN_EMAIL` + `ADMIN_PASSWORD` if no admin exists

---

## 15. Change Log

| Version | Changes |
|---|---|
| v1.0 | Initial draft |
| v1.1 | Added: email verification flow (§5.1.2); password reset flow (§5.1.6); session model with JWT + refresh tokens (§5.1.5); admin bootstrap (§5.1.8); CSRF analysis (§10); IDOR protection spec (§4.2, §10); scheduler recovery / `next_check_at` pattern (§5.3); flapping protection (§5.5); alert email failure handling (§5.5); keyword alert rules clarified (§5.5); full DB schemas for all tables (§8); complete API endpoint table (§8); Status Determination decision table (§5.2); pause behavior spec (§5.2); monitor limit enforcement spec (§5.2); `REDIRECT_LIMIT_EXCEEDED` error type (§9); HTTP security headers (§10); full rate limit table (§10); full env var table (§12); missing env vars added (§12); docker-compose expanded to 5 services (§14); 24 acceptance criteria (§13); observability spec (§11); empty state and missing UI pages added (§7) |
