# Kirana Marketplace — Architecture (mostly backend)

A self-contained reference. Paste this into any LLM (or hand to a developer)
to ground conversations about the system. Reflects the production state after
build Phase 11 — see `apps/backend/PROGRESS.md` for build history and
`IMPROVEMENTS.md` for the forward roadmap.

---

## 1. Product overview

A neighbourhood-kirana marketplace for India. Three actors:

- **Customer** — browses nearby kirana stores, places COD orders, tracks
  delivery live.
- **Owner** — runs one store (products, coupons, banners, hours, order
  lifecycle).
- **Admin** — approves owner signups, manages categories/departments,
  configures promotions.

Currently **COD only**. Single-instance backend. Production deployed to
Railway + Vercel + Neon.

---

## 2. Stack

| Layer | Tech |
|---|---|
| Monorepo | Turborepo + npm workspaces |
| Frontends (×3) | Next.js 15/16 (PWA, Turbopack), React 19, Tailwind v4, shadcn/ui, Motion (Framer) |
| State | Zustand (auth, cart, ephemeral UI), TanStack Query (server state) |
| Backend | Node 20 + Express 5, ESM, TypeScript (run via `tsx` in prod) |
| Auth | `better-auth` (cookie sessions; email + password) |
| DB | Neon Postgres (serverless), PostGIS extension, pg_trgm extension, `unaccent` |
| ORM | Prisma 7 with `@prisma/adapter-neon` (WebSocket-based serverless driver) |
| Realtime | Socket.IO server (one-time ticket handshake) |
| Cron | `node-cron` in-process |
| Notifications | web-push (VAPID) + WhatsApp Cloud API |
| Images | Cloudinary (signed direct-uploads) |
| Validation | Zod everywhere (`validate({body,query,params})` middleware) |
| Logging | pino + pino-http |
| Tests | Vitest, sequential, hitting real Neon |

---

## 3. Hosting + topology

```
   customer.<domain> ─┐
   owner.<domain>    ─┤  Vercel (one project per Next app)
   admin.<domain>    ─┘
                        │
       Next.js rewrites() — /v1/* proxied SERVER-SIDE to backend:
       browser sees same-origin requests, cookies stay first-party.
                        │
                        ▼
            backend.sathyam.xyz  (Railway, ONE backend instance)
            Express + Socket.IO + node-cron
                        │
                        │ Socket.IO connects DIRECTLY (cross-origin)
                        │  from browser, authenticated by short-lived ticket
                        │  (cookie can't ride cross-origin; WS upgrades
                        │   don't proxy reliably through Next rewrites)
                        ▼
            Neon Postgres (PostGIS + pg_trgm)  + Cloudinary (images)
```

Why the rewrite architecture: keeps the session cookie **first-party on each
app's origin** (so each subdomain gets its own cookie → concurrent
customer/owner/admin login in one browser works). Cross-origin direct
would break that AND hit Safari ITP issues. The downside is one extra hop
(~50–150ms) and Vercel bandwidth counted twice.

Single-instance caveats (documented + accepted for MVP):
- node-cron jobs run once per instance.
- Socket.IO ticket store + rooms are in-process.
- `better-auth.rateLimit.storage = "memory"`.
- Required Redis + sticky sessions before scaling out.

---

## 4. Monorepo layout

```
apps/
  backend/         Express + Prisma + Socket.IO + cron
  customer/        Customer PWA (Next.js)
  owner/           Owner PWA (Next.js)
  admin/           Admin web (Next.js)
packages/
  shared/          Cross-package types (consumed AS TYPESCRIPT SOURCE — no build step)
  api-client/      Axios + typed endpoint wrappers (buildApi)
  auth/            AuthProvider, useApi, useAuthStore, useRealtime, useWebPush
  ui/              shadcn-based shared components
  eslint-config/   shared ESLint config
  typescript-config/ shared tsconfig
```

Critical detail: `packages/shared` is consumed as **TS source**
(`"main": "./src/index.ts"`). That's why the backend runs via `tsx` in
production rather than `node dist/server.js` — workspace imports of `shared`
are `.ts` files at runtime.

---

## 5. Authentication

- **better-auth** with email + password (`/v1/auth/sign-in/email`,
  `/v1/auth/sign-up/email`, `/v1/auth/get-session`, `/v1/auth/sign-out`).
- Session = HTTP-only cookie `kirana.session_token`, 30-day rolling expiry,
  cookie-cache 5 min in-process.
- **`additionalFields`** on User: `phone` (required, validated via
  `lib/phone.ts`), `role` (CUSTOMER/OWNER/ADMIN), `isApproved` (bool),
  `approvedAt`, `approvedById`.
- **Database hooks:**
  - `user.create.before`: validates phone, rejects ADMIN signups (admins are
    seeded only), sets `isApproved=false` for OWNER (admin must approve).
  - `session.create.before`: blocks login for unapproved owners.
- **Multi-role concurrent login** trick: cookies are HOST-SCOPED (no `Domain`
  attribute). Each subdomain → its own cookie → all three roles can be signed
  in simultaneously in one browser. Sustained by NOT setting
  `AUTH_COOKIE_DOMAIN` (which would share one cookie across all subdomains
  and break this).
- `requireAuth` middleware (`src/middleware/auth.ts`) reads the session on
  every request, throws `UnauthorizedError` / `ForbiddenError` for missing /
  unapproved. Attaches `req.user = { id, role, isApproved }`.
- `requireRole(...allowed)` + `ensureOwnership(value, name)` helpers for
  authorization.
- Mount: `app.all("/v1/auth/{*splat}", toNodeHandler(auth))` BEFORE
  `express.json()` (better-auth controls its own body parsing).

---

## 6. Layering convention

```
Route handler  →  Controller  →  Service  →  Prisma
```

- Business logic lives in **services** only. Controllers are thin (validate,
  call service, send envelope).
- Errors: throw `AppError` subclasses (`NotFoundError`, `ValidationError`,
  `ConflictError`, `ForbiddenError`, `UnauthorizedError`,
  `InvalidTransitionError`, `StoreClosedError`, `OutOfServiceAreaError`,
  `CartChangedError`, `MaxAddressesReachedError`, `StoreNotCreatedError`,
  etc. — see `src/lib/errors.ts`). Central error handler maps to envelope.
- Prisma errors pass through `rethrowAsAppError()` (`prisma-errors.ts`):
  P2002 → 409, P2003 → 400, P2025 → 404.
- **Response envelope**: success `{ data: ... }`, error
  `{ error: { code, message, details? } }`. Codes live in
  `packages/shared/src/error-codes.ts`. Helpers: `sendData`, `sendCreated`,
  `sendNoContent`.
- **Validation**: `validate({ body, query, params })` middleware parses with
  Zod and writes to `req.validated` (and `req.body` for the body case).
  Reads use `getValidated(req)`. Express 5 doesn't propagate mutated
  `req.query`, which is why `req.validated` exists.
- **Money** = integer paise everywhere. Never floats.
- **Time** = UTC in DB. Decimal lat/lng pass to Prisma as STRINGS.

---

## 7. Database schema (core models)

Full schema at `apps/backend/prisma/schema.prisma`. Key models:

```
User                role: CUSTOMER | OWNER | ADMIN
                    isApproved, approvedAt, approvedById
                    phone (unique, validated)

Store               ownerId @unique                (1:1 with User)
                    name, description, phone, isActive, isOpen
                    autoResetAvailability          (Phase 11 opt-in cron)
                    latitude, longitude            (Decimal)
                    location  Unsupported("geography(Point, 4326)")
                                                   (trigger-maintained PostGIS column)
                    deliveryRadiusMeters, minOrderPaise
                    addressLine, city, pincode
                    imageUrl, imagePublicId        (Cloudinary)

StoreBanner         per-store, multiple, at most one isActive

Department          GLOBAL (admin-curated)         taxonomy L1
Category            GLOBAL, FK → Department         taxonomy L2
Subcategory         per-store, FK → Category        taxonomy L3
                    (each store can curate its own subs within a global category)

Product             FK → Subcategory + storeId
                    name, description, pricePaise, mrpPaise, discountPercent
                    unit (ML/G/KG/PIECE/L/…), unitValue
                    isActive, isAvailable, isFeatured, featuredOrder
                    isPromoted, promotedUntil
                    searchAliases String[], searchVector tsvector
                                                   (Phase 4.2 search)
                    imageUrl, imagePublicId

Address             per-customer; max 20
                    label, line1, line2, city, pincode
                    latitude, longitude
                    isDefault                      (partial unique index: one default per customer)

Order               customerId + storeId (FKs Restrict)
                    status: OrderStatus enum
                    paymentMethod: COD only        (PaymentMethod enum)
                    paymentStatus: PENDING | COLLECTED
                    itemsSubtotalPaise, deliveryFeePaise, totalPaise

                    -- snapshots (frozen at place time) --
                    storeNameSnapshot, storePhoneSnapshot
                    customerNameSnapshot, customerPhoneSnapshot
                    deliveryLabel/Line1/Line2/City/Pincode
                    deliveryLatitude, deliveryLongitude
                    customerNote

                    -- lifecycle timestamps + reasons --
                    placedAt, acceptedAt, outForDeliveryAt, deliveredAt,
                    rejectedAt, cancelledAt
                    rejectionReason, cancellationReason

OrderItem           FK → Order; snapshot fields per product
                    productNameSnapshot, productUnit, unitPricePaiseSnapshot,
                    quantity, lineTotalPaise, imageUrlSnapshot

OrderStatusHistory  audit trail of every transition
                    fromStatus, toStatus, actorType (CUSTOMER/OWNER/SYSTEM),
                    actorUserId (nullable for SYSTEM), reason

IdempotencyKey      @@unique([userId, scope, key])  (order placement guard)

Coupon              code unique; scope: GLOBAL | STORE; type: PERCENT | FLAT
                    minOrderPaise, totalUsageLimit, perUserLimit,
                    validFrom/validUntil, isActive
                    usageCount (denormalized counter; tx-incremented)

CouponRedemption    one row per applied coupon-on-order;
                    @@unique([couponId, orderId])

PushSubscription    per-user web-push registration
                    endpoint (unique), p256dh, auth, userAgent

WhatsAppMessageLog  per-attempt outbox row
                    toPhone, templateName, payload(Json),
                    status: PENDING | SENT | DELIVERED | READ | FAILED
                    waMessageId (unique, for webhook receipt correlation)
                    attempts, errorCode, errorMessage, lastAttemptAt

Session, Account, Verification          (managed by better-auth)
```

PostGIS column `Store.location` is maintained by a database trigger
installed in Phase 1's PostGIS migration. Prisma can't model
`geography(Point, 4326)` so it's `Unsupported(...)`; we read/write via raw
SQL (`$queryRaw`) only.

Three indexes Prisma can't model — `prisma migrate dev --create-only` keeps
re-proposing DROPs for them. Every generated migration must have those
DROP INDEX lines hand-stripped:
- `Store_location_gist_idx` (PostGIS GIST on location)
- `Product_searchVector_gin_idx` (GIN on tsvector)
- `Product_searchAliases_gin_idx` (GIN on text[])

---

## 8. API surface (high level)

All mounted under `/v1`.

```
PUBLIC (anonymous OK)
  GET   /v1/categories                            list seeded categories
  GET   /v1/categories/:id
  GET   /v1/departments
  GET   /v1/departments/nested                    departments + their categories
  GET   /v1/subcategories                         ?storeId&categoryId
  GET   /v1/stores/nearby                         ?lat&lng&radiusMeters&page&limit&includeClosed
                                                  PostGIS ST_DWithin; store-centric radius (each store's own)
  GET   /v1/stores/:id                            store + featured + categories
  GET   /v1/stores/:id/products                   ?q?category?subcategory?page?limit
  GET   /v1/stores/:id/banners                    active banner only
  GET   /v1/search/products                       ?q&lat?&lng?
  GET   /v1/coupons/preview                       ?code&storeId&subtotal  (apply-time check)
  GET   /health                                   liveness
  GET   /readyz                                   readiness (pings DB)

AUTH (better-auth)
  POST  /v1/auth/sign-up/email
  POST  /v1/auth/sign-in/email
  POST  /v1/auth/sign-out
  GET   /v1/auth/get-session

CUSTOMER (requireRole(CUSTOMER))
  /v1/addresses                                   CRUD + POST /:id/default
  /v1/orders                                      POST = place (idempotent), GET, /:id, /:id/cancel

OWNER (requireRole(OWNER) + requireOwnStore)
  /v1/stores/me                                   create / get / update / DELETE store
  /v1/stores/me/open                              isOpen toggle
  /v1/stores/me/banners                           CRUD + set-active
  /v1/stores/me/products                          CRUD + /:id/feature, /:id/availability
  /v1/stores/me/products?q                        owner-side search
  /v1/stores/me/subcategories                     CRUD
  /v1/stores/me/coupons                           CRUD
  /v1/stores/me/orders                            list + /:id
  /v1/stores/me/orders/:id/accept | /reject | /out-for-delivery | /deliver

ADMIN (requireRole(ADMIN))
  /v1/admin/owners                                list pending; approve/reject
  /v1/admin/categories                            CRUD
  /v1/admin/departments                           CRUD
  /v1/admin/promotions                            (featured/promoted controls)

REALTIME (auth via short-lived ticket)
  POST  /v1/realtime/ticket                       requireAuth; 60s one-time ticket
                                                  rate-limited to 30/min per user

PUSH (requireAuth)
  POST  /v1/push/subscribe                        upsert by endpoint; cross-user rebind blocked
  DELETE /v1/push/subscribe                       scoped to caller

UPLOADS (signed Cloudinary)
  POST  /v1/uploads/signature                     requireAuth; returns timestamp+signature

WEBHOOKS
  GET   /v1/webhooks/whatsapp                     Meta subscription verify (hub.challenge)
  POST  /v1/webhooks/whatsapp                     receipts; X-Hub-Signature-256 HMAC of raw body
                                                  forward-only status (no regression on replay)
                                                  mounted BEFORE express.json (raw body needed)
```

Error envelope returned on failures, consistent across all endpoints.

---

## 9. Order placement — the most complex flow

`POST /v1/orders` is idempotent + transactional + re-validated. Body:

```json
{
  "addressId": "<customer's address id>",
  "cart": [{ "productId": "...", "quantity": 2 }, ...],
  "couponCode": "WELCOME50",
  "customerNote": "Leave at door"
}
```

Header: `Idempotency-Key: <uuid v4>`. Pipeline (in `orders.service.ts`):

1. **Idempotency**: insert into `IdempotencyKey` table
   (`@@unique([userId, scope, key])`). If the row already exists, fetch the
   stored response and return it — second-tap returns the same order.
2. **Re-validate cart fresh against DB** inside a Prisma `$transaction`
   (interactive, `timeout: 20_000` for Neon latency):
   - Every product exists, isActive, isAvailable.
   - All items belong to the same store (multi-store cart → reject 400).
   - Store isActive + isOpen.
   - Server prices used (effectivePrice = pricePaise after discountPercent).
     Don't trust client-side prices.
3. **Geo check**: PostGIS distance from delivery address to store ≤
   store's `deliveryRadiusMeters`. Reject `OUT_OF_SERVICE_AREA` if not.
4. **Min order check**.
5. **Coupon application** (if `couponCode`): re-fetch coupon, check active +
   in validity window + remaining usage (global + per-user via existing
   redemptions), check scope (GLOBAL or matching store), check min order.
   Compute discount. **Increment `Coupon.usageCount` atomically inside the
   same tx** (race-safe).
6. **Create order + items + status history + coupon redemption** all in the
   tx.
7. **Snapshot everything** (store name/phone, customer name/phone, address
   text, product names + prices) into the order — order rows are immutable
   once placed.
8. After tx commit, `events.emit({ type: "order.placed", ... })`.

Common rejections: `CART_CHANGED` (price/availability drifted),
`STORE_CLOSED`, `OUT_OF_SERVICE_AREA`, `MIN_ORDER_NOT_MET`,
`COUPON_INVALID`, validation errors.

---

## 10. Order lifecycle — state machine

States: `PLACED → ACCEPTED → OUT_FOR_DELIVERY → DELIVERED`, plus terminal
`REJECTED` (owner-driven) and `CANCELLED` (customer or SYSTEM auto-cancel).

`PaymentStatus`: `PENDING → COLLECTED` (set on DELIVERED). No VOIDED.

Every transition goes through `transition(...)` helper in
`orders.service.ts`:

```ts
async function transition({ orderId, scope, from, to, actorType,
                            actorUserId, patch, reason? }) {
  // Atomic, double-tap-safe: guarded updateMany WHERE id + status = from + scope
  // 0 rows = either 404 (not in scope) or 409 (wrong status); follow-up read disambiguates
  // Writes OrderStatusHistory row in same tx
  // Emits order.status_changed after commit
}
```

Exposed via:
- Owner: `POST /v1/stores/me/orders/:id/{accept,reject,out-for-delivery,deliver}`
- Customer: `POST /v1/orders/:id/cancel` (only while PLACED)
- SYSTEM: Phase 11 cron `autoCancelStalePlacedOrders(cutoff)`

12 lifecycle tests cover happy path + every guard + scope violations + double
taps + actor permissions.

---

## 11. Domain event bus — the architectural spine

`apps/backend/src/lib/events.ts`. Single in-process EventEmitter wrapper
with typed events:

```ts
type DomainEvent =
  | { type: "store.created"; storeId; ownerId }
  | { type: "store.updated"; storeId; ownerId; fields[] }
  | { type: "store.opened" | "store.closed"; storeId; ownerId }
  | { type: "product.created" | "product.updated" | "product.deleted" |
           "product.restored" | "product.moved"; ... }
  | { type: "category.created" | "category.updated"; ... }
  | { type: "department.created" | "department.updated"; ... }
  | { type: "subcategory.created" | "subcategory.updated" |
           "subcategory.deleted" | "subcategory.availability_changed"; ... }
  | { type: "address.created" | "address.updated" | "address.deleted" |
           "address.default_changed"; ... }
  | { type: "order.placed"; orderId; storeId; customerId; totalPaise }
  | { type: "order.status_changed"; orderId; storeId; customerId;
           fromStatus; toStatus; actorType }
```

Every mutating service emits. Three consumers subscribe:

1. **Pino logger** (`events.on` is wrapped with safe try/catch so handler
   errors never crash). Provides full audit trail.
2. **Socket.IO bridge** (`src/realtime/index.ts`, registered from
   `server.ts`): emits `order.placed` to `store:<storeId>` and
   `user:<customerId>` rooms; `order.status_changed` to both rooms.
3. **Notifications dispatcher** (`src/notifications/dispatch.ts`, registered
   from `server.ts`): routes per actor — `order.placed` → owner push +
   WhatsApp; `order.status_changed CANCELLED actor=CUSTOMER` → owner;
   `actor=SYSTEM` → customer; owner-driven statuses → customer push.

Services never call `socket.emit` or `sendPush` directly. New consumers can
be added (e.g., analytics, audit log to external system) without touching
the services.

---

## 12. Realtime (Socket.IO) — ticket-based handshake

The classic problem: session cookie is host-scoped on the Vercel apps (e.g.
`customer.<domain>`), but the Socket.IO connection goes **directly** to
`backend.sathyam.xyz` cross-origin. A host-scoped cookie for origin A is
never sent to origin B regardless of SameSite, and Next rewrites don't
reliably proxy WebSocket upgrades.

Solution: **short-lived ticket**.

```
1. Frontend calls POST /v1/realtime/ticket  (same-origin via Next rewrite, cookie works)
   Backend mints a 256-bit random token (in-memory Map), 60s TTL, one-time-use.
   Token's value: the set of rooms this connection may join, resolved server-side
   from session identity:
     CUSTOMER → ["user:<userId>"]
     OWNER    → ["user:<userId>", "store:<ownerStoreId>"]

2. Frontend opens Socket.IO connection to backend with auth: { token }
   socket.io-client's `auth` function form mints a fresh ticket per (re)connect,
   so single-use semantics don't break reconnection.

3. Backend io.use() middleware redeems the ticket (delete on consume),
   joins exactly the rooms encoded. Never trusts client-supplied room names.
```

Authz review: clean (rooms server-resolved, no IDOR, no replay).
Per-user 30-req/min rate limit on `POST /v1/realtime/ticket`
(`realtimeTicketLimiter` in `middleware/rate-limit.ts`).

In-memory ticket store is the scale ceiling — needs Redis before
horizontal scale.

---

## 13. Notifications — providers + outbox + webhook

### Web Push (web-push lib, VAPID)

- `PushSubscription` row per user × browser endpoint (unique on `endpoint`).
- Subscribe: `POST /v1/push/subscribe { endpoint, keys: { p256dh, auth } }`
  upserts. Cross-user rebind is rejected (a second user can't take over an
  endpoint already owned by someone else).
- Send: `sendWebPush(target, payload)`. Returns "ok" | "gone" | "error".
  On `404` / `410` Gone, dispatcher deletes the dead subscription.
- Service worker (`apps/customer/public/sw.js`, owner equivalent) handles
  `push` event → `showNotification`, `notificationclick` → focus / open
  existing window at the deep-link URL.
- Configured via env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
  Frontends need matching `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.

Reliability caveat: web push on mobile is unreliable. iOS Safari requires
installed PWA + still throttles. Android OEMs (MIUI, ColorOS, OnePlus,
Realme) kill Chrome aggressively, breaking FCM delivery. Architecture can't
fix OS-level decisions. Next mitigation step: customer-facing WhatsApp as
fallback (planned in `IMPROVEMENTS.md`).

### WhatsApp Cloud API

- All sends written to `WhatsAppMessageLog` outbox row first (PENDING).
- `sendWhatsAppTemplate({toPhone, templateName, languageCode?, bodyParams[],
  buttonUrlParam?})` builds Meta's template payload, POSTs to
  `https://graph.facebook.com/<version>/<phone_number_id>/messages` with
  Bearer token, updates row to SENT (with `waMessageId`) or FAILED.
- **Retry cron** (Phase 11) every 2 min picks up FAILED rows with attempts <
  3 (excluding "not configured" rows), **claims them** (FAILED → PENDING
  guarded updateMany) before re-dispatching to prevent double-sends across
  overlapping ticks.
- **Webhook** (`/v1/webhooks/whatsapp`):
  - Mounted **before** `express.json()` with `express.raw({limit:"100kb"})`
    because signature verification needs the untouched body.
  - GET: echoes Meta's `hub.challenge` if `hub.verify_token` matches
    `env.WHATSAPP_VERIFY_TOKEN` (timing-safe compare).
  - POST: verifies `X-Hub-Signature-256` = HMAC-SHA256 of raw body with
    `WHATSAPP_APP_SECRET`. Timing-safe, fail-closed.
  - Maps statuses (sent/delivered/read/failed) and advances outbox rows by
    `waMessageId`. Forward-only — replayed receipts can't regress status.

Owner templates currently:
- `new_order_owner`
- `order_cancelled_owner`

Templates must be approved in Meta Business Manager. Provider no-ops
gracefully when unconfigured (writes FAILED outbox row with reason).

---

## 14. Cron jobs (in-process, single-instance)

`apps/backend/src/jobs/index.ts`. Three jobs, all guarded against
overlapping ticks (a still-running job skips its next tick):

| Job | Schedule | What |
|---|---|---|
| auto-cancel-stale-orders | every 5 min | Cancel orders left in PLACED past `ORDER_AUTO_CANCEL_MINUTES` (default 30). SYSTEM actor; emits `order.status_changed` → customer notified. |
| whatsapp-retry | every 2 min | Re-send transient FAILED outbox rows; claims each row FAILED→PENDING first. No-op if WA unconfigured. |
| availability-reset | 05:00 IST daily | Opt-in per store (`Store.autoResetAvailability`): flips opted-in stores' active products `isAvailable=false → true`. |

Test-bypassed via `if (env.NODE_ENV === "test") return` in `registerJobs()`.

Single-instance limitation: with N pods, each job runs N times. Needs a
distributed lock or external scheduler hitting an endpoint before scaling
out.

---

## 15. Search

PostgreSQL full-text via `tsvector` + trigram (`pg_trgm`) + owner-curated
`searchAliases: text[]`.

- `Product.searchVector tsvector` is a generated/maintained column updated
  by a trigger that catenates `name`, `description`, `searchAliases`, and
  category/subcategory names (with `immutable_unaccent(...)` for diacritic
  insensitivity — note: must use the wrapper function, raw `unaccent` is
  not IMMUTABLE so can't be indexed).
- GIN indexes on `searchVector` and `searchAliases`.
- 4-leg OR scoring in `search.service.ts`:
  - `searchVector @@ plainto_tsquery(...)` (full-text exact-ish)
  - `word_similarity(q, name) > 0.4` (typo tolerance)
  - `name ILIKE '%q%'` (substring fallback)
  - `searchAliases && ARRAY[q]` (alias hit)
- `GREATEST(...)` to pick best score, ORDER BY score DESC then name.

Public search at `/v1/search/products?q=...&lat=...&lng=...` (geo-bounded
when coords passed). Owner-side search at `/v1/stores/me/products?q=...`.

Known perf deferrals (documented for Phase 13 hardening — partially still
true): `word_similarity` + `ILIKE %q%` legs aren't sargable on the current
indexes; OFFSET pagination materializes full match set. Bounded fine at
launch scale (<500 products/store); revisit at 10k+ products.

---

## 16. Discovery (PostGIS)

`/v1/stores/nearby?lat&lng[&radiusMeters][&page][&limit][&includeClosed]`.

Raw SQL using `ST_DWithin(s.location, point, …)` for the bbox-prefilter
(uses GIST index), then `ROUND(ST_Distance(...))` for sorted output.

Filter is **store-centric** (each store contributes its own
`deliveryRadiusMeters`), with the user-provided `radiusMeters` as an outer
sanity cap. So a store with 15 km delivery reach appears for a customer
6 km away even if the customer's UI radius is smaller. (This was a recent
fix — the prior code used user-radius alone and missed stores.)

Order: `(distanceMeters ASC, id ASC)`. Page-based (1..50 page, 1..100 limit).

Routing trick worth knowing: public `/v1/stores` and owner `/v1/stores/me/*`
share the prefix. `storesPublicRouter` mounts FIRST with a guard that
`next("router")`-skips when `req.path` starts with `/me` (case-insensitive),
so the owner `storesRouter` (with `requireAuth + requireRole(OWNER)`)
handles `/me` paths. Without this guard, the public `/:id` catch-all
shadows `/me` and zod strict-validation rejects owner-only query params
before the controller can fall through.

---

## 17. Frontend architecture (brief)

Each app independently deployable. Shared deps via workspace packages.

- **API client**: `packages/api-client/src/client.ts` (axios with
  `withCredentials: true` + `baseURL: ""` so all requests go relative
  → Next rewrites proxy to backend). Endpoint wrappers in `endpoints.ts`
  return typed promises via `unwrap<T>` / `pluck<T, K>`.
- **Auth context**: `packages/auth/src/provider.tsx`. `AuthProvider` boots
  via `/v1/auth/get-session` and hydrates `useAuthStore` (Zustand,
  persists user only to localStorage for snappy first-paint).
- **Realtime**: `packages/auth/src/realtime.ts` exports `useRealtime({ url,
  onEvent })`. Per-app `RealtimeBridge` component mounts it inside
  `QueryClientProvider`; on events invalidates relevant query keys
  (`["orders"]`, `["order", id]`, `["owner-orders"]`, `["owner-order", id]`).
- **Web push**: `packages/auth/src/web-push.ts` — `useWebPush(vapidPublicKey)`.
  Per-app `NotificationToggle` in account/settings.
- **Cart**: customer app local cart in Zustand (`apps/customer/lib/cart.ts`),
  persisted to localStorage.
- **State**: TanStack Query for server, Zustand for client. Default
  `staleTime: 30_000`, `refetchOnWindowFocus: false`.

Customer realtime + push patterns:
- Customer order detail polls 60s as fallback; realtime invalidates query
  on every status change → instant UI.
- Bottom bar shows live active orders (poll 60s + realtime push).
- Order success → Blinkit-style celebration (green wash + SVG tick draw +
  synthesized Web Audio chime) before routing to order detail.

---

## 18. Testing

`apps/backend/tests/*.test.ts` — Vitest, sequential (`fileParallelism:
false`, `singleFork`). Tests hit the real Neon DB.

- Phone-prefix-scoped fixtures (`tests/helpers/factories.ts`) — each test
  run gets a per-run phone prefix (`+9988<7-digit-run-id><suffix>`).
  `cleanupRun()` in `afterAll` deletes by prefix. Safe alongside seeded
  data.
- Test categories use `ZZZ-TEST-` name prefix that `cleanupRun` also wipes.
- Rate limiters bypassed in `NODE_ENV=test` (otherwise test bursts would
  429 themselves).
- Cron + Socket.IO bridge + notifications dispatcher not registered for
  tests (server.ts wires them, buildApp doesn't). Tests that need realtime
  spin up a real http server.

Per-file run is the reliable mode. Full-suite runs hit Neon free-tier
throttling and surface false timeouts on the slowest files — documented in
`PROGRESS.md` so future-you doesn't chase them as bugs.

---

## 19. Build phases history (brief)

See `apps/backend/PROGRESS.md` for the full table with commit hashes. Brief:

```
Phase 0   scaffold
Phase 1   Prisma schema + PostGIS + seed
Phase 2   core API infra (errors, validation, CORS, rate limit, helmet)
Phase 3   auth (later replaced by 6.5)
Phase 4.1 stores + products + categories CRUD + event bus
Phase 4.2 search (tsvector + pg_trgm + aliases + 4-leg scoring)
Phase 4.3 featured / promoted / coupons
Phase 5   discovery — /stores/nearby + store detail + store products
Phase 6   addresses CRUD
Phase 6.5 auth replacement to better-auth (cookie sessions)
Phase 6.6 taxonomy refactor (Department/Category/Subcategory + Product re-FK)
Phase 6.7 Cloudinary signed uploads
Phase 6.8 product-level discounts
Phase 7   order placement (idempotent + transactional + re-validated)
Phase 8   order lifecycle (state machine + customer cancel + tracker)
Phase 9   Socket.IO realtime (ticket handshake + order rooms)
Phase 10  notifications (web-push both, WhatsApp owner-only, webhook)
Phase 11  cron jobs (auto-cancel, WhatsApp retry, opt-in availability reset)
Phase 13  hardening (full-suite verify, README, .env.example fix, prod builds)
```

Deferred (parked) — see PROGRESS:
- Phase 8.5/8.6: Staff onboarding + delivery assignment (renamed from "Riders";
  redesign needed because user reframed it as "team operator" not "delivery rider").
- pgvector embeddings for native-script search.

Forward roadmap in `IMPROVEMENTS.md` — covers variants, slots, delivery
fees, Google Maps UX, deliver-to picker, permissions onboarding, customer
WhatsApp, home discovery, search UX polish.

---

## 20. Environment variables

Full reference in `apps/backend/.env.example` and `apps/backend/README.md`.
Summary:

**Backend (Railway):**
- Required: `DATABASE_URL` (Neon pooled), `DIRECT_URL` (Neon unpooled — for
  migrations), `BETTER_AUTH_SECRET` (≥48 in prod), `BETTER_AUTH_URL`
- Operational: `CORS_ALLOWED_ORIGINS` (required in prod — REST + Socket.IO
  use it), `NODE_ENV`, `PORT`, `LOG_LEVEL`, `ORDER_AUTO_CANCEL_MINUTES`
  (default 30)
- Optional (provider no-ops until set): `CLOUDINARY_*`, `VAPID_*`, `WHATSAPP_*`

**Frontends (Vercel, per app):**
- `API_INTERNAL_URL` = backend URL (used by Next rewrites)
- `NEXT_PUBLIC_WS_URL` = backend URL (Socket.IO connects here directly)
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (customer + owner only)

⚠️ No trailing slashes on URL values (a trailing slash makes Next rewrites
produce `https://host//v1/...` which Express 404s — documented gotcha).

Cookie domain: deliberately NOT set in prod (`AUTH_COOKIE_DOMAIN` unset)
to keep cookies host-scoped per Vercel app → preserves multi-role
concurrent login.

---

## 21. Known constraints + scaling ceilings

1. **Single backend instance** — cron, sockets, ticket store, rate-limit
   memory all in-process. Add Redis + sticky sessions before scaling out.
2. **Tests against real Neon free tier** — full-suite is slow + occasionally
   throttles; per-file run is reliable.
3. **TS-source in production** — backend runs via `tsx`, not pre-compiled.
   Works fine for MVP; some teams would tsc-build everything including
   `packages/shared`.
4. **Web push reliability on mobile** — iOS Safari + Android OEM kill make
   it unreliable. Customer WhatsApp fallback planned. Native apps via
   Capacitor is the longer-term answer.
5. **COD only** — no online payment yet. Razorpay integration planned but
   not on the immediate roadmap.
6. **No observability stack** — pino logs go to Railway's log stream; no
   Sentry / metrics / uptime monitoring yet. Planned as "Ops Phase 1"
   before the next round of feature work.
7. **No CI** — pushes deploy straight to prod via Railway + Vercel auto.
   GitHub Actions for typecheck + lint + per-file tests is on the
   immediate roadmap.

---

## 22. Files worth opening first if you're new

```
apps/backend/PROGRESS.md                        build history + every decision
apps/backend/README.md                          backend runbook
DEPLOY.md                                       deployment runbook
IMPROVEMENTS.md                                 forward roadmap
ARCHITECTURE.md                                 (this file)

apps/backend/src/app.ts                         Express app assembly
apps/backend/src/server.ts                      http.Server + Socket.IO + cron wiring
apps/backend/src/lib/events.ts                  domain event bus (THE central pattern)
apps/backend/src/db/prisma.ts                   PrismaNeon + ws polyfill
apps/backend/src/lib/auth.ts                    better-auth config
apps/backend/src/middleware/auth.ts             requireAuth, requireRole, ensureOwnership
apps/backend/src/middleware/validate.ts         Zod validation middleware
apps/backend/src/modules/orders/orders.service.ts   place + transition + auto-cancel
apps/backend/src/realtime/index.ts              Socket.IO server + bus bridge
apps/backend/src/notifications/dispatch.ts      web-push + WhatsApp dispatcher
apps/backend/src/jobs/index.ts                  cron scheduler
apps/backend/prisma/schema.prisma               full schema
```

---

That's the system. Read top-to-bottom once and you have the model to reason
about almost any change request meaningfully.
