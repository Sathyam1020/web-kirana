# IP-2 — Product variants

> The biggest schema change in the whole roadmap. Touches catalog, cart,
> checkout, order placement, search, owner product editor, and customer
> product cards. Riskiest phase — backfill happens against live data
> and a wrong migration silently turns historical orders into orphans.
> Single in-flight defect could break commerce for every store. Plan
> for staged rollout + reversibility, not speed.

---

## Why now

Today every `Product` has exactly one `pricePaise` + one `unit`. Owners
work around it by encoding the size in the product name ("Aashirvaad Atta
5 kg" vs "Aashirvaad Atta 1 kg" — two separate products). That doesn't
scale: search treats them as unrelated items, the customer can't see all
sizes for one product at a glance, and stock is tracked per "fake product"
instead of per real SKU.

Variants fix the data model. The customer browses a single "Aashirvaad
Atta" with chips for `500 g / 1 kg / 5 kg`, adds whichever to cart, the
backend snapshots that exact variant onto the Order.

---

## Locked decisions

These are the choices that shape every later code change. Lock these
before any code lands.

### Schema shape

- **New model `ProductVariant`** carries: `name` (free-text, e.g.
  "500 ml"), `unitValue` (`Decimal(10,2)` — the numeric size, supports
  "0.5", "1.5", "12"), `unit` (the existing `Unit` enum — moved from
  Product so different sizes can use different units of the same product:
  loose by KG + packed by PIECE both as variants of "Aashirvaad Atta"),
  `pricePaise` (this is the list price; the existing
  `Product.discountType / discountValue` apply to it, no separate MRP
  field), `isAvailable` (per-variant stock), `isDefault` (exactly one per
  product), optional `sku`, `sortOrder`.
- **Per-variant images** (`imageUrl`, `imagePublicId`) — both optional.
  The customer card resolves with the fallback:
  `variant.imageUrl ?? product.imageUrl`. Lazy-owner case keeps current
  behavior (one image, all variants); detail-oriented owner uploads
  size-specific imagery.
- **No separate `mrpPaise` field.** Variant's `pricePaise` IS the list
  price; the existing Product.discountType/discountValue does the
  strikethrough math via `effectivePricePaise`. Keeping the model the
  customer already understands.
- **Discount stays on `Product`.** One discount applies to every variant
  of that product. Per-variant discount is a deferred follow-up; calling
  it out so the schema doesn't get re-shaped later.
- **`Product.pricePaise` + `Product.unit` deprecated, not deleted, in
  IP-2.0.** Populated from the default variant via a service-layer write
  to keep legacy callsites working. **Dropped in IP-2.5** as a separate
  cleanup migration once every reader has moved over.
- **`OrderItem` gains `variantId` (FK, SetNull) + snapshots**:
  `variantNameSnapshot`, `variantUnitValueSnapshot`. The existing
  `unitSnapshot` + `unitPricePaiseSnapshot` cover the rest. The existing
  `productImageUrlSnapshot` column gets the RESOLVED image at placement
  (variant's if present, else product's) — no new column, just the right
  value written. Historical rows carry `variantId = null` and the
  original snapshots — fully valid.
- **Uniqueness**: `@@unique([productId, name])` on variants (no two
  same-name variants per product). `sku` is **per-store unique** when
  present — service-layer assertion (Postgres partial-unique-with-subquery
  isn't supported directly).

### Invariants

- **Every product MUST have at least one variant.** Backfill ensures it.
  New product create requires a variants array with ≥1 entry.
- **Exactly one variant per product has `isDefault=true`.** Enforced in
  the service layer with a guarded transaction; if no default sent, mark
  the first one default.
- **A variant can't be deleted if it has historical orders.** Soft-delete
  via `isAvailable=false` instead; the model exposes no DELETE for that
  reason. (Cascade-protected by the SetNull FK + a service guard.)

### Cart + checkout contract migration

- **API accepts both `{productId, quantity}` (legacy) AND
  `{variantId, quantity}` (new) for ONE release.** When `productId` is
  sent without `variantId`, the backend looks up the product's default
  variant and uses it. After the FE fully migrates, legacy acceptance is
  dropped in IP-2.5.
- **Cart Zustand slice keyed by `variantId`** (not productId — two
  variants of the same product are distinct line items). Snapshot includes
  `productId`, `productName`, `variantName`, `pricePaise`, `imageUrl`,
  `unit`, `unitValue`, `quantity`.
- **Reject `{productId, variantId}` mixed in same cart item** as a 400.

### Search

- **Variant `name` flows into `searchVector`** alongside
  `name + description + category + store + searchAliases`. Trigger updated
  to denormalize variant names when ANY variant of a product changes.
- **No per-variant ranking.** A product still matches as a single search
  hit — but the variant chips render on the result card, so "curd 500ml"
  hits the product whose variant matches and the 500ml chip is selected
  by default in the rendered card.

### Coupons (out of scope for IP-2)

- Per-variant coupons deferred. Coupons continue to gate by `productId`
  (or whole-store / whole-cart as today). Order total reflects the
  variant's `pricePaise`; coupon math runs on the snapshotted prices,
  unchanged.

### Variant images — IN scope

- Per-variant `imageUrl` + `imagePublicId`, both optional. Resolution at
  read time: `variant.imageUrl ?? product.imageUrl`. Lazy-owner case
  preserved (one product image, every variant uses it). Detail-oriented
  owner uploads per-variant in the variant editor.
- Owner-side: each variant row in the editor gets a small `ImageUpload`
  control. Empty state shows "Uses product image" so the owner knows
  they don't *have* to upload.
- Cloudinary lifecycle: when a variant image is replaced, the old
  `imagePublicId` is destroyed (existing Cloudinary helper used by
  Product). When a variant is deleted, its `imagePublicId` is destroyed.
- Snapshot path: `OrderItem.productImageUrlSnapshot` (existing column)
  records the RESOLVED image at placement — variant's URL if present,
  else product's. No new snapshot column needed.

---

## Schema

```prisma
model ProductVariant {
  id        String  @id @default(cuid())
  productId String
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  name        String                                       // e.g. "500 ml", "1 kg", "Pack of 6"
  unitValue   Decimal @db.Decimal(10, 2)                   // numeric: 500
  unit        Unit                                         // existing enum: ML
  pricePaise  Int                                          // list price; product.discountType applies
  isAvailable Boolean @default(true)
  isDefault   Boolean @default(false)
  sku         String?
  sortOrder   Int     @default(0)

  // Per-variant image with product-image fallback at read time.
  // Customer card: variant.imageUrl ?? product.imageUrl.
  imageUrl       String?
  imagePublicId  String?                                   // Cloudinary public_id for cleanup

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  orderItems  OrderItem[]

  @@unique([productId, name])
  @@index([productId, isAvailable])
  // Per-store SKU uniqueness lives in the service layer (Postgres
  // partial-unique-with-cross-table-subquery isn't natively supported).
  // Regular index for owner-facing SKU lookup speed.
  @@index([sku])
}

model Product {
  // ...existing...
  variants ProductVariant[]
  // pricePaise + unit kept; populated from default variant for IP-2.0.
  // Dropped in IP-2.5 cleanup migration.
}

model OrderItem {
  // ...existing...
  variantId               String?
  variant                 ProductVariant? @relation(fields: [variantId], references: [id], onDelete: SetNull)
  variantNameSnapshot     String?
  variantUnitValueSnapshot Decimal? @db.Decimal(10, 2)
}
```

---

## Migration — staged

### Migration 1 (IP-2.0): additive — create variant table + backfill

Generated with `migrate dev --create-only`, hand-strip the 3 spurious
PostGIS / pg_trgm `DROP INDEX` lines, hand-append the backfill, then
apply.

```sql
-- 1. New table
CREATE TABLE "ProductVariant" ( ... );
CREATE UNIQUE INDEX ON "ProductVariant" ("productId", "name");
CREATE INDEX ON "ProductVariant" ("productId", "isAvailable");

-- 2. SKU partial unique (per-store) — Prisma can't express this
CREATE UNIQUE INDEX "ProductVariant_sku_unique"
  ON "ProductVariant" ((( SELECT "storeId" FROM "Product" WHERE id = "productId" )), sku)
  WHERE sku IS NOT NULL;
-- Note: subquery in a partial-unique-index expression isn't supported by
-- Postgres; the per-store SKU uniqueness lives in service-layer
-- assertion + a regular (sku) index for lookup speed. Documented inline.

-- 3. OrderItem additive columns
ALTER TABLE "OrderItem"
  ADD COLUMN "variantId" TEXT,
  ADD COLUMN "variantNameSnapshot" TEXT,
  ADD COLUMN "variantUnitValueSnapshot" DECIMAL(10,2),
  ADD CONSTRAINT "OrderItem_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL;

-- 4. Backfill: one default variant per product
INSERT INTO "ProductVariant" (
  "id", "productId", "name", "unitValue", "unit",
  "pricePaise", "isAvailable", "isDefault", "sortOrder",
  "createdAt", "updatedAt"
)
SELECT
  -- cuid generation in SQL: use a deterministic prefix + the product id
  -- so the backfill is idempotent and re-runnable on a snapshot.
  'cv_' || substring(p.id, 1, 23),
  p.id,
  'Default',
  1,                                                       -- placeholder; owner edits later
  p.unit,
  p."pricePaise",
  p."isAvailable",
  true,                                                    -- isDefault
  0,
  now(),
  now()
FROM "Product" p;
-- After this runs: every Product has exactly one default ProductVariant.
```

### Migration 2 (IP-2.5 cleanup, separate phase after FE migration)

Drops `Product.pricePaise` + `Product.unit`. Drops legacy
`{productId}`-without-variantId acceptance from order placement.

---

## Backfill rehearsal (mandatory)

Before any migration runs against prod:

1. `pg_dump` the prod Neon DB to a local snapshot.
2. Restore into a throwaway local Postgres (or a second Neon branch).
3. Run the migration against the snapshot.
4. Run a verification script:
   - Every product has exactly 1 variant with `isDefault=true`.
   - No product has zero variants.
   - No `ProductVariant.pricePaise` differs from its source
     `Product.pricePaise`.
5. Run the existing backend test suite against the snapshot.

Only after step 5 passes do we apply to prod. **During a low-traffic
window**. Backend deploy follows in the same window with the IP-2.0 code.

---

## Backend — code touchpoints

### Schema + migration
- `apps/backend/prisma/schema.prisma` — `ProductVariant`, `Product.variants`,
  `OrderItem.variantId` + snapshots.
- `apps/backend/prisma/migrations/<ts>_ip2_product_variants/migration.sql`
  — additive + backfill, hand-edited.

### Services
- `apps/backend/src/modules/products/products.service.ts`
  - `createProduct` + `updateProduct` accept a `variants: VariantInput[]`
    array; service enforces ≥1, exactly-one-default invariant in a
    transaction.
  - `toView` returns `variants` array on `ProductPublicView` +
    `ProductOwnerView`.
  - New helpers `assertOneDefault`, `assertSkuUniqueInStore`.
  - **For IP-2.0 only**: also writes `Product.pricePaise` + `Product.unit`
    mirroring the default variant on every create/update — legacy readers
    keep working.

- `apps/backend/src/modules/orders/orders.service.ts`
  - `placeOrder` cart-item schema accepts `{variantId, quantity}` OR
    `{productId, quantity}` (transitional). When only `productId`, look up
    the product's default variant.
  - Snapshot writes `variantId`, `variantNameSnapshot`,
    `variantUnitValueSnapshot` on the OrderItem.
  - `unitPricePaiseSnapshot` reads from variant.pricePaise (not
    product.pricePaise).
  - `effectivePricePaise` helper accepts variant + product (product still
    holds the discount fields).

- `apps/backend/src/modules/search/search.service.ts`
  - tsvector trigger updated to include variant names. New SQL in the
    migration installs `product_search_vector_update_v2` trigger that
    JOINs ProductVariant.

- `apps/backend/src/lib/pricing.ts`
  - `effectivePricePaise(variant, product)` — takes both. Discount still
    sourced from product.

### Errors
- `MultipleDefaultVariantsError` (409) — invariant violation
- `NoVariantSelectedError` (400) — cart item missing both ids
- `ProductMissingVariantsError` (400) — create/update without ≥1 variant

### Contracts (`packages/shared` + `packages/api-client`)
- `ProductPublicView` + `ProductOwnerView` gain `variants: VariantView[]`.
- `OrderItemView` gains `variantName: string | null`,
  `variantUnitValue: string | null` (Decimal as string per existing
  convention).
- `CartItemBody` becomes a discriminated union: `{variantId, quantity} |
  {productId, quantity}`. Server-side schema validates one-of.
- New types: `VariantView`, `VariantInput`, `CreateProductVariantBody`.

---

## Frontend — code touchpoints

### Customer
- `apps/customer/components/product-card.tsx` +
  `apps/customer/components/product-card-compact.tsx`
  — variant chips beneath the name. Tap a chip → that variant becomes the
  ADD target. Default-selected when card renders. Discount ribbon still
  reads from product-level discount.
- `apps/customer/lib/cart.ts` — re-key items by `variantId`. Migration
  shim: on first load after deploy, walk existing persisted items, look up
  the product's default variant via cached query, rewrite the key.
  Documented as **one-time migration** with a localStorage version bump.
- `apps/customer/app/(authed)/cart/page.tsx` — line items show variant
  name under the product name.

### Owner
- `apps/owner/app/(authed)/products/new/page.tsx` +
  `apps/owner/app/(authed)/products/[id]/page.tsx`
  — variant editor: rows of (name, unit value + unit, price, MRP,
  isAvailable toggle). "Set as default" radio.
- `apps/owner/components/variant-editor.tsx` (new) — reusable card with
  inline add / remove / reorder via drag handle.

### Search results
- `apps/customer/app/search/page.tsx` — already returns ProductPublicView;
  variant chips appear on the result cards via the shared product card
  component.

---

## Tests

### New
- `apps/backend/tests/product-variants.test.ts`
  - CRUD: create product with variants array, update mutates +
    inserts + deletes.
  - One-default invariant: rejects 0 defaults, rejects 2 defaults.
  - SKU uniqueness within a store.
  - Variant `isAvailable=false` hides it from the customer card without
    deleting it.
  - Order placement against a specific variantId snapshots correctly.
- `apps/backend/tests/orders.test.ts` (append)
  - Legacy `{productId}` cart item still resolves (uses default variant).
  - Mixed `{productId, variantId}` rejected as 400.
  - Variant `isAvailable=false` rejected at placement.
  - Order item snapshot includes variant name + unit value.
- `apps/backend/tests/search.test.ts` (append)
  - Variant name "500 ml" matches a search for "500 ml" even when the
    product name doesn't contain it.

### Backfill verification (separate script, ran against snapshot)
- `apps/backend/scripts/verify-ip2-backfill.ts` (new)
  - Asserts every product has exactly one default variant.
  - Asserts no orphan OrderItem (productId set, variantId null is fine for
    historical rows — that's the migration's intent).

### Existing tests
- Every product / order test ports to creating products with variants.
  Bulk of the diff is in test factories — `newProduct` accepts a
  `variants?` parameter, defaults to a single "Default" variant.

---

## Reviewer pass

- `reviewer-data-integrity` on the migration + backfill — single most
  important reviewer for this phase. Schema additive but the backfill
  writes data; bad SQL there is irreversible.
- `reviewer-concurrency` on the create-with-variants transaction (the
  one-default invariant lives inside it).
- `reviewer-contracts` on the cart-item discriminated union — this is
  exactly the runtime-drift class the reviewer catches.

---

## Rollout

1. **PR 1 — Backend + contracts + tests.** Schema, services, errors, API
   types. Backfill rehearsed on snapshot. Reviewer subagents pass. Run
   the verification script. **Deploy to Railway during a low-traffic
   window**. Migration applies to prod Neon.
2. **PR 2 — Frontend.** Owner variant editor, customer variant chips,
   cart slice migration shim, line-item display. Deploy each Vercel app.
3. **PR 3 — Docs + PROGRESS.md commit hash + IP2.md commit hash
   backfill.** Same pattern as IP-1.

### Reversibility plan

If PR 1's migration goes wrong post-deploy:
- The migration is additive only — rollback is a `DROP TABLE
  "ProductVariant"` + `ALTER TABLE "OrderItem" DROP COLUMN "variantId" …`.
  Existing orders unaffected because their snapshots are intact.
- The pre-existing `Product.pricePaise`/`unit` are still populated, so
  legacy reads keep working under rollback.
- **Do NOT proceed to IP-2.5 (column drop) until at least one full
  business day of production traffic on IP-2.0 has shown no errors.**

---

## Deferred from this phase

- **Per-variant coupons** — coupons currently target whole products.
  Migration would be a JSON-encoded variant filter on Coupon. Out of scope.
- **Per-variant discounts** — `discountType / discountValue` move to
  variant level. Out of scope; one product = one discount today.
- **Per-variant featured / promoted flags** — products are still the unit
  of merchandising.
- **Variant bulk operations** ("apply this price to every variant") —
  owner edits individually for MVP.
- **Separate `mrpPaise` field on variants** — not needed; the existing
  Product-level discount system already produces strike-through pricing
  from `pricePaise` + `discountValue`.

---

## What this unlocks for later phases

- **IP-3 (Geo) + IP-4 (Deliver-to)**: independent of variants. Land in
  any order after IP-2.0 ships.
- **Stock telemetry / low-stock alerts**: variants are the natural unit
  of stock — `isAvailable` per variant is the entry point.
- **Pack-size search analytics**: "customers search for 500ml twice as
  often as 1L" becomes answerable with variant-name search hits logged.

---

## Time + risk

- **Estimate: 4–6 working days** end-to-end including backfill rehearsal,
  tests, and reviewer passes.
- **Risk: HIGH.** The only IP with a non-trivial backfill. The blast
  radius of a bad migration is "all commerce broken" until rollback.
- **Single biggest mitigator**: rehearse the backfill on a snapshot
  before prod. **Do not skip this step**, even if the migration looks
  trivial. Past data has shapes you don't expect.
