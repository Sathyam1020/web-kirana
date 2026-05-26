# Kirana Frontend — Handoff Doc

> Read this end-to-end before starting any of the apps. It tells you what
> the backend currently exposes, how the 4-app monorepo is organised, what
> stack each app uses, and what to build first.

Status as of this writing: backend through **Phase 6** is shipped and
green. Real-time, notifications, payments are NOT yet wired (Phases 7-13).

---

## TL;DR — read this paragraph first

The monorepo holds the backend (`apps/backend`) plus **three customer-
facing apps** (Phase-6-ready): `apps/customer`, `apps/owner`, `apps/admin`.
The rider app (`apps/rider`) is deferred until Phase 7.5. All three apps
share `packages/ui` (shadcn primitives + the saffron design system) and
`packages/shared` (types, error codes, helpers). Stack per app:
**Next.js 15 App Router + Tailwind v4 + shadcn/ui + TanStack Query +
Zustand + Axios + Motion + Oxanium font**. Auth is JWT in `Authorization`
header for access, `httpOnly` cookie for refresh, double-submit CSRF on
refresh/logout. The seeded admin is `+919900000000 / Password123!`. Hit
`http://localhost:4000/v1/...` once `npm run dev --workspace=@workspace/backend`.

---

## 1. Backend surface — what's available

Base URL in dev: `http://localhost:4000`. Every endpoint returns
`{ data: ... }` on success or `{ error: { code, message, details? } }` on
failure. Error codes are stable strings — branch on `error.code`, not
`error.message`.

### 1.1 Auth (`/v1/auth`) — Phase 3

```
POST   /v1/auth/signup       { phone, password, name, role }
                              role ∈ { CUSTOMER, OWNER }  (ADMIN seeded only)
                              CUSTOMER: created + auto-approved + tokens issued
                              OWNER:    created with isApproved=false, NO tokens
                                        → "wait for admin approval" screen
POST   /v1/auth/login        { phone, password }
                              200 → { user, accessToken } (refresh in httpOnly cookie)
                              403 + code="FORBIDDEN" if owner not yet approved
POST   /v1/auth/refresh      Reads kirana_refresh cookie + X-Csrf-Token header
                              Rotates the refresh token (parent-revoke chain)
POST   /v1/auth/logout       Same CSRF requirement
GET    /v1/auth/me           Bearer access token → current user
```

- **Access token** lives in memory (Zustand store). Add as
  `Authorization: Bearer <token>` header.
- **Refresh token** is in an `httpOnly` cookie scoped to `/v1/auth`. The
  browser sends it automatically.
- **CSRF cookie** `kirana_csrf` is set on login; on every `/refresh` and
  `/logout` you MUST echo its value in the `X-Csrf-Token` header. (Axios
  interceptor — see §3.5.)
- **Phone format**: light-normalized server-side (`+91 99990 00099` →
  `+919999000099`). UI may accept loose input.

### 1.2 Admin (`/v1/admin`) — Phase 3

```
GET    /v1/admin/users/pending-owners       (list owners awaiting approval)
POST   /v1/admin/users/:id/approve          (flips isApproved=true)
POST   /v1/admin/users/:id/reject           (deletes the row; no audit yet)
POST   /v1/admin/categories                 (create global category)
PATCH  /v1/admin/categories/:id             (rename, reorder, icon)
POST   /v1/admin/coupons                    (global coupon CRUD — Phase 4.3)
GET    /v1/admin/coupons
GET    /v1/admin/coupons/:id
PATCH  /v1/admin/coupons/:id
DELETE /v1/admin/coupons/:id                (soft delete)
POST   /v1/admin/products/:id/promote       { promotedUntil: ISO date }
DELETE /v1/admin/products/:id/promote       (unpromote)
```

All admin endpoints require `Authorization: Bearer <admin-token>`. Admin
accounts are seeded only — no public ADMIN signup.

### 1.3 Categories (`/v1/categories`) — Phase 4.1

```
GET    /v1/categories                       (public, anonymous; ordered by displayOrder)
```

### 1.4 Stores — Owner side (`/v1/stores/me`) — Phase 4.1

Requires `requireAuth + requireRole(OWNER)`.

```
POST   /v1/stores/me                        Create the owner's single store
GET    /v1/stores/me                        (404 STORE_NOT_CREATED if not yet created)
PATCH  /v1/stores/me                        Partial; lat & lng must move together
PATCH  /v1/stores/me/open                   { isOpen: boolean }
POST   /v1/stores/me/products               Create a product (categoryId required)
GET    /v1/stores/me/products?q=&category=&cursor=&limit=&includeInactive=&available=
GET    /v1/stores/me/products/:id
PATCH  /v1/stores/me/products/:id
DELETE /v1/stores/me/products/:id           (soft delete — isActive=false)
POST   /v1/stores/me/products/:id/restore
POST   /v1/stores/me/products/:id/feature   { featuredOrder? }
DELETE /v1/stores/me/products/:id/feature
POST   /v1/stores/me/coupons                Store-scoped coupon CRUD (Phase 4.3)
GET    /v1/stores/me/coupons
GET    /v1/stores/me/coupons/:id
PATCH  /v1/stores/me/coupons/:id
DELETE /v1/stores/me/coupons/:id
```

The owner's **store doesn't exist until they POST /v1/stores/me**. If the
owner is authed but `GET /v1/stores/me` returns 404 `STORE_NOT_CREATED`,
route them to the onboarding screen.

### 1.5 Stores — Public discovery (`/v1/stores`) — Phase 5

Anonymous-allowed.

```
GET    /v1/stores/nearby?lat=&lng=&radiusMeters=&page=&limit=&includeClosed=
       → { items: StoreNearbyHit[], page, limit, hasMore }
       Each hit has distanceMeters (integer, meters).
GET    /v1/stores/:id
       → { store, featuredProducts (≤20), categories: [{id, name, productCount}] }
GET    /v1/stores/:id/products?q=&category=&page=&limit=
       q present → delegates to search.service (store-scoped + customer filter)
       q absent  → paginated active+available products; featured pinned first
```

Closed stores are excluded from `/nearby` by default but still visible
on `/:id` (render a "Closed — opens at 9am" banner).

### 1.6 Search (`/v1/search`) — Phase 4.2

```
GET    /v1/search/products?q=&page=&limit=&storeId=&categoryId=&lat=&lng=&radiusMeters=
       Customer-facing: only active+open stores, active+available products.
       Hybrid scoring (FTS + trigram + alias + substring) — `score` ∈ [0..1+].
```

Search supports typos ("ata" → "Aashirvaad Atta") and Romanized Hindi
("doodh" → "Amul Milk") out of the box.

### 1.7 Coupons (`/v1/coupons`) — Phase 4.3

```
POST   /v1/coupons/preview     CUSTOMER auth. Body: { code, cart, storeId }.
                                Returns { discountPaise, finalPaise } OR { error: { code: "INVALID_CODE" } }
                                for ANY coupon-state failure (anti-enumeration).
                                Cart-side reasons (PRODUCT_NOT_FOUND, MIN_ORDER_NOT_MET, etc.) ARE granular.
```

### 1.8 Addresses (`/v1/addresses`) — Phase 6

CUSTOMER-only.

```
POST   /v1/addresses           Create. First address is auto-default.
GET    /v1/addresses           List (default first, then createdAt DESC). No pagination — capped at 20.
GET    /v1/addresses/:id
PATCH  /v1/addresses/:id       Partial. isDefault CANNOT be set here (400 strict).
DELETE /v1/addresses/:id       If deleted was default and siblings exist, promote next-newest.
POST   /v1/addresses/:id/default   Atomic flip; idempotent on already-default.
```

Cap: 20 per customer → 409 `MAX_ADDRESSES_REACHED`.

### 1.9 What's NOT yet built

These are Phase 7+ and not callable yet — design FE around the absence:
- Order placement, lifecycle, history
- Riders (signup, apply, claim)
- Socket.IO real-time
- WhatsApp / web-push notifications
- Cron (auto-cancel, daily reset)
- Cloudinary signed uploads (image URLs must currently be pre-hosted)

---

## 2. Monorepo architecture for the frontend apps

### 2.1 The four apps + their reason for existence

| App              | Audience              | Form factor                  | Theme default | Auth role  |
|------------------|-----------------------|------------------------------|---------------|------------|
| `apps/customer`  | Shopper (25-45)       | Mobile-first PWA             | Light         | CUSTOMER   |
| `apps/owner`     | Kirana shopkeeper     | Mobile-first PWA, one-handed | Light         | OWNER      |
| `apps/admin`     | Marketplace operator  | Desktop-first dashboard      | Light         | ADMIN      |
| `apps/rider`     | Delivery rider        | Mobile-only, outdoor sun     | **Dark**      | RIDER (P7.5) |

Three apps, not one with role-switching, because:
1. **Bundle size.** A customer never needs admin tables; an admin never
   needs the cart/checkout flow. Separating cuts each app's first-load JS
   by 40–60%.
2. **PWA install identity.** Each app installs as its own app on the
   shopper's / shopkeeper's home screen, with its own name, icon, and
   theme color.
3. **Independent deploy cadence.** Push a customer fix without
   re-deploying admin.
4. **Different render budgets.** Customer cares about TTI on a 3G phone.
   Admin cares about table density on a laptop. Different optimisation
   targets are easier in different apps.

The shared design system + shared API client + shared types make the
"three apps" feel like one product, not three.

### 2.2 Layout

```
online-kirana-store/                                  (monorepo root)
├── apps/
│   ├── backend/                                      Express API (done through Phase 6)
│   ├── web/                                          existing shadcn starter — KEEP for landing
│   ├── customer/                                     NEW Next.js 15 App Router PWA
│   ├── owner/                                        NEW Next.js 15 App Router PWA
│   ├── admin/                                        NEW Next.js 15 App Router dashboard
│   └── rider/                                        NEW (Phase 7.5)
├── packages/
│   ├── ui/                                           shadcn primitives + brand tokens + shared components
│   ├── shared/                                       error codes, runtime types, helpers (already in tree)
│   ├── api-client/                                   NEW — Axios instance + typed API methods + interceptors
│   ├── auth/                                         NEW — login/refresh/logout hooks; AuthProvider
│   ├── eslint-config/                                existing
│   ├── typescript-config/                            existing
│   └── tailwind-config/                              NEW — shared globals.css + tokens (or keep inside packages/ui)
└── turbo.json
```

### 2.3 Why this layout (vs. alternatives)

- **Per-app folder** (Turborepo's default for Next apps). Each can have
  its own `next.config.mjs`, `tsconfig.json`, env, deploy target.
- **Shared `packages/api-client`**: the same `apiClient.stores.nearby(...)`
  call works in customer + owner + admin. Three apps writing three Axios
  setups will drift.
- **Shared `packages/auth`** so the JWT-in-Zustand + refresh-on-401
  interceptor + CSRF echo is written once. Each app just `<AuthProvider role="CUSTOMER">` at the root.
- **`packages/ui` already exists** (shadcn) and carries the brand tokens
  in `src/styles/globals.css`. Every app does `import "@workspace/ui/globals.css"` in its root layout.

In production-grade monorepos this is the standard split: app-shells stay
thin, all reusable logic lives in packages. Vercel's `commerce` repo,
Linear's app, and most Turborepo examples follow this exact pattern.

---

## 3. The shared stack (decided)

| Concern               | Pick                                  | Why                                          |
|-----------------------|---------------------------------------|----------------------------------------------|
| Framework             | Next.js 15 App Router                 | RSC where useful, RCC where forms are heavy. App Router suits PWAs (offline, manifest, install).|
| Styling               | Tailwind v4 + shadcn/ui               | Already in `packages/ui`; saffron design system locked in `globals.css`. |
| Data fetching         | TanStack Query v5                     | Cache-per-query, optimistic updates, pause-on-offline. |
| HTTP client           | Axios                                 | Refresh-on-401 interceptor is cleaner than fetch; per-app instance from `@workspace/api-client`. |
| Client state          | Zustand                               | Auth + cart + UI prefs only. Server state stays in TanStack Query. |
| Animation             | Motion (motion.dev)                   | Layout animations + tap feedback. shadcn primitives already use radix; layer Motion on top. |
| Forms                 | react-hook-form + zod                 | Backend zod schemas re-exported via `@workspace/shared` so client validation matches server byte-for-byte. |
| Maps                  | MapLibre GL + a custom warm style     | OpenStreetMap tiles. The owner-side delivery-radius drag + rider route depend on this in later phases. |
| Icons                 | lucide-react                          | shadcn default, 1.5px stroke. |
| Toasts                | sonner                                | shadcn-recommended, mobile-friendly. |
| PWA                   | next-pwa OR Serwist                   | Manifest + service worker. Picked per app at install time. |
| Tests (FE)            | Vitest + React Testing Library + Playwright (later) | Same Vitest config style as backend. |

### 3.1 Auth pattern (one place to write it — `packages/auth`)

```ts
// packages/auth/src/store.ts (Zustand)
interface AuthState {
  user: { id: string; role: Role; name: string; phone: string } | null
  accessToken: string | null            // in memory only — NEVER localStorage
  setSession: (user, token) => void
  clear: () => void
}
```

```ts
// packages/api-client/src/client.ts
export const api = axios.create({ baseURL: env.API_URL, withCredentials: true })

// Request interceptor: attach access token if present
api.interceptors.request.use((cfg) => {
  const t = useAuthStore.getState().accessToken
  if (t) cfg.headers.Authorization = `Bearer ${t}`
  // CSRF: echo kirana_csrf on /v1/auth/refresh and /v1/auth/logout
  if (cfg.url?.startsWith("/v1/auth/refresh") || cfg.url?.startsWith("/v1/auth/logout")) {
    const csrf = getCookie("kirana_csrf")
    if (csrf) cfg.headers["X-Csrf-Token"] = csrf
  }
  return cfg
})

// Response interceptor: on 401, try refresh once, retry the original request
let refreshInFlight: Promise<string> | null = null
api.interceptors.response.use(undefined, async (err) => {
  if (err.response?.status === 401 && !err.config._retried) {
    refreshInFlight ??= refreshOnce()
    try {
      const newToken = await refreshInFlight
      err.config._retried = true
      err.config.headers.Authorization = `Bearer ${newToken}`
      return api(err.config)
    } finally {
      refreshInFlight = null
    }
  }
  throw err
})
```

This single setup serves all three apps. They differ only in which role
they require at the root layout.

### 3.2 Routing strategy

App Router for everything. Authenticated areas live under `(authed)/`
route group with a `layout.tsx` that does:

```tsx
// apps/customer/app/(authed)/layout.tsx
"use client"
import { useAuthGuard } from "@workspace/auth"
export default function AuthedLayout({ children }) {
  useAuthGuard({ requiredRole: "CUSTOMER", redirectTo: "/login" })
  return <>{children}</>
}
```

Public anonymous routes (homepage, /stores/[id], landing) live outside
the group.

### 3.3 Data fetching: server vs. client

- **Public discovery (RSC)**: `/v1/stores/nearby`, `/v1/stores/:id`,
  `/v1/categories`, `/v1/search/products` — fetch in server components
  (no token needed). Cache for the requested geo coords + filters via
  Next's `fetch` with `cache: "no-store"` for the geo-bounded queries,
  but allow `revalidate: 60` for category lists.
- **Authenticated reads (CSR)**: `/v1/auth/me`, `/v1/stores/me/*`,
  `/v1/addresses` — fetch with TanStack Query in client components. The
  Authorization header lives in memory; SSR can't see it.
- **Mutations**: always TanStack Query `useMutation` with optimistic
  updates where the UX wins (toggling product availability, marking
  default address). Roll back on error.

### 3.4 Shared types

`packages/shared` already exports `error-codes.ts`. Extend it with:

```ts
// packages/shared/src/api-types.ts (NEW)
export interface StorePublicView { ... }
export interface StoreNearbyHit extends StorePublicView { distanceMeters: number }
export interface ProductPublicView { ... }
export interface AddressView { ... }
// ...etc.
```

Hand-mirrored from the backend service files for now. Phase 13 can add
OpenAPI codegen if the surface grows.

### 3.5 Env

Per-app `.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:4000
```

CORS on the backend reads `CORS_ALLOWED_ORIGINS` (comma-separated). Add
each FE origin you run locally:

```
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3002
```

Customer on `:3000`, owner on `:3001`, admin on `:3002` is a sane convention.

---

## 4. Per-app phased plan (backend-scope-aware)

Below, each phase is a SHIPPABLE slice. Don't roll the next phase until
the current one is end-to-end working in a browser.

### 4.1 `apps/customer` — shopper PWA

| FE Phase | Title                                | Backend dependency       | Build                                                                 |
|----------|--------------------------------------|--------------------------|-----------------------------------------------------------------------|
| C-0      | Scaffold + shared brand wired        | none                     | `next-pwa` config, manifest (saffron theme color), root layout pulls `@workspace/ui/globals.css`, Oxanium font. Single placeholder page proving the brand renders. |
| C-1      | Auth (login + signup + me)           | Phase 3                  | `/login`, `/signup` flows. Role pre-set to CUSTOMER on signup. Auth store + interceptor from `@workspace/auth`. `/profile` shows `me`. Logout works. |
| C-2      | Browse — homepage + store cards      | Phase 5 (nearby)         | Homepage = `/stores/nearby` results rendered as cards (image, name, distance pill, open dot, min order, ETA). Sticky location chip; geolocation prompt for first-time users. Empty state when no results. |
| C-3      | Store detail + product grid          | Phase 5 (`/:id`, `/:id/products`) + Phase 4.1 (categories) | `/stores/[id]` route. Hero header, sticky category sub-nav, featured row first, 2-col product grid. "Closed" banner when `isOpen=false`. |
| C-4      | Search                               | Phase 4.2                | `/search?q=` route. Debounced input. Score-sorted results. Empty state. Recent searches in localStorage. |
| C-5      | Address book                         | Phase 6                  | `/account/addresses` list (default first). Add / edit / delete sheets. "Set default" pill. Map picker (MapLibre) for lat/lng. Max-20 surfaced as a tooltip. |
| C-6      | Cart (local, no API yet)             | none — Zustand-only       | Cart store keyed by `(storeId)`. Single-store enforcement client-side (can swap if user adds from a different store). Coupon preview against `/v1/coupons/preview` once Phase 4.3 path is wired. |
|     (gap)| Order placement, order detail        | Phase 7 (not built)      | Wait. Show "Checkout coming soon" CTA on cart for now if you want to demo, OR hide checkout button entirely until Phase 7 lands. |

Stop point for now: **C-6**. Anything beyond needs Phases 7-11.

### 4.2 `apps/owner` — shopkeeper PWA

| FE Phase | Title                                | Backend dep                     | Build                                                                 |
|----------|--------------------------------------|----------------------------------|-----------------------------------------------------------------------|
| O-0      | Scaffold + brand                     | none                             | Same scaffold pattern as customer. Manifest with the SAME saffron theme, different app name + icon. |
| O-1      | Auth + pending-approval gate         | Phase 3                          | `/login`, `/signup` (role=OWNER pre-locked). If signup returns 201 but no tokens → show "awaiting admin approval" full-screen. Polling `/auth/login` quietly every 60s to detect approval flip is acceptable for now. |
| O-2      | Store onboarding                     | Phase 4.1 (`POST /stores/me`)    | If `GET /stores/me` → 404 `STORE_NOT_CREATED`, route to multi-step onboarding (name → image → location pin on MapLibre → delivery radius drag → min order → opening hours). |
| O-3      | "Today" dashboard                    | Phase 4.1 + Phase 4.3            | Big OPEN/CLOSED master switch (`PATCH /stores/me/open`). Tiles: today's orders (placeholder, Phase 7), today revenue (placeholder). Active orders list = empty until Phase 7. |
| O-4      | Products catalogue                   | Phase 4.1 + Phase 4.3            | List with category filter chips + search (delegates to `?q=`). Each row: image, name, unit, price (Geist Mono), In-stock toggle (`isAvailable`), overflow menu (Edit / Feature / Delete). |
| O-5      | Add / edit product                   | Phase 4.1 + Phase 4.2            | Form: image url (pre-hosted until Phase 12), name, category dropdown, price, unit, description, **searchAliases chip input** (English + Romanized + Devanagari supported by backend). Save / save-and-add-another. |
| O-6      | Featured pin                         | Phase 4.3                        | "Pin to featured" sheet from a product row, with `featuredOrder` numeric input (or just up/down handles in a separate "Manage featured row" screen). |
| O-7      | Store-scoped coupons                 | Phase 4.3                        | List + create + delete coupons for THIS store only. Code, type, value, validity. |
|     (gap)| Incoming orders, riders, payouts     | Phase 7 / 7.5                    | Wait. |

Stop point for now: **O-7**.

### 4.3 `apps/admin` — operator dashboard

| FE Phase | Title                          | Backend dep                  | Build                                                                 |
|----------|--------------------------------|------------------------------|-----------------------------------------------------------------------|
| A-0      | Scaffold + dense brand         | none                         | Use the SAME `globals.css` but render at desktop density (tighter radius, smaller paddings via Tailwind variants). Persistent sidebar layout. |
| A-1      | Login (seeded admin)           | Phase 3                      | Only login — NO signup. Admin accounts are seeded; surface that explicitly on the screen. Persist session same way. |
| A-2      | Owners — pending approvals     | Phase 3                      | Data table from `/admin/users/pending-owners`. Approve / Reject buttons with confirm modal. Reject requires a reason (textarea). |
| A-3      | Categories                     | Phase 4.1                    | List + create + reorder (displayOrder) + edit icon. Two-pane layout. |
| A-4      | Global coupons                 | Phase 4.3                    | List + create wizard (type / value / scope / min order / max discount / validity / per-user / total). Soft-delete. |
| A-5      | Product promotions             | Phase 4.3                    | Browse all products (use `/v1/search/products` with no auth scope — admins are just bigger customers in read context). Bulk "Promote until..." action sets `isPromoted + promotedUntil`. |
| A-6      | Dashboard KPIs                 | (existing endpoints)         | Stat tiles: stores active, owners pending. The richer KPIs (orders, GMV) wait for Phase 7. |
|     (gap)| Store moderation, audit, etc.  | future admin phase           | Wait. |

Stop point for now: **A-6**.

### 4.4 `apps/rider` — DEFERRED

Don't start this app until backend Phase 7.5 ships. The endpoint surface,
broadcast-claim race, and reassignment flow all live there. Designing the
UI now is premature — wait for the contract.

---

## 5. Suggested build order (across the three apps)

You'll want to do this in layers, not one-app-at-a-time. The reason: when
you build customer C-1 (auth) and owner O-1 (auth) back-to-back, you
catch the `@workspace/auth` API mismatches once instead of twice.

1. **Foundation week**:
   - Build `packages/api-client` + `packages/auth` to the level
     described in §3.1 and §3.5. Unit-test the interceptor.
   - Define `packages/shared/api-types.ts` mirroring the backend service
     view interfaces.
   - C-0, O-0, A-0 (scaffolds).
2. **Auth week**:
   - C-1, O-1, A-1 in parallel. They all share `packages/auth`.
3. **Customer-first sprint** (the shopper is the user; ship something
   they can use):
   - C-2 → C-3 → C-4 → C-5 → C-6.
4. **Owner sprint**:
   - O-2 → O-3 → O-4 → O-5 → O-6 → O-7.
5. **Admin sprint** (least urgent; you've been hand-editing the DB so far):
   - A-2 → A-3 → A-4 → A-5 → A-6.

Pause between sprints to wait on backend Phase 7 (orders) and Phase 7.5
(riders) before going further.

---

## 6. Things to watch out for

- **Decimal lat/lng come back as strings.** `parseFloat(store.latitude)`
  before passing to MapLibre. Documented in `stores.service.ts` and
  re-stated here because you WILL forget.
- **Owner auth is two-step.** Signup succeeds without tokens; you need an
  admin to approve before login works. The "awaiting approval" screen is
  load-bearing UX, not optional.
- **The `/me` sentinel.** `GET /v1/stores/me` is for the authed owner;
  `GET /v1/stores/<id>` is the public detail. Don't construct
  `/v1/stores/${user.storeId}` when you want owner data — use `/me`.
- **OPEN ≠ ACTIVE.** Store can be active (visible in listings) but closed
  (`isOpen=false`) for opening-hours reasons. Customer-side: show but
  badge "Closed". Owner-side: a single master switch toggles isOpen.
- **No images uploads yet.** Phase 12 brings Cloudinary signed uploads.
  Until then, product/store image URLs are typed in as
  `https://...` links. Workaround: use Unsplash or a static `/public`
  folder for demos.
- **No real-time yet.** Don't build "live order status" until Phase 9.
- **Phone shape**: always pass the user-entered phone unchanged in the
  POST body — backend normalises. Don't pre-strip dashes/spaces.
- **CSRF echo.** Login response sets `kirana_csrf` cookie. Read it back
  on every refresh / logout call. (`@workspace/auth` handles this.)
- **Page-based pagination on /stores/nearby and /:id/products.** Max
  `page=50`, `limit=100`. Don't try to scroll past those.
- **Strict request bodies.** Backend zod is `.strict()` everywhere —
  unknown fields → 400. Don't ship debug-tagged keys in your DTOs.

---

## 7. What to ask the backend before building each phase

Each FE phase has a corresponding backend phase you should have read at
least the **routes file** of. Quick map:

| FE you're building            | Read this server file                                     |
|-------------------------------|------------------------------------------------------------|
| Login / signup forms          | `apps/backend/src/modules/auth/auth.routes.ts`             |
| Address book                  | `apps/backend/src/modules/addresses/addresses.routes.ts`   |
| Owner store CRUD              | `apps/backend/src/modules/stores/stores.routes.ts`         |
| Public store detail / nearby  | same file (storesPublicRouter)                             |
| Product CRUD                  | `apps/backend/src/modules/products/products.routes.ts`     |
| Search                        | `apps/backend/src/modules/search/search.routes.ts`         |
| Coupon preview                | `apps/backend/src/modules/coupons/coupons.routes.ts`       |
| Admin tables                  | `apps/backend/src/modules/admin/admin.routes.ts`           |

The routes file lists every accepted query/body schema. The
corresponding `*.schemas.ts` is the source of truth for shape.

---

## 8. Acceptance for "FE Phase N is done"

A phase is done when:
1. The UI renders correctly in light AND dark mode at 390×844 (mobile)
   for customer/owner/rider, 1440×900 for admin.
2. All endpoints used are wired through the shared `@workspace/api-client`
   methods (not raw `axios.get`).
3. The auth flow handles: anonymous (redirect), authed-correct-role (OK),
   authed-wrong-role (403 → friendly page).
4. Loading skeletons exist (not spinners) for cards, lists, and store
   detail. Empty states have a warm illustration + an action.
5. Errors from the backend display the `message` (not "Something went
   wrong") — except where security-sensitive (`INVALID_CODE` for
   coupons). Pattern-match on `error.code` to decide.
6. Lighthouse mobile: ≥ 80 PWA, ≥ 80 perf on the deployed Vercel preview.
7. Pushed and merged with PR description listing the screens.

---

That's it. Pull `PROGRESS.md` for backend phase state, this doc for the
frontend handoff. Update both when you ship.
