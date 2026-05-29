# Kirana backend

Express 5 + Prisma 7 + Neon Postgres (PostGIS + pg_trgm) API for the kirana
marketplace. Serves the customer / owner / admin frontends.

> **Build history & deep context:** see [`PROGRESS.md`](./PROGRESS.md) — the
> phase-by-phase tracker with every locked decision, gotcha, and design doc
> (`PHASE7.md`…`PHASE11.md`). Read it before non-trivial changes.

## Stack

Node 20+ · Express 5 · Prisma 7 (`@prisma/adapter-neon`) · better-auth (cookie
sessions) · Socket.IO (real-time) · node-cron (jobs) · web-push + WhatsApp Cloud
API (notifications) · Cloudinary (image uploads) · Zod · pino · Vitest.

## Quick start

```bash
# from repo root
npm install
cd apps/backend
cp .env.example .env          # then fill in the values (see below)
npm run db:generate           # generate the Prisma client
npm run db:migrate:deploy     # apply migrations
npm run db:seed               # idempotent seed (safe to re-run)
npm run dev                   # http://localhost:4000
```

Seeded logins (password `Password123!`): admin `admin@kirana.local`; owners
`ramesh@kirana.local`, `suman@kirana.local`; customers `anita@kirana.local`,
`karthik@kirana.local`.

## Scripts

| Script | What |
|---|---|
| `npm run dev` | tsx watch on `src/server.ts` |
| `npm run build` / `start` | compile to `dist/` / run compiled |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` / `format` | eslint / prettier |
| `npm run test` | full Vitest suite (hits the real Neon DB) |
| `npm run db:generate` | regenerate Prisma client |
| `npm run db:migrate` | `prisma migrate dev` (local authoring) |
| `npm run db:migrate:deploy` | apply migrations (prod / CI) |
| `npm run db:seed` | idempotent seed |
| `npm run db:smoke` | PostGIS `ST_DWithin` smoke check |

## Environment variables

**Required**

| Var | Notes |
|---|---|
| `DATABASE_URL` | Pooled Neon URL (runtime, via the Neon adapter). |
| `DIRECT_URL` | Unpooled Neon URL (for `prisma migrate`, via `prisma.config.ts`). |
| `BETTER_AUTH_SECRET` | ≥32 chars (≥48 enforced in production). |
| `BETTER_AUTH_URL` | Auth server origin, e.g. `http://localhost:4000`. |

**Defaulted / operational**

| Var | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `production` enables stricter guards. |
| `PORT` | `4000` | |
| `LOG_LEVEL` | `info` | |
| `CORS_ALLOWED_ORIGINS` | localhost set | Comma-separated allowlist; **required in production**. Used by both REST CORS and the Socket.IO handshake (the socket connects cross-origin). |
| `AUTH_COOKIE_DOMAIN` | — | Set for cross-subdomain cookies in prod (e.g. `.kirana.com`). |
| `ORDER_AUTO_CANCEL_MINUTES` | `30` | Orders left in PLACED this long are auto-cancelled by the cron. |
| `TEST_DATABASE_URL` | — | Test DB (currently the same Neon DB — the suite mutates shared data). |

**Optional integrations — each no-ops until configured**

| Var(s) | Feature |
|---|---|
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | Signed image uploads (Phase 6.7). |
| `VAPID_PUBLIC_KEY` / `_PRIVATE_KEY` / `VAPID_SUBJECT` | Web push (Phase 10). Generate with `npx web-push generate-vapid-keys`. The frontends also need `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. |
| `WHATSAPP_PHONE_NUMBER_ID` / `_ACCESS_TOKEN` / `_APP_SECRET` / `_VERIFY_TOKEN` / `_API_VERSION` | WhatsApp Cloud API + webhook (Phase 10). Templates `new_order_owner` + `order_cancelled_owner` must be approved in Meta — see `PHASE10.md`. |

## Database & migrations

Neon Postgres with the PostGIS + pg_trgm extensions. **Migration workflow:**

```bash
npx prisma migrate dev --create-only --name <name>   # generate, don't apply
# Hand-edit: DELETE the spurious DROP INDEX lines for the three raw-SQL indexes
#   Store_location_gist_idx, Product_searchVector_gin_idx, Product_searchAliases_gin_idx
# Prisma can't model them and re-proposes a DROP every time. They are required.
npx prisma migrate deploy                            # apply via the unpooled DIRECT_URL
```

Never `migrate dev` to apply (Neon's pooled connection has no shadow DB). See
`PROGRESS.md` → "Schema gotchas".

## Architecture

`route → controller → service → Prisma`. Business logic lives in services.
Validation via `validate({ body, query, params })` → `req.validated`. Errors via
the `AppError` hierarchy + central handler; envelope `{ data }` / `{ error }`.
Money is integer paise. Domain events (`src/lib/events.ts`) fan out to Socket.IO
(real-time) and notifications — mutating services emit, consumers subscribe.

**Single-instance caveats (MVP):** the Socket.IO ticket store and node-cron jobs
are in-process. Run **one** backend instance until they're moved to Redis / a
distributed lock + external scheduler. Socket.IO also needs a long-lived server
(not serverless).

## Testing

`npm run test` runs Vitest sequentially against the real Neon DB (no mocks).
Fixtures are phone-prefix / name-prefix scoped per run and cleaned in `afterAll`
(`tests/helpers/factories.ts`). Rate limiters + cron + notifications are bypassed
/ not scheduled in `NODE_ENV=test`.
