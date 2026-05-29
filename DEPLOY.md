# Deployment runbook

How to take the kirana marketplace from localhost to production. This is the
**MVP single-instance** shape; scaling notes are called out inline.

## Topology

```
  customer.<domain> ─┐
  owner.<domain>    ─┤  (3 Next.js apps — Vercel)
  admin.<domain>    ─┘        │
        │ each app rewrites /v1/* ──► backend (same-origin to the browser)
        │ socket connects directly ──► backend  (NEXT_PUBLIC_WS_URL, cross-origin + ticket)
        ▼
   api.<domain>  ── Express + Socket.IO + cron  (Railway / Render / Fly — long-lived)
        │
        ▼
   Neon Postgres  (PostGIS + pg_trgm)
```

Two paths to the backend, by design:
- **REST + auth + push ticket:** browser hits `/v1/*` on its own app origin; the
  Next `rewrites()` proxy forwards to the backend. The session cookie is thus
  **first-party** on each app host → concurrent customer/owner/admin login in one
  browser works exactly as in dev.
- **WebSocket (Socket.IO):** connects **directly** to the backend's public origin
  (`NEXT_PUBLIC_WS_URL`), cross-origin, authenticated by a short-lived ticket
  (not the cookie — a host-scoped cookie can't ride cross-origin, and WS upgrades
  don't proxy through Next rewrites). So the backend must be publicly reachable.

## Hosting

| Piece | Recommended | Why |
|---|---|---|
| 3 Next apps | Vercel (one project each) | First-class Next; per-app subdomains. |
| Backend | Railway / Render / Fly.io | **Long-lived process** — Socket.IO + node-cron rule out serverless. Run **one** instance for MVP (see caveats). |
| Database | Neon (already used) | Postgres + PostGIS + pg_trgm. |
| Images | Cloudinary | Already integrated (optional). |

## DNS / TLS

Point `customer.`, `owner.`, `admin.`, and `api.` at their hosts; enable TLS on
all four (Vercel + the backend host issue certs automatically). The apps must be
HTTPS in prod for PWA install + web-push to work.

## Environment

**Backend** (`apps/backend/.env` — see `.env.example` for the full list):
- `DATABASE_URL` (pooled Neon), `DIRECT_URL` (unpooled, for migrate)
- `BETTER_AUTH_SECRET` (≥48 chars in prod — enforced), `BETTER_AUTH_URL=https://api.<domain>`
- `CORS_ALLOWED_ORIGINS=https://customer.<domain>,https://owner.<domain>,https://admin.<domain>` (**required in prod** — both REST CORS and the socket handshake use it)
- `NODE_ENV=production`, `PORT` (host-provided)
- Optional: `CLOUDINARY_*`, `VAPID_*`, `WHATSAPP_*`, `ORDER_AUTO_CANCEL_MINUTES`
- **Do NOT set `AUTH_COOKIE_DOMAIN`** with the rewrite architecture — cookies stay
  host-scoped per app, which is what preserves concurrent multi-role login. Only
  set it if you abandon the rewrite and hit the API directly (then all subdomains
  share one cookie → multi-role concurrent login breaks).

**Each Next app** (Vercel env):
- `API_INTERNAL_URL=https://api.<domain>` — the `/v1/*` rewrite destination
  (`next.config.mjs`).
- `NEXT_PUBLIC_WS_URL=https://api.<domain>` — the socket connects here directly.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY=<same as backend VAPID_PUBLIC_KEY>` (if using push).

## Deploy steps

1. **Rotate secrets** shared during the build (the Neon URL + any creds) before
   real traffic.
2. Provision Neon prod DB; ensure `postgis` + `pg_trgm` extensions.
3. Backend: set env, then on the release:
   ```bash
   npm run db:migrate:deploy   # apply migrations (never migrate dev in prod)
   npm run db:seed             # first deploy only — seeds admin + categories
   npm run build && npm run start
   ```
4. Apps: deploy each to Vercel with its env. Confirm `/v1/auth/get-session`
   resolves through the rewrite and a socket connects (network tab → `socket.io`).
5. **Onboard owners:** owner signs up (lands `isApproved=false`) → an admin
   approves them in the **admin dashboard → Owners**. No manual API call needed.
6. **WhatsApp (optional):** add `WHATSAPP_*`, point the Meta webhook at
   `https://api.<domain>/v1/webhooks/whatsapp` (verify token = `WHATSAPP_VERIFY_TOKEN`,
   subscribe to `messages`), and get the two templates approved — see `PHASE10.md`.

## Single-instance caveats (must address before scaling out)

These are in-process and assume **one** backend instance:
- **node-cron jobs** (auto-cancel, WhatsApp retry, availability reset) run per
  instance → N instances = N runs. Needs a distributed lock or an external
  scheduler hitting an endpoint.
- **Socket.IO** ticket store + rooms are per-instance → needs the Redis adapter +
  a shared ticket store, and sticky sessions / WebSocket-aware LB.
- **Auth + global rate-limit storage is in-memory** → set better-auth
  `rateLimit.storage: "database"` (and a shared store for the global limiter) for
  multi-instance.

## Pre-launch checklist

- [ ] Secrets rotated; prod `BETTER_AUTH_SECRET` ≥48 chars.
- [ ] `CORS_ALLOWED_ORIGINS` = the three prod app origins (https).
- [ ] Migrations applied (`migrate deploy`) + seed run once.
- [ ] TLS on all four subdomains; apps load over https.
- [ ] Auth round-trips (login on each app; concurrent multi-role works).
- [ ] A socket connects and an order status updates live.
- [ ] An admin can approve a freshly signed-up owner.
- [ ] (If push) VAPID set; notification toggle appears and a test push arrives.
- [ ] Running a single backend instance (until the scaling items above are done).

## Deferred (documented, not blocking launch)

Perf items from the Phase 4.2 / Phase 5 audits (search sargability, extra
composite indexes) are fine at launch scale (<500 products/store) — see
`PROGRESS.md` → "Deferred items". Revisit when real data shows they bite.
