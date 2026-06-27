# syntax=docker/dockerfile:1.7
#
# Backend image for Railway. Multi-stage to keep dev deps out of the
# runtime image; layers ordered so npm install caches across source
# changes; runs on tsx (the repo's @workspace/shared is consumed as
# TypeScript and that contract is shared with 3 Next.js apps).

# -------- builder: install + prisma generate + prune ---------------------
FROM node:20-slim AS builder
WORKDIR /repo

RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Manifests first → npm install layer reuses across source-only changes.
COPY package.json package-lock.json turbo.json ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/shared/package.json ./packages/shared/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/eslint-config/package.json ./packages/eslint-config/

# Filtered install: only the backend workspace + its workspace siblings
# (skips customer/owner/admin Next.js trees). --include=dev because we
# need prisma CLI for `prisma generate`; we prune afterwards.
RUN npm ci --workspace=@workspace/backend --include-workspace-root \
           --include=dev --no-audit --no-fund

# Source for the workspaces we actually build.
COPY apps/backend ./apps/backend
COPY packages/shared ./packages/shared
COPY packages/typescript-config ./packages/typescript-config

# `prisma generate` resolves env() eagerly via prisma.config.ts; the
# placeholder is overwritten by Railway's real DIRECT_URL at runtime.
ENV DIRECT_URL="postgres://placeholder:placeholder@localhost:5432/placeholder"
RUN npm run db:generate --workspace=@workspace/backend

# Strip dev deps in place. tsx + prisma stay because they're declared
# in `dependencies` (needed at runtime: tsx runs the server, prisma
# runs migrations on container boot via scripts/deploy-start.sh).
RUN npm prune --omit=dev --workspace=@workspace/backend --include-workspace-root

# -------- runtime: minimal, non-root, init process -----------------------
FROM node:20-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates dumb-init \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd -r app && useradd -r -g app -m -d /home/app -s /usr/sbin/nologin app

ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

COPY --chown=app:app --from=builder /repo/node_modules ./node_modules
COPY --chown=app:app --from=builder /repo/package.json /repo/package-lock.json /repo/turbo.json ./
COPY --chown=app:app --from=builder /repo/apps/backend ./apps/backend
COPY --chown=app:app --from=builder /repo/packages/shared ./packages/shared
COPY --chown=app:app --from=builder /repo/packages/typescript-config ./packages/typescript-config

USER app
WORKDIR /app/apps/backend

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "scripts/deploy-start.sh"]
