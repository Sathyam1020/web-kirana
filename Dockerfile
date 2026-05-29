# Backend service for Railway (and any container host).
#
# Built from the MONOREPO ROOT — the backend depends on the @workspace/shared
# workspace package, which npm only links when you install from the root. And
# @workspace/shared is consumed as TypeScript source, so we run the server with
# tsx (exactly like dev) instead of `node dist/...`.
#
# Railway: set the service Root Directory to the repo root (empty / "/"), NOT
# apps/backend — this Dockerfile needs the whole workspace as build context.

FROM node:20-slim
WORKDIR /app

# OpenSSL for Prisma.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Install the entire workspace (links @workspace/shared). Force dev deps so the
# build tools (tsx, prisma) are present even if NODE_ENV=production is set.
COPY . .
RUN npm ci --include=dev

# Generate the Prisma client (output is gitignored, so it must be built here).
# Prisma 7's config loader eagerly resolves env() — `prisma generate` doesn't
# connect, but the loader still demands the var. Railway doesn't pass service
# env vars into Docker builds, so give it a placeholder; the real DIRECT_URL
# injected at runtime overrides this ENV.
ENV DIRECT_URL="postgres://placeholder:placeholder@localhost:5432/placeholder"
RUN npm run db:generate --workspace=@workspace/backend

ENV NODE_ENV=production
WORKDIR /app/apps/backend

# Apply any pending migrations, then start the server. Railway injects PORT;
# the app reads process.env.PORT.
CMD ["sh", "-c", "npm run db:migrate:deploy && npx tsx src/server.ts"]
