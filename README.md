# Uptime & TLS Monitor

**A lightweight SaaS monitoring platform** — HTTP status, latency, TLS expiry, keyword presence, and optional DNS checks with email alerts.

## 🚀 Quick Start

```bash
# Setup
cp .env.example .env
# Fill in required vars: DATABASE_URL, REDIS_URL, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, SMTP_*, CAPTCHA_*

# Run
docker-compose up -d
```

Admin bootstrap: auto-creates admin user from `ADMIN_EMAIL` + `ADMIN_PASSWORD`.

## 📋 Features

- **Monitoring**: HTTP (2xx/3xx), latency, keyword search, TLS cert expiry, DNS resolution
- **Auth**: Email signup → verification → admin approval workflow
- **Alerts**: Email on DOWN/RECOVERY/TLS warnings with 30-min flapping protection
- **History**: Last 100 checks per monitor; 24h uptime %
- **Admin**: User management, global settings, audit log, health dashboard
- **Security**: SSRF prevention, rate limiting, IDOR protection, argon2id hashing

## 🛠 Tech Stack

- **Backend**: Node.js + Express
- **DB**: PostgreSQL + Redis (BullMQ queue)
- **Frontend**: React
- **Deployment**: Docker Compose (5 services: db, redis, api, worker, nginx)

## 📡 API Overview

**Auth**: `/api/auth/{signup,login,logout,refresh,verify-email,resend-verification,forgot-password,reset-password}`

**User**: `/api/me` (profile, password)

**Monitors**: `/api/monitors` (CRUD, pause/resume, run check, history)

**Admin**: `/api/admin/{users,monitors,settings,health,audit-log}`

## ⚙️ Key Defaults

- Check interval: 5/10/15/30 min
- Timeout: 10s per check
- TLS warn threshold: 10 days
- Monitors per user: 50 (configurable)
- Retry once after 60s before DOWN
- Flapping protection: 30 min
- Alert retention: 3 retries, exponential backoff

## 📚 Full Documentation

See [requirement.md](./requirement.md) for comprehensive spec including all acceptance criteria, DB schema, error types, and deployment details.

## 🔐 Security Highlights

- JWT (15min) + refresh tokens (7day, httpOnly)
- Captcha on signup
- SSRF + DNS rebinding protection
- Rate limits: signup (10/h), login (20/h), forgot-password (5/15min)
- Input validation + parameterized queries

## 🚢 Docker Compose

```yaml
services:
  db: postgres:16
  redis: redis:7-alpine
  api: Node.js API server
  worker: Node.js background worker
  nginx: Static frontend + reverse proxy
```

Healthchecks ensure correct startup order.
