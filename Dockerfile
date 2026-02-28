# ── Stage 1: Install all dependencies ────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app

COPY package*.json ./
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/

RUN npm ci --workspace=packages/db --workspace=apps/api --workspace=apps/worker --ignore-scripts

# ── Stage 2: Build TypeScript ─────────────────────────────────────────────────
FROM base AS build
COPY packages/db/ ./packages/db/
COPY apps/api/ ./apps/api/
COPY apps/worker/ ./apps/worker/
COPY tsconfig.base.json ./

RUN npm run build -w packages/db && \
    npm run build -w apps/api && \
    npm run build -w apps/worker

# ── Stage 3: API runtime ──────────────────────────────────────────────────────
FROM node:20-alpine AS api
WORKDIR /app

COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]

# ── Stage 4: Worker runtime ───────────────────────────────────────────────────
FROM node:20-alpine AS worker
WORKDIR /app

COPY --from=build /app/apps/worker/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
