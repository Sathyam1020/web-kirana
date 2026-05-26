# Kirana Backend — Build Progress

> Read this first if you're resuming work in a new session. It captures every
> decision, every phase, every deferral, and every gotcha so context isn't lost.

**Repo:** `online-kirana-store` (Turborepo monorepo, npm workspaces)
**Backend lives at:** `apps/backend`
**Build prompt:** the user's original instructions (in the chat history) split
the backend into 13 numbered phases. We've split Phase 4 into 3 sub-phases
(4.1, 4.2, 4.3) because of scope additions (search + commerce primitives).

---

## Quick start for a fresh session

```bash
# From repo root
npm install                                     # workspace install
cd apps/backend
npx prisma generate                             # regenerate Prisma client
npm run db:seed                                 # idempotent — safe to re-run
npm run dev                                     # http://localhost:4000
npm run test                                    # full Vitest suite
```

**Seeded login credentials** (password is `Password123!` for every seeded user):
- Admin: `+919900000000`
- Owners: `+919900000001` (Sri Krishna Kirana), `+919900000002` (Reddy Provisions)
- Customers: `+919900000010`, `+919900000011`

**Tooling:** Node 20+, npm 11, Turborepo, Prisma 7, Express 5, Vitest, jose,
argon2, helmet, cors, pino, express-rate-limit. **No Docker** — the user opted
to use Neon directly.

**Database:** Neon Postgres. URLs in `apps/backend/.env` (gitignored — the
user shared a live URL in chat; ask them to rotate after the build is done).
`DATABASE_URL` = pooled (runtime, via `@prisma/adapter-neon`).
`DIRECT_URL` = unpooled (for `prisma migrate`, via `prisma.config.ts`).

---

## Phase status

| #     | Phase                                                              | Status        | Commit    |
|-------|--------------------------------------------------------------------|---------------|-----------|
| 0     | Scaffold apps/backend + packages/shared                            | ✅ done        | `07eebed` |
| 1     | Prisma schema + PostGIS migration + seed                           | ✅ done        | `6d6cd84` |
| 2     | Core API infra (errors, validation, CORS, rate-limit, helmet)      | ✅ done        | `b46bb61` |
| 3     | Auth (signup/login/refresh/logout/me) + admin approval + CSRF      | ✅ done        | `b432f90` |
| 4.1   | Stores + products + categories CRUD + event bus                    | ✅ done        | `c09f922` |
| 4.2   | Production search (pg_trgm + tsvector + aliases + hybrid scoring)  | ✅ done        | `6e33e9d` |
| 4.3   | Featured / promoted / coupons (schema + endpoints; apply at order) | ✅ done        | `3163d42` |
| 5     | Discovery — PostGIS /stores/nearby + store detail + store products | ✅ done        | `9771c78` |
| 6     | Customer addresses CRUD                                            | ⏳ pending     |           |
| 7     | Order placement — idempotency-key + re-validation + tx snapshot    | ⏳ pending     |           |
| 7.5   | Riders — self-signup, apply-to-store, owner approval (NEW)         | ⏳ pending     |           |
| 8     | Order lifecycle state machine + broadcast-and-first-accept + rider | ⏳ pending     |           |
| 9     | Socket.IO real-time (rooms, handshake auth)                        | ⏳ pending     |           |
| 10    | Notifications — WhatsApp Cloud API + web-push + webhook            | ⏳ pending     |           |
| 11    | Cron jobs — auto-cancel PLACED, daily isAvailable reset            | ⏳ pending     |           |
| 12    | Cloudinary signed uploads                                          | ⏳ pending     |           |
| 13    | Hardening pass + apps/backend/README + full suite                  | ⏳ pending     |           |

**Side track (mentioned but not started):**
- `apps/admin` Next.js shell — admin-only UI for approving owners + managing
  categories. The API endpoints exist (`/v1/admin/*`). The user said to defer
  the Next.js app for now.
- `apps/customer` and `apps/owner` PWAs — not started; only `apps/web`
  (shadcn starter) exists. CORS reads `CORS_ALLOWED_ORIGINS` from env as a
  comma-separated list so future frontends just append their origin.
- **`apps/rider`** PWA — implied by the Phase 7.5 plan below.

---

## Phase 5 — Discovery (notes for future sessions)

Public, anonymous-allowed surface used by the customer PWA. Three GETs:

```
GET /v1/stores/nearby             ?lat &lng &radiusMeters? &page? &limit? &includeClosed?
GET /v1/stores/:id                — store + featuredProducts (≤20) + categories[]
GET /v1/stores/:id/products       ?q? &category? &page? &limit?
```

**Routing trick worth knowing.** Public and owner routes share the
`/v1/stores` prefix. `storesPublicRouter` is mounted FIRST and starts with
a guard middleware that calls `next("router")` whenever `req.path` starts
with `/me` (case-insensitive). That exits the public router entirely so
the owner-side `storesRouter` (which gates on `requireAuth +
requireRole(OWNER)`) handles `/me`, `/me/products`, `/me/coupons`, etc.
Without that guard the `/:id` wildcard route shadows `/me`, and strict
zod validation on `storeProductsQuerySchema` rejects owner-only query
params like `includeInactive` BEFORE the controller can fall through.

**Public view narrowing.** Service-layer types `StorePublicView` and
`ProductPublicView` deliberately drop fields that shouldn't be public:
`ownerId`, `isActive`, `updatedAt` on stores; `isActive`, `searchAliases`,
`searchVector`, `isPromoted`, `promotedUntil` on products. Phone IS kept —
kirana stores advertise their phone publicly. `isActive=true` is enforced
in every read path (including the `includeClosed=true` branch of /nearby,
which only flips `isOpen`).

**PostGIS query shape.** `listNearbyStores` uses `ST_DWithin(s.location,
ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography, radiusMeters)` for
the index-supported filter, and `ROUND(ST_Distance(...))::int` to project
the distance. The GiST index `Store_location_gist_idx` (Phase 1) handles
the spatial filter; isActive/isOpen are non-indexed post-filters but
spatial selectivity dominates. Order is `(distanceMeters ASC, id ASC)`.

**Page-based pagination** (page 1..50, limit 1..100). Cursor pagination
across a derived `distanceMeters` column would be brittle; OFFSET is
acceptable for kirana scale. Same on `/:id/products` for sortability
across the composite `(isFeatured DESC, featuredOrder ASC NULLS LAST,
name ASC, id ASC)` order. See "Deferred items" below for the perf
trade-offs.

**Tests.** `apps/backend/tests/discovery.test.ts` — 28 cases. To avoid
seeded stores at `(12.9116, 77.6473)` and `(12.9352, 77.6245)` (both in
HSR / Koramangala) leaking into geo-ordering and pagination assertions,
the order/pagination tests use isolated coords (Cochin 10.0,75.0 and
Chennai 13.082,80.27 — no seed data anywhere near those).

---

## Phase 7.5 — Riders (locked design, not yet implemented)

> Scope addition relative to the original build prompt (which said
> "Out of scope: rider fleet"). User explicitly added this; design below
> is locked. Implementation is deferred until Phase 7 ships and we have
> orders to test rider participation against.

### Flow
1. **Rider self-signs-up** via existing `POST /v1/auth/signup` with
   `role: "RIDER"`. Account created with `isApproved=false` and
   `assignedStoreId=null`. No tokens issued (same shape as OWNER signup).
2. **Rider applies to a store** via `POST /v1/riders/me/apply { storeId }` —
   creates a `RiderApplication` row (`status=PENDING`). Unique constraint:
   at most one PENDING application per rider at a time.
3. **Owner reviews + decides** under `/v1/stores/me/rider-applications`:
   - `GET ...` lists pending applications for the owner's store
   - `POST .../:id/approve` → in one transaction: application → APPROVED,
     `user.isApproved = true`, `user.assignedStoreId = ownerStoreId`,
     `user.approvedById = ownerId`
   - `POST .../:id/reject` → application → REJECTED (rider can re-apply
     elsewhere; their account stays unapproved)
4. **Rider logs in** to their store's order queue (`GET /v1/riders/me/orders`).

### Order lifecycle with riders (Phase 8 extension)
- Customer places → `PLACED`. Phase 9 broadcasts to owner AND every
  active rider of the store.
- **First acceptor wins** via optimistic UPDATE (`WHERE status = PLACED`).
  Sets `Order.handlerId = acceptor.userId`. Status → `ACCEPTED`.
- Other riders get a "claimed by someone else" socket event so their
  toast clears.
- Handler (owner or rider) marks `OUT_FOR_DELIVERY`, then `DELIVERED` +
  `paymentStatus = COLLECTED`.
- **Reassignment escape hatch** (owner-only):
  `POST /v1/stores/me/orders/:id/reassign { newHandlerId }` — used when
  a rider can't finish a delivery (bike breaks, abandons, etc.).
- **Rider CANNOT reject.** Only the owner rejects an order. Riders can
  UN-CLAIM before OUT_FOR_DELIVERY (puts it back in the broadcast queue).

### Schema additions (one additive migration)
```prisma
// Role enum:        add RIDER
// ActorType enum:   add RIDER
// User model:
   assignedStoreId  String?   // FK → Store, onDelete: SetNull
   assignedStore    Store?    @relation("RidersByStore", ...)
// Order model:
   handlerId        String?   // FK → User, onDelete: SetNull
   handler          User?     @relation("OrderHandledBy", ...)
// New model:
model RiderApplication {
  id           String   @id @default(cuid())
  riderId      String
  rider        User     @relation(...)
  storeId      String
  store        Store    @relation(...)
  status       RiderApplicationStatus @default(PENDING)
  decidedById  String?
  decidedBy    User?    @relation("AppDecisions", ...)
  decidedAt    DateTime?
  createdAt    DateTime @default(now())
  @@unique([riderId, status]) // one PENDING max
}
enum RiderApplicationStatus { PENDING, APPROVED, REJECTED }
```

### Endpoint surface
```
Public (existing):
  POST   /v1/auth/signup { role: RIDER }     accepts RIDER role
Rider self-service (requireAuth + requireRole(RIDER)):
  GET    /v1/riders/me
  POST   /v1/riders/me/apply { storeId }
  GET    /v1/riders/me/orders                (orders for assigned store)
  POST   /v1/riders/me/orders/:id/claim      (Phase 8)
  POST   /v1/riders/me/orders/:id/unclaim    (Phase 8)
  POST   /v1/riders/me/orders/:id/advance    (Phase 8)
Owner (requireAuth + requireRole(OWNER) + requireOwnStore):
  GET    /v1/stores/me/rider-applications
  POST   /v1/stores/me/rider-applications/:id/approve
  POST   /v1/stores/me/rider-applications/:id/reject
  GET    /v1/stores/me/riders                (active + deactivated)
  PATCH  /v1/stores/me/riders/:id            (deactivate / reactivate)
  POST   /v1/stores/me/orders/:id/reassign   (Phase 8, owner-only escape hatch)
```

### Design decisions locked
- **One rider per store** in V1. Switching stores = owner-A deactivates,
  rider applies fresh to owner-B. Future: many-to-many `RiderStore`.
- **Broadcast-and-first-accept** (not owner-then-rider). The handlerId
  field tells you who's driving each order; OrderStatusHistory.actorType
  carries CUSTOMER / OWNER / RIDER / SYSTEM for audit.
- **Handoff between owner and rider is verbal**, not modeled. If owner
  accepts and rider physically picks up the bag, owner marks
  OUT_FOR_DELIVERY when handing off. Edge case: rider accepts but bag
  isn't packed yet → they wait at the counter. The owner being right
  there makes this fine for the kirana use case.
- **Rider account creation:** rider sets their own password at signup.
  No owner-creates-rider flow, no temporary-password sharing.
- **Notifications fairness:** "claimed by someone else" event fires only
  via socket (Phase 9). Don't WhatsApp/push the losers — that's spam.

### When this lands
After Phase 7 (orders exist) and before Phase 8 (state machine). Phase 8
then implements the broadcast-and-first-accept logic with rider
participation baked in, rather than retrofitting later.

---

## User-locked decisions (DO NOT RE-ASK)

1. **Spec source:** the user opted "build from this prompt only" — no
   `docs/system-design.md` exists. When the prompt is silent on a detail,
   ask before guessing.
2. **App naming:** the backend is `apps/backend` (NOT `apps/api` from the
   build prompt). 3 frontends planned later: `apps/customer`, `apps/owner`,
   `apps/admin`.
3. **OrderStatus enum:** `PLACED → ACCEPTED → OUT_FOR_DELIVERY → DELIVERED`
   plus `REJECTED` and `CANCELLED`. No `PREPARING`. No `READY`.
4. **Categories:** GLOBAL (single table, no `storeId`). Admin creates them;
   owners only select from the existing list. Phase 4.1 added admin
   endpoints.
5. **PaymentStatus:** `PENDING → COLLECTED` only. No `VOIDED`. The order
   status itself signals "no money will be collected" for REJECTED/CANCELLED.
6. **Phone format:** accept any (light normalization — strip non-digit/+
   chars). No country-code validation. See `src/lib/phone.ts`.
7. **Refresh token transport:** `httpOnly` cookie scoped to `/v1/auth` +
   double-submit CSRF cookie (`kirana_csrf`) echoed in `X-Csrf-Token`
   header.
8. **Signup posture:** open for CUSTOMER (immediate). Open for OWNER but
   `isApproved=false` until admin flips it. ADMIN signup is closed — admins
   are seeded only.
9. **pricePaise floor:** 100 (₹1 minimum). Ceiling 5,000,000 (₹50,000).
10. **Embeddings (pgvector) for native-script search:** deferred. Current
    search is pg_trgm + tsvector + owner-curated `searchAliases`.

---

## Architecture conventions

- **Layering:** route → controller → service → Prisma. Business logic lives
  in `services` only.
- **Validation:** every endpoint uses `validate({ body, query, params })`
  middleware. Validated data lives on `req.validated` (NOT `req.query` —
  Express 5 doesn't propagate Object.assign mutations to req.query for
  type-coerced values). Use `getValidated(req)` from `src/lib/validated.ts`.
- **Errors:** `AppError` hierarchy in `src/lib/errors.ts`. Prisma errors
  pass through `rethrowAsAppError()` from `src/lib/prisma-errors.ts`
  (P2002 → 409, P2003 → 400, P2025 → 404).
- **Response envelope:** success `{ data }`, error `{ error: { code, message,
  details? } }`. Use `sendData`, `sendCreated`, `sendNoContent` from
  `src/lib/response.ts`. Error codes live in
  `packages/shared/src/error-codes.ts`.
- **Money:** integer paise everywhere. Never floats.
- **Time:** UTC in DB. Decimal lat/lng pass to Prisma as STRINGS (Phase 1
  lesson).
- **Auth:** `requireAuth` re-reads the DB on every request — the JWT `role`
  claim is advisory, never trusted for authorization. `requireRole(...)`
  layers on. `requireOwnStore` sets `req.ownStore` for product routes.
- **Domain events:** `events.emit(...)` from `src/lib/events.ts` in every
  mutating service. Phase 9 will plug Socket.IO into this bus; Phase 10
  plugs WhatsApp/web-push. Controllers don't need to change.

---

## Schema gotchas (read before any new migration)

1. **Three indexes Prisma can't model — always proposed as DROPs:**
   `Store_location_gist_idx` (Phase 1 PostGIS),
   `Product_searchVector_gin_idx` and `Product_searchAliases_gin_idx`
   (Phase 4.2 search). Every `prisma migrate dev --create-only` re-proposes
   `DROP INDEX` for all three. **Delete those lines by hand** in every
   generated migration; they're required by Phase 4.2 search and Phase 5
   discovery.
2. **Migration apply pattern:** `--create-only` then hand-edit if needed,
   then `prisma migrate deploy`. We do NOT use `prisma migrate dev` to
   apply (Neon's pooled connection doesn't support the shadow DB Migrate
   wants). The migration is applied via the unpooled `DIRECT_URL` per
   `prisma.config.ts`.
3. **String[] columns** (e.g. `Product.searchAliases`) need explicit
   `NOT NULL DEFAULT ARRAY[]::text[]` in the migration; Prisma generates
   them nullable by default which mismatches the TS type.
4. **`unaccent` is not IMMUTABLE.** To index on it, wrap in
   `immutable_unaccent(text)` (defined in the search migration). Direct
   `unaccent(name)` in an index expression will fail with `42P17`.

---

## Deferred items (DO NOT FORGET in Phase 13)

### From the Phase 4.2 reviewer-perf audit (search code)

All five are HIGH-impact at scale (10k+ products); the current 12-product
seed dataset hides them. Defer to Phase 13 hardening.

1. **Category/Store rename = write storm.** The propagation trigger
   `UPDATE Product SET searchAliases = searchAliases WHERE categoryId = X`
   runs inline in the Category UPDATE transaction. For a 10k-product
   category, this means 10k row locks + 10k tsvector rebuilds + 3 GIN
   index updates per row, all in one tx. Fix: async worker batching
   500 rows per tx, OR drop the denormalization and JOIN category name
   at query time. File: `apps/backend/prisma/migrations/20260525205855_add_product_search/migration.sql`
2. **`word_similarity(q, name) > 0.4` doesn't use the trgm GIN index.**
   Function-call + inequality form isn't sargable. Fix: switch to
   `q <% name` operator + `SET LOCAL pg_trgm.word_similarity_threshold = 0.4`.
   File: `apps/backend/src/modules/search/search.service.ts:145`
3. **`p.name ILIKE '%q%'` doesn't use the index either** — the index is on
   `immutable_unaccent(name)`, not raw `name`. Fix: rewrite predicate to
   `immutable_unaccent(p.name) ILIKE '%' || immutable_unaccent(${q}) || '%'`.
   File: `apps/backend/src/modules/search/search.service.ts:147`
4. **OR of 4 legs → planner can't use a single index.** Compounds with #2/#3.
   Fix: once #2/#3 are sargable, planner BitmapOrs the 4 GIN indexes; or
   restructure as UNION-of-IDs then rescore.
5. **`ORDER BY GREATEST(...)` materializes + sorts whole match set.** No
   index can satisfy this. OFFSET pagination gets slower per page. Fix:
   bound candidate set per leg (top 500), then score+sort the bounded set.
   Cursor over (score, id) for deep pagination.

### From the Phase 5 reviewer-perf audit (discovery endpoints)

Two HIGH-impact findings deferred to Phase 13 — both are bounded-acceptable
at kirana scale (<500 products/store, <2000 stores per /nearby query) but
will need attention if any store grows past ~5k products or any region
crosses ~10k stores.

1. **`listStoreProducts` orderBy can't use any existing index.** The order
   `(isFeatured DESC, featuredOrder ASC NULLS LAST, name ASC, id ASC)`
   forces a full sort of every store's catalog on every page request.
   At <500 products/store this is fine. At 10k+ products, OFFSET 4900
   LIMIT 100 sorts ~10k rows and discards 4900 every page. Fix: add a
   composite index `(storeId, isActive, isAvailable, isFeatured DESC,
   featuredOrder ASC, name ASC, id ASC)` OR switch to keyset pagination.
   File: `apps/backend/src/modules/stores/stores.service.ts` (the non-q
   branch of `listStoreProducts`).
2. **Featured-products `createdAt` tiebreak isn't in the index.** Cheap
   at MAX_FEATURED_PRODUCTS=20 (top-N heap sort over a handful of rows),
   but extend `Product_storeId_isFeatured_featuredOrder_idx` to include
   `createdAt DESC` if featured counts grow into the hundreds per store.
   File: same `getStorePublic` featured query.

Inline fixes applied before commit (no defer):
- LOW — case-sensitive `/me` router guard. Fixed: lowercase the
  comparison so `/Me`, `/ME` etc. still fall through to the owner router
  rather than returning a confusing 404 from public code paths.
- MED — 4 serial Neon roundtrips in `getStorePublic`. Fixed:
  store + featured + groupBy fired in parallel via `Promise.all`,
  category lookup remains sequential (depends on groupBy result). Saves
  ~15-30ms per store-detail render.

### From the Phase 4.3 reviewer-authz audit

Already applied inline before the Phase 4.3 commit (no deferrals):
- MEDIUM — coupon code enumeration via distinguishable lifecycle reasons.
  Fixed: `preview()` now returns `INVALID_CODE` for all coupon-state
  failures (not found / inactive / not-yet-valid / expired / fully
  redeemed / per-user limit / wrong store). Cart-side reasons
  (`PRODUCT_NOT_FOUND`, `PRODUCT_UNAVAILABLE`, `MULTI_STORE_CART`,
  `MIN_ORDER_NOT_MET`) stay granular because UX needs them.
- LOW (handoff) — Phase 7 must enforce `perUserLimit` and global
  `usageCount < totalUsageLimit` inside a serializable transaction (or
  via a `(couponId, userId)` partial unique index when perUserLimit=1).
  The preview is read-only; the actual write race only matters at apply.

### Earlier deferrals (still open)

- **Owner-rejection audit table.** Phase 3 admin `POST /admin/users/:id/reject`
  hard-deletes the row; no audit. If we want a history view, add an
  `OwnerRejection` table.
- **`assertCurrentRole` helper** for long-running requests where the role
  might change between middleware and service-layer DB write. Not needed
  for current short admin actions.
- **Admin store moderation** (suspend/reactivate a store) — endpoint not
  built. Admin can only flag owners. Add to a future admin phase.
- **`apps/admin` Next.js shell** — user said to defer.
- **pgvector embeddings** for native-script semantic search without aliases.
  Current pg_trgm + aliases path is good for English + Romanized + typos.

---

## Test infrastructure

- **Vitest config:** sequential file run (`fileParallelism: false`,
  `singleFork`). Tests hit the real Neon DB.
- **Per-run phone prefix:** `tests/helpers/factories.ts` generates
  `+9988<7-digit-run-id><suffix>` for every test user. `cleanupRun()`
  deletes by prefix in `afterAll`. Safe alongside the seed dataset.
- **Test categories** use a `ZZZ-TEST-` name prefix that `cleanupRun` also
  removes.
- **Rate limiters are bypassed in `NODE_ENV=test`** (tests burst from one
  IP). The check lives in `src/middleware/rate-limit.ts` and
  `src/middleware/auth-rate-limit.ts`.
- **Auth tests can shortcut admin approval** via direct DB UPDATE
  (`signupApprovedOwner` factory). The full approval flow is still tested
  in `auth.test.ts`.

---

## Files / dirs cheat sheet

```
apps/backend/
  prisma/
    schema.prisma                       — schema (read the top comment about Unsupported!)
    migrations/                         — never edit applied migrations
    seed.ts                             — idempotent seed
  prisma.config.ts                      — Prisma 7 contract: directUrl for CLI
  src/
    config/env.ts                       — Zod-validated env at boot
    db/prisma.ts                        — PrismaClient singleton with @prisma/adapter-neon
    generated/prisma/                   — Prisma 7 generated client (gitignored)
    lib/
      errors.ts                         — AppError hierarchy
      response.ts                       — envelope helpers
      logger.ts                         — pino + redact
      jwt.ts                            — jose HS256
      passwords.ts                      — argon2id
      refresh-tokens.ts                 — sha256-hashed, atomic rotation, family-revoke
      csrf.ts                           — double-submit token
      phone.ts                          — light normalize
      events.ts                         — typed domain event bus
      prisma-errors.ts                  — P2002/P2003/P2025 → AppError
      validated.ts                      — getValidated(req) helper
    middleware/
      auth.ts                           — requireAuth + requireRole + ensureOwnership
      auth-rate-limit.ts                — per-route limits (login/signup/refresh)
      cors.ts                           — env-driven allowlist, hard reject on miss
      error-handler.ts                  — central error handler + notFoundHandler
      rate-limit.ts                     — global limiter (test-bypassed)
      request-id.ts                     — pino-http with X-Request-Id
      require-own-store.ts              — sets req.ownStore for product routes
      validate.ts                       — Zod → req.validated.{body,query,params}
    modules/
      admin/                            — pending-owners + approve/reject + category admin
      auth/                             — signup/login/refresh/logout/me
      categories/                       — public list + admin CRUD
      products/                         — owner CRUD nested under /stores/me/products
      search/                           — /v1/search/products + service used by owner q=
      stores/                           — owner /stores/me CRUD + isOpen toggle
  scripts/
    db-inspect.ts                       — list tables/extensions/triggers
    postgis-smoke.ts                    — ST_DWithin verification (Phase 1 done-check)
  tests/
    helpers/factories.ts                — phone-prefix-scoped fixtures
    auth.test.ts                        — 24 cases
    categories.test.ts                  — 11 cases
    products.test.ts                    — 18 cases
    search.test.ts                      — 29 cases
    stores.test.ts                      — 15 cases
```

---

## Workflow rule the user established

After every phase: **implement → reviewer-\* subagent audit → end-to-end
test against Neon → backtrack-and-fix → commit only when truly green →
pause for explicit user approval before the next phase.**

The user does not want auto-progression. Wait for them.
