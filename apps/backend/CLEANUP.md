# Cleanup Phase — Plan

> Pre-Phase-7 cleanup. Four sub-phases that ship sequentially before order
> placement. Each is independently committable. Read top-to-bottom; if
> anything looks wrong, flag it BEFORE I start coding.

## Scope at a glance

| Sub-phase | Title                                       | Why now (blocking)                                  | Est. effort |
|-----------|---------------------------------------------|------------------------------------------------------|-------------|
| **6.5**   | Auth replacement (better-auth)              | Blocks all frontend work; refresh-on-reload bug      | ~1.5 days   |
| **6.6**   | Taxonomy upgrade (Department/Category/Subcategory) | Blocks customer browse FE + owner catalog FE | ~1 day      |
| **6.7**   | Cloudinary signed uploads                   | Blocks owner product image upload FE                 | ~0.5 day    |
| **6.8**   | Product-level discounts                     | Better to ship with taxonomy than retrofit later     | ~0.5 day    |

**Order of execution: 6.5 → 6.6 → 6.7 → 6.8.** Auth first because every
endpoint depends on it; reworking auth after taxonomy means re-touching
every test fixture twice.

---

## Phase 6.5 — Auth replacement with better-auth

### The bug

Current symptom: refresh the browser, user is logged out. Root cause:
the access token lives in memory only (Zustand store). On page reload
the store resets to `null`, the frontend has no token, and the
`/v1/auth/refresh` endpoint isn't called automatically because there's
no React boot-time effect wired to it. We could fix this in the
frontend (effect on mount that tries refresh-then-me), but the bigger
issue is the whole token-in-memory + refresh-cookie + CSRF dance is
hand-rolled. Every edge case (tab focus, multiple tabs, axios queue
during refresh, expired refresh token) is a fresh bug waiting to
happen.

### The fix

Replace the whole auth subsystem with [better-auth](https://better-auth.com).
Session lives in an `httpOnly` cookie backed by a DB row — the cookie
survives reloads, multi-tab, everything. No more access tokens in
memory, no more refresh interceptors, no more CSRF double-submit logic
(better-auth handles it via SameSite + origin checks).

This is the same library used in the echoboard reference project. We
adopt it whole-cloth, not piecemeal.

### Auth model: vanilla emailAndPassword + phone as a profile field

We use better-auth's primary path: `emailAndPassword`. No plugins
needed for the auth flow itself. **Login identifier is the user's
email.** Phone is stored as a required additional field on the User
model — used for delivery contact, order-status WhatsApp/SMS
(Phase 10), and snapshotted into Order at place-time.

This matches how most Indian quick-commerce apps actually shape
auth-vs-contact (Swiggy / Zomato / Blinkit all let you log in via
email or Google; phone is collected separately for delivery).

- **Signup**: `authClient.signUp.email({ email, password, name, phone, role })`
- **Login**: `authClient.signIn.email({ email, password })`
- **Future-friendly**: when we want Google sign-in, it's a one-config
  block (`socialProviders: { google: {...} }`). When we want phone
  OTP for password reset, we layer the `phoneNumber` plugin on top
  with an SMS provider, no migration.

### Schema changes (one migration, destructive on dev DB)

Better-auth wants its own tables: `account`, `session`, `verification`,
and it owns the `user` table shape (id, email, name, image,
emailVerified, createdAt, updatedAt) PLUS any `additionalFields` we
declare.

We keep our existing domain models (Store, Product, Address, Order,
etc.) untouched; only the User-and-friends area changes.

```prisma
// Better-auth-managed user, with our additional fields.
model User {
  id             String   @id @default(cuid())
  name           String
  email          String   @unique               // the login identifier
  emailVerified  Boolean  @default(false)       // becomes true when we add email-verification later
  image          String?

  // additionalFields — declared in the better-auth config.
  // Phone is required for everyone; it's how stores call customers and
  // how customers identify themselves to a delivery rider. Unique so
  // no two accounts can share one phone (matches today's behaviour).
  phone          String   @unique               // E.164, normalized
  role           Role
  isApproved     Boolean  @default(true)
  approvedAt     DateTime?
  approvedById   String?
  approvedBy     User?    @relation("UserApprovedBy", fields: [approvedById], references: [id], onDelete: SetNull)
  approvedUsers  User[]   @relation("UserApprovedBy")

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  // ALL existing relations (Store, Address, Order, etc.) kept exactly.
  ownedStore         Store?
  addresses          Address[]
  orders             Order[]              @relation("OrdersByCustomer")
  statusHistoryActs  OrderStatusHistory[] @relation("StatusActor")
  pushSubscriptions  PushSubscription[]
  idempotencyKeys    IdempotencyKey[]
  couponsCreated     Coupon[]             @relation("CouponCreatedBy")
  couponRedemptions  CouponRedemption[]

  // Better-auth tables relate to user.
  sessions  Session[]
  accounts  Account[]

  @@index([role])
  @@index([role, isApproved])
}

model Session {
  id        String   @id @default(cuid())
  expiresAt DateTime
  token     String   @unique
  ipAddress String?
  userAgent String?
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Account {
  id                    String    @id @default(cuid())
  accountId             String                              // for credential = userId
  providerId            String                              // "credential" for password auth
  userId                String
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?                              // bcrypt hash (better-auth uses bcrypt by default; configurable to argon2)
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt
}

model Verification {
  id         String   @id @default(cuid())
  identifier String                                          // unused without email-verification plugin
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}

// RefreshToken model from our old setup — DROPPED.
// We rip out: lib/jwt.ts, lib/refresh-tokens.ts, lib/csrf.ts,
// middleware/auth-rate-limit.ts (better-auth has its own rate limiter).
```

**Migration approach: big-bang reset on dev.** We have ~5 seeded
accounts + a handful of test users. We don't ship to prod yet. The
migration drops the old User/RefreshToken tables, creates the new
ones, and the seed script recreates the seeded accounts via the
better-auth API (not direct DB insert — so password hashes match what
better-auth expects).

If we ever DO ship to prod before this and have real users, the
migration becomes a "force everyone to reset their password" flow.
Out of scope for now.

### Backend integration

```ts
// apps/backend/src/lib/auth.ts                              NEW
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { prisma } from "../db/prisma.js"
import { Role } from "../generated/prisma/enums.js"
import { env } from "../config/env.js"
import { normalizePhone, isLooksLikePhone } from "./phone.js"

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,            // http://localhost:4000 in dev
  trustedOrigins: env.CORS_ALLOWED_ORIGINS,

  emailAndPassword: {
    enabled: true,
    autoSignIn: true,                      // log them in immediately on signup
    minPasswordLength: 8,
  },

  user: {
    additionalFields: {
      phone:      { type: "string",  required: true,  input: true },
      role:       { type: "string",  required: true,  input: true,  defaultValue: "CUSTOMER" },
      isApproved: { type: "boolean", required: false, input: false, defaultValue: true },
      approvedAt: { type: "date",    required: false, input: false },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,          // 30 days
    updateAge:  60 * 60 * 24,              // sliding refresh — re-stamp every 24h
    cookieCache: { enabled: true, maxAge: 5 * 60 },   // 5 min in-memory cache
    cookieName: "kirana-session",
  },

  // Hooks: validate phone shape, enforce the OWNER pending-approval gate.
  databaseHooks: {
    user: {
      create: {
        before: async (data) => {
          // Validate + normalize phone server-side (same helper as today).
          if (typeof data.phone !== "string" || !isLooksLikePhone(data.phone)) {
            throw new Error("Invalid phone number")
          }
          data.phone = normalizePhone(data.phone)

          if (data.role === Role.ADMIN) {
            // ADMIN signup is closed — only seeded admins exist.
            throw new Error("ADMIN signup not allowed")
          }
          if (data.role === Role.OWNER) {
            data.isApproved = false        // owner waits for admin approval
          }
          return { data }
        },
      },
    },
    session: {
      create: {
        before: async (data) => {
          // Reject login for owners whose isApproved is still false —
          // matches today's "403 Account is pending admin approval".
          const user = await prisma.user.findUnique({ where: { id: data.userId } })
          if (user?.role === Role.OWNER && !user.isApproved) {
            throw new Error("Account is pending admin approval")
          }
          return { data }
        },
      },
    },
  },

  rateLimit: {                              // built-in; replaces our auth-rate-limit middleware
    enabled: true,
    storage: "memory",                      // OK for dev; "database" for prod
    window: 60,
    max: 100,
  },
})
```

```ts
// apps/backend/src/app.ts                                   MODIFIED
import { toNodeHandler } from "better-auth/node"
import { auth } from "./lib/auth.js"

// IMPORTANT: mount BEFORE express.json() so better-auth controls body parsing.
app.all("/v1/auth/*splat", toNodeHandler(auth))             // Express 5 syntax

// ...then everything else as before.
```

```ts
// apps/backend/src/middleware/auth.ts                      REWRITTEN
import { fromNodeHeaders } from "better-auth/node"
import { auth } from "../lib/auth.js"
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js"
import { Role } from "../generated/prisma/enums.js"

// Augments Request with req.session + req.user, populated from the cookie.
export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    })
    if (!session) throw new UnauthorizedError()
    if (!session.user.isApproved) {
      throw new ForbiddenError("Account is pending admin approval")
    }
    req.user = {
      id: session.user.id,
      role: session.user.role as Role,
      isApproved: session.user.isApproved,
    }
    req.session = session
    next()
  } catch (err) {
    next(err)
  }
}

// requireRole, requireOwnStore stay byte-for-byte the same (they only
// read req.user, which is still populated).
```

### Old endpoint contract → new endpoint contract

| Old (custom)                                    | New (better-auth)                          | Notes                                                  |
|-------------------------------------------------|--------------------------------------------|--------------------------------------------------------|
| `POST /v1/auth/signup`                          | `POST /v1/auth/sign-up/email`              | Body: `{ email, password, name, phone, role }`         |
| `POST /v1/auth/login`                           | `POST /v1/auth/sign-in/email`              | Body: `{ email, password }`                            |
| `POST /v1/auth/refresh`                         | GONE — session cookie auto-refreshes       | sliding window via session.updateAge                   |
| `POST /v1/auth/logout`                          | `POST /v1/auth/sign-out`                   |                                                        |
| `GET /v1/auth/me`                               | `GET /v1/auth/get-session`                 | Returns `{ user, session }` (incl. our additional fields) |

We provide a thin compatibility shim layer for the FE so it can stay
oblivious to better-auth's path naming. In `@workspace/api-client` we
expose `apiClient.auth.login(phone, password)` etc. that call the
better-auth endpoints under the hood. (FE work, not in this phase.)

### Frontend integration (NOT in this phase, but planned)

Install `better-auth` and `better-auth/react` in each FE app. Replace
the planned `packages/auth` Zustand store with:

```tsx
// app/layout.tsx
import { authClient } from "@workspace/auth-client"
const { useSession } = authClient
// useSession() reads the cookie automatically; survives reload.
```

No axios interceptor, no refresh logic, no token storage. The cookie
just works.

### Files touched

```
apps/backend/
  package.json                          + better-auth dependency
  prisma/schema.prisma                  Modified: User reshaped, +Session +Account +Verification, -RefreshToken
  prisma/migrations/<ts>_better_auth/   New: DROP TABLE User cascade + recreate
  prisma/seed.ts                        Rewritten: uses auth.api.signUpEmail to create seeded users
  src/lib/auth.ts                       NEW: better-auth instance
  src/lib/jwt.ts                        DELETED
  src/lib/refresh-tokens.ts             DELETED
  src/lib/csrf.ts                       DELETED
  src/middleware/auth.ts                Rewritten: getSession instead of verifyAccessToken
  src/middleware/auth-rate-limit.ts     DELETED (better-auth's rate limiter handles it)
  src/modules/auth/                     DELETED entirely; better-auth owns /v1/auth/*
  src/app.ts                            Mount toNodeHandler(auth) at /v1/auth/*; remove old authRouter
  src/config/env.ts                     + BETTER_AUTH_SECRET + BETTER_AUTH_URL
  .env.example                          + the same two
  tests/auth.test.ts                    Rewritten: hits sign-up/email, sign-in/username, get-session
  tests/helpers/factories.ts            Rewritten: signupCustomer / signupApprovedOwner use better-auth endpoints + cookies
  ALL OTHER TESTS                       Auth headers change from `Authorization: Bearer ...` to a cookie. Update test helpers — about a 1-line change per fixture if the factories are right.
```

### Tests (auth specifically)

| # | Case |
|---|---|
| 1 | Customer signup → 200, session cookie set, GET /get-session returns user with role/phone/isApproved |
| 2 | Owner signup → 200, but session is blocked (isApproved=false → "pending admin approval" via session.create hook) |
| 3 | Owner login before approval → blocked with the same hook message |
| 4 | Admin approves owner (existing admin route still works) → owner can now log in |
| 5 | Duplicate email signup → 409 (better-auth's built-in unique enforcement) |
| 6 | Duplicate phone signup → 409 (our DB-level unique constraint on phone) |
| 7 | Invalid phone shape (e.g. "abc", "123") → 400 from the user.create hook |
| 8 | Wrong password → 401 |
| 9 | Session cookie survives a fresh `request(app)` call (mimics page reload) — THE bug we're fixing |
| 10 | Sign-out clears the session row + cookie |
| 11 | ADMIN role on signup → rejected via hook (closed signup) |
| 12 | Customer hits /v1/addresses without cookie → 401 |
| 13 | Customer hits /v1/addresses WITH cookie → 200 |
| 14 | Rate limit kicks in on repeated wrong-password attempts |

The 134 existing non-auth tests need their auth-header swap to a
cookie. The factories.ts rewrite handles that in one place — every
test that uses `customer.bearer` becomes `customer.cookie` and the
test helper sets the cookie via `request.agent()` instead of
`Authorization` header.

### How we hit echoboard quality

1. **Use the library as designed.** No custom session table, no
   re-rolling cookie logic. Trust better-auth.
2. **Integration tests for the full flow.** Including the
   "survives-fresh-request" test that mimics a page reload.
3. **Manual browser verification before declaring done.** Sign up,
   log in, hit a protected route, refresh the tab, hit the route
   again, observe still-logged-in. If that doesn't work, the phase
   doesn't ship.
4. **No premature features.** No OAuth, no 2FA, no email verification,
   no magic links in this phase. Phone+password only. We can add OTP
   for password reset in a later phase when we wire an SMS provider.

---

## Phase 6.6 — Taxonomy upgrade

### Final shape (locked from your message)

```
Department (admin)
└─ Category (admin)
   └─ Subcategory (store-owned)
      └─ Product (store-owned)
```

Authority:
- **L1 Department** + **L2 Category** = global, admin-managed. Every
  store sees the same taxonomy.
- **L3 Subcategory** + **L4 Product** = per-store. Each store curates
  its own L3 under any L2 the admin has published.

### The owner UX flow (per your message)

1. Owner opens "Catalogue" — sees the Blinkit-style grid of admin's
   Departments + Categories (read-only browsing).
2. Owner taps a Category (e.g., "Atta, Rice & Dal").
3. **If no subcategory exists** for this store under that category →
   empty state: *"Start by creating your first sub-category under Atta,
   Rice & Dal — for example, Atta or Rice or Dal."*
4. Owner names a subcategory ("Rice"), it's saved against
   (storeId, categoryId).
5. Now they see an empty product list with "+ Add product" CTA.
6. Add product flow: name, price, unit, image, optional discount
   fields — categoryId/subcategoryId are implied from the path the
   owner walked through.

### Schema (additive + one re-FK)

```prisma
model Department {                       // NEW — L1
  id           String     @id @default(cuid())
  name         String     @unique
  displayOrder Int        @default(0)
  iconUrl      String?
  createdAt    DateTime   @default(now())
  categories   Category[]
  @@index([displayOrder])
}

model Category {                         // EXISTING — gets departmentId
  id           String        @id @default(cuid())
  departmentId String                                        // NEW (eventually non-null)
  department   Department    @relation(fields: [departmentId], references: [id], onDelete: Restrict)
  name         String
  displayOrder Int           @default(0)
  iconUrl      String?
  createdAt    DateTime      @default(now())
  subcategories Subcategory[]
  @@unique([departmentId, name])         // names unique within a department
  @@index([departmentId, displayOrder])
}

model Subcategory {                      // NEW — L3 (store-owned)
  id           String   @id @default(cuid())
  storeId      String
  store        Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)
  categoryId   String
  category     Category @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  name         String
  displayOrder Int      @default(0)
  isAvailable  Boolean  @default(true)   // for the bulk stock-toggle flow
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  products     Product[]
  @@unique([storeId, categoryId, name])  // one "Rice" sub per (store, category)
  @@index([storeId, categoryId, displayOrder])
}

model Product {                          // EXISTING — re-FK from category to subcategory
  // ...all existing fields kept except categoryId...
  subcategoryId String                   // REPLACES categoryId
  subcategory   Subcategory @relation(fields: [subcategoryId], references: [id], onDelete: Restrict)
  // ...
}
```

### Migration plan

1. **Step 1 (additive):** add Department, Subcategory tables; add
   nullable `departmentId` on Category; add nullable `subcategoryId`
   on Product.
2. **Step 2 (data, idempotent):**
   - Create 4 default Departments matching Blinkit-ish: `Grocery & Kitchen`, `Snacks & Drinks`, `Beauty & Personal Care`, `Household Essentials`.
   - Backfill `Category.departmentId` for the 4 existing categories
     based on their names.
   - For each Store that has products, create one default Subcategory
     per Category that store has products in, named after the Category
     itself (e.g., store gets a subcategory called "Atta, Rice & Dal"
     under the category "Atta, Rice & Dal" — same name; owner can rename
     later).
   - Re-point each Product's `categoryId` → new `subcategoryId`.
3. **Step 3 (lock):** flip `Category.departmentId` to NOT NULL, drop
   the old `Product.categoryId` column, add the new FK constraint.
4. Update the **search trigger** to include `department.name` +
   `category.name` + `subcategory.name` in the tsvector. (Trigger
   rebuild + one-time `UPDATE Product SET searchAliases =
   searchAliases` to repopulate all rows.)

### API surface changes

**Public CUSTOMER-facing endpoints — see the "Updated backend
contract" block further below** (under "Customer store-detail flow")
for the authoritative shape. It supersedes the simpler tree-response
I'd sketched here originally; the new flow surfaces categories as
icon-grid + scroll-sections on store home, and a dedicated category
page renders the dual-pane subcategory/product picker.

The remaining endpoints (admin + owner CRUD) are unaffected by the
customer-flow refinement:

```
Public:
  GET    /v1/departments                      list w/ nested categories
  GET    /v1/categories                       still flat for owner-side compat
  GET    /v1/categories/:id                   single, with departmentId

Admin:
  POST   /v1/admin/departments
  PATCH  /v1/admin/departments/:id
  POST   /v1/admin/categories                 body: { departmentId, name, ... }
  PATCH  /v1/admin/categories/:id

Owner:
  POST   /v1/stores/me/subcategories          body: { categoryId, name }
  GET    /v1/stores/me/subcategories          ?categoryId=  for the cascading picker
  PATCH  /v1/stores/me/subcategories/:id      rename, reorder, change displayOrder
  DELETE /v1/stores/me/subcategories/:id      empty-only (Restrict on Product FK)
  PATCH  /v1/stores/me/subcategories/:id/availability  { isAvailable }
                                              bulk-toggles all products under it
                                              (monsoon-morning use case)
  POST   /v1/stores/me/products               body now requires subcategoryId, NOT categoryId
  POST   /v1/stores/me/products/:id/move      { subcategoryId } — move between subs in same store
```

### Tests (taxonomy)

Roughly 25 cases covering: department + category CRUD (admin); subcategory CRUD (owner, scope-locked); product create requires a subcategory owned by this store (cross-store rejection); search trigger picks up all three levels; store detail emits the nested tree; bulk availability toggle; product move between subs.

---

## Phase 6.7 — Cloudinary signed uploads

### S3 vs Cloudinary (decided: Cloudinary)

| Concern              | S3 + CloudFront                      | Cloudinary                                      |
|----------------------|--------------------------------------|--------------------------------------------------|
| Storage cost         | $0.023/GB                            | Free tier 25 credits/mo; ~$0.10/GB after        |
| Bandwidth            | $0.085/GB egress                     | Bundled with credits                            |
| Image resizing       | Build it yourself (Lambda@Edge / sharp pipeline) | Built-in: `w_600,q_auto,f_auto/v.../image.jpg`  |
| Format conversion    | Build it yourself                    | Automatic (WebP, AVIF, fallbacks)               |
| Responsive sizes     | Build it yourself                    | One URL serves all sizes                        |
| Signed uploads       | Yes (presigned PUT)                  | Yes (signed upload presets)                     |
| Dev velocity         | Slow (pipeline work)                 | Fast (sign + go)                                |
| Cost at our scale    | ~$5–10/mo with all the infra        | $0 → ~$10/mo (free tier covers MVP)             |

**Cloudinary wins** because image transformations are the long tail of
work, not storage. At kirana scale (20k products × 3 sizes = 60k
images) we stay inside the free tier for a long time.

### Backend

```ts
// apps/backend/src/lib/cloudinary.ts                  NEW
import { v2 as cloudinary } from "cloudinary"
import { env } from "../config/env.js"

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key:    env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
})

export function signUpload(opts: {
  folder: string                                       // products/<storeId>
  publicId?: string                                    // optional; cloudinary auto-generates if absent
  maxBytes?: number
}): { signature, timestamp, apiKey, cloudName, folder, publicId? } { ... }
```

### Endpoint

```
POST /v1/uploads/signature
     Body: { scope: "product" | "store", entityId?: string }
     Auth: OWNER only (scope=product|store), ADMIN (any scope)
     Response: { signature, timestamp, apiKey, cloudName, folder, eager?, maxBytes }

Frontend flow:
  1. Owner picks image file.
  2. FE POSTs /v1/uploads/signature → gets signed payload.
  3. FE POSTs the file directly to Cloudinary's upload endpoint using
     the signed payload.
  4. Cloudinary returns { secure_url, public_id, width, height, format }.
  5. FE PATCHes the product with { imageUrl: secure_url, imagePublicId: public_id }.

No image bytes ever touch our backend.
```

### Schema additions

```prisma
model Product {
  // ...
  imageUrl       String?            // EXISTING
  imagePublicId  String?            // NEW — for cleanup on product delete
}

model Store {
  // ...
  imageUrl       String?            // EXISTING
  imagePublicId  String?            // NEW
}
```

### Cleanup

When a product or store is hard-deleted (rare — products are soft-
deleted), the Phase 11 cron / Phase 13 job triggers
`cloudinary.uploader.destroy(publicId)` for the orphaned public IDs.
For soft-delete (`isActive=false`) we keep the image — restore brings
it back. No async cleanup needed in this phase.

### Env vars

```
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

### Tests

| # | Case |
|---|---|
| 1 | `POST /v1/uploads/signature` as owner → 200, payload shape valid |
| 2 | As customer → 403 |
| 3 | As anonymous → 401 |
| 4 | Invalid scope → 400 |
| 5 | Folder name is store-scoped (owner A can't request folder `products/<storeB>`) |

(Tests don't actually upload to Cloudinary — they verify signature
shape. End-to-end upload is manual smoke.)

---

## Phase 6.8 — Product-level discounts

### Concept

Owner sets a per-product discount that applies automatically at order
placement. No coupon required. Shown as strikethrough price on cards.

### Schema

```prisma
enum DiscountType {
  PERCENT       // 1..100, applied to pricePaise
  FLAT_PAISE    // absolute paise discount, must be < pricePaise
}

model Product {
  // ...existing fields...
  discountType        DiscountType?
  discountValue       Int?            // PERCENT: 1..100, FLAT_PAISE: paise
  discountValidUntil  DateTime?       // optional expiry; null = until-owner-removes
  @@index([discountValidUntil])       // for the FE filter "deals near you"
}
```

Service helpers:
- `effectivePricePaise(p)` — applies an active discount, else returns `pricePaise`.
- `isDiscountActive(p)` — `discountType != null && discountValue != null && (discountValidUntil == null || discountValidUntil > now)`.

### API

- Product create/update accepts `discountType`, `discountValue`,
  `discountValidUntil`. Validation: PERCENT 1..100, FLAT_PAISE
  ≥ 100 and < pricePaise; if discountType set, discountValue required.
- Public product views (search hits, store detail products, store
  products list) include the three discount fields when active.
- Phase 7 order placement: snapshot uses the effective price.
  `OrderItem.unitPricePaiseSnapshot` = effective.
  (Optional later: add `originalPricePaise` to OrderItem for
  strikethrough on order detail.)

### Coupon interaction

Coupons stack on product discount: discount applies first → coupon
applies to the discounted subtotal. Owner controls product discount;
coupon is a separate marketing lever (admin global or owner store).

### Featured products at SUBCATEGORY level

Per your direction: **NOT IMPLEMENTED.** Featured stays product-level
only (the existing `Product.isFeatured` + `featuredOrder`). I'll skip
the subcategory-featured idea I floated.

### Tests

| # | Case |
|---|---|
| 1 | Owner sets PERCENT discount → product view returns discount fields |
| 2 | FLAT_PAISE > pricePaise → 400 |
| 3 | discountValidUntil in the past → product view does NOT show as discounted |
| 4 | (Phase 7-coupled, deferred) order placement snapshots discounted price |

---

## Cross-cutting: file/folder impact summary

| Area                    | Phase 6.5 | Phase 6.6 | Phase 6.7 | Phase 6.8 |
|-------------------------|-----------|-----------|-----------|-----------|
| `prisma/schema.prisma`  | ✓ (major) | ✓ (major) | ✓ (small) | ✓ (small) |
| `prisma/migrations/`    | 1 destructive | 1 multi-step | 0 (only schema field add) | 1 (additive) |
| `prisma/seed.ts`        | ✓ (rewrite via better-auth API) | ✓ (departments + subs) | — | — |
| Routes/services         | auth/* rewritten | stores, products, +departments, +subcategories | +uploads | products |
| Tests                   | auth + all-tests cookie swap | +taxonomy.test.ts | +uploads.test.ts | products |
| Env vars                | +BETTER_AUTH_* | — | +CLOUDINARY_* | — |
| Deps                    | +better-auth | — | +cloudinary | — |

---

## Workflow per sub-phase (per PROGRESS.md line 397)

implement → reviewer-authz audit on the diff (always, but ESPECIALLY
on 6.5 since it's an auth rewrite) + reviewer-perf if the diff touches
queries → vitest the new test file + a single targeted re-run of
adjacent files for regressions → backtrack until green → **manual
browser verification on 6.5** (sign up → login → hit protected route →
refresh tab → still logged in) → commit "feat(backend): phase 6.X — ..."
→ backfill PROGRESS.md row → PAUSE for explicit approval before the
next sub-phase.

## What I'm NOT doing in cleanup

- No OAuth (Google/Apple). Deferred until a clear product need.
- No email verification / magic links. Deferred.
- No OTP / SMS-based password reset. Deferred — needs SMS provider
  budget decision.
- No 2FA. Deferred.
- No bulk product CSV import. Phase 12-ish.
- No subcategory-level featured pinning. (Explicitly cut per your
  message.)
- No taxonomy beyond 4 levels. The schema commits to dept → cat → sub
  → product; we don't accommodate L5+.

---

## Cross-cutting frontend conventions (not backend work — but locked here)

These are FE-side rules that the backend contract already supports.
Documented here so they're not forgotten when FE phases start; FRONTEND.md
gets the same notes after 6.5 ships.

### Money — rupees in, paise stored, rupees out

The backend speaks ONLY paise. Every monetary field on the wire is an
integer paise value (`pricePaise`, `minOrderPaise`, `totalPaise`,
`discountValue` when `discountType=FLAT_PAISE`, `maxDiscountPaise`,
etc.). That doesn't change.

The **frontend never shows paise to a human**. Every input field
labelled "Price" / "Discount" / "Min order" accepts **rupees** (with
optional 2-decimal paisa precision). The FE converts on the fly:

```ts
// packages/api-client/src/money.ts (NEW — ship with Phase 6.5 wiring)
export const rupeesToPaise = (rupees: number): number => Math.round(rupees * 100)
export const paiseToRupees = (paise: number): number => paise / 100
export const formatINR = (paise: number): string =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" })
    .format(paise / 100)
```

Convention:
- Form inputs use rupees. Submit handlers convert via `rupeesToPaise`.
- Displayed prices use `formatINR(paise)` — never raw numbers.
- API request/response shapes keep `*Paise` field names so the
  conversion boundary is obvious in the type system.

This guarantees an owner can never accidentally type "5000" meaning
₹5000 and have it land as ₹50.

### Latitude/longitude — geolocation, never typed

Wherever the backend takes `latitude` + `longitude` (Store create,
Address create), the FE collects them via the browser's
`navigator.geolocation` API + a map pin the user can drag to refine.
The two numbers are NEVER shown as numbers in the UI.

Flow:
1. FE shows "Use my current location" button. Asks permission.
2. Drops a pin on a MapLibre map at the returned coords.
3. User can drag the pin to refine (the address text below updates
   via reverse geocoding — optional, can defer to a later phase).
4. On submit, the lat/lng numbers go to the backend; the user never
   saw them.

For first-time signup on the customer side, location permission is
asked upfront so `/v1/stores/nearby` works. If the user denies, we
fall back to a city search (V2 — for now, show "enable location to
see nearby stores").

The Store create form already accepts `latitude` + `longitude` as
numbers; no backend change needed — this is pure FE.

---

## Customer store-detail flow (locked from your description)

Single store detail page renders as:

```
┌──────────────────────────────────────────┐
│  STORE BANNER                            │
│   image + name + open badge + ...        │
├──────────────────────────────────────────┤
│  Department 1 (text label)               │
│   [Cat][Cat][Cat]                        │
│   [Cat][Cat][Cat]                        │
│  Department 2                            │
│   [Cat][Cat][Cat]                        │
│   ...                                    │
├──────────────────────────────────────────┤
│  Featured Products                       │
│   [P][P][P][P]  horizontal scroll        │
├──────────────────────────────────────────┤
│  Atta, Rice & Dal  (category name)       │
│   [P][P]                                 │
│   [P][P]                                 │
│   ... lazy-paginated as user scrolls     │
│                                          │
│  Dairy & Eggs                            │
│   [P][P]                                 │
│   ... etc                                │
└──────────────────────────────────────────┘
```

Tapping a category tile in the icon grid OR the category-section
header navigates to the **category page**: dual-pane, subcategories
on the left, products on the right (your image #4 — Blinkit pattern).
That page is store-scoped, NOT global.

### Updated backend contract for Phase 6.6

This supersedes the API surface section above for Phase 6.6 — the
shape changes to support the store-home flow:

```
GET /v1/stores/:id                   PHASE 5 → REVISED IN 6.6
  → {
      store: StorePublicView,
      departments: [{                            // for the icon-grid section
        id, name, displayOrder,
        categories: [{ id, name, iconUrl }]      // only categories the STORE has products in
      }],
      featuredProducts: ProductPublicView[],     // unchanged, ≤20
      categorySections: [{                       // for the scrolling product sections
        category: { id, name },
        products: ProductPublicView[],            // top 12, ordered (featured first, name asc, id asc)
        totalCount: number,                       // for "See all 47" link
        hasMore: boolean
      }]                                          // first 8 sections; FE lazy-loads more via
                                                  // /v1/stores/:id/categories below
    }

GET /v1/stores/:id/categories             NEW IN 6.6
  ?page=&limit=                          paginate categorySections (sections 9..N)
                                          shape: same as categorySections[i] above

GET /v1/stores/:id/categories/:categoryId/subcategories      NEW IN 6.6
  → [{                                     for the LEFT rail of the category page
      id, name, displayOrder, productCount
    }]
                                          ordered by Subcategory.displayOrder

GET /v1/stores/:id/products               PHASE 5 → REVISED IN 6.6
  ?q=                                     (existing — delegates to search.service)
  ?categoryId=<adminL2Id>                 NEW — filter by admin Category via subcategory JOIN
  ?subcategoryId=<storeL3Id>              NEW — filter by exact leaf
                                          (the two filters compose; subcategoryId narrows further)
  ?page=&limit=                           (existing)
  → { items, page, limit, hasMore, totalCount }    totalCount added so the "See all 47" can render
```

The customer FE composes these endpoints like so:
- Store home: one call to `/v1/stores/:id` (everything above the fold + first 8 sections), lazy `/v1/stores/:id/categories?page=2` as user scrolls down.
- Category page: parallel `/v1/stores/:id/categories/:catId/subcategories` (left rail) + `/v1/stores/:id/products?subcategoryId=<first>&page=1` (right pane). Tap a different sub → re-fetch right pane only.

`Subcategory.iconUrl` is **not** added in 6.6 (the left rail shows
text + a small icon you can derive client-side from the first
product's image as a fallback; promoting a "set as sub icon" action
is a future polish phase).

---

**Awaiting your approval before I start coding.** Decisions locked
from your messages:
1. Better-auth, vanilla path: `emailAndPassword` + phone as required
   profile field. No plugins, no synthetic emails. Login = email +
   password. Phone is for delivery / contact only. ✅
2. Big-bang dev-DB reset OK; seed will recreate accounts via the
   better-auth API. Seeded credentials become
   `admin@kirana.local / Password123!`, `ramesh@kirana.local / ...`,
   etc. Phones stay the same (`+919900000000`, etc.) but are now
   profile data, not login. ✅
3. Execution order: 6.5 → 6.6 → 6.7 → 6.8. ✅
4. Money convention: rupees-in-FE, paise-in-backend — backend
   unchanged, FE convention documented above. ✅
5. Geolocation auto-fill: FE convention only, backend unchanged. ✅
6. Customer store-detail flow + category page layout — contract above
   matches your spec exactly. ✅
7. Featured products stay product-level only (no subcategory featured). ✅
8. Move-product-between-subcategories owner action. ✅
9. Bulk stock toggle at subcategory level. ✅
10. Bulk CSV import: deferred to a future phase. ✅

Last call — speak now if any of the 10 above is wrong.
