-- IP-2 follow-up: lock the variant invariants in the DB and dedupe the
-- per-row search-vector amplification flagged by the reviewer pass.
--
-- This migration has no Prisma schema-side counterpart — every change is
-- raw SQL Prisma can't model (cross-table partial-unique-with-subquery,
-- partial-unique-per-product, trigger replacement). The Prisma client
-- type surface is unchanged.
--
-- Rationale per concern:
--   1. SKU uniqueness was service-layer only (assertSkuUniqueInStore in
--      products.service.ts). Two concurrent owner sessions creating
--      products in the same store could both pass the SELECT and both
--      INSERT the same SKU under READ COMMITTED. Fix: denormalize
--      `storeId` onto ProductVariant via a trigger + partial unique
--      index on `(storeId, sku) WHERE sku IS NOT NULL`. The DB now
--      enforces correctness; the service-layer check stays as a
--      friendly-error fast-path before the P2002 lands.
--   2. The "exactly one default per product" invariant was also a
--      service-layer write race. Partial unique index on
--      `(productId) WHERE isDefault` makes Postgres enforce at-most-one
--      default per product. Service has to clear the old default
--      BEFORE setting the new one — handled in products.service.ts.
--   3. Per-row search-vector amplification: the variant trigger fired
--      an UPDATE on Product for every variant write, which itself
--      re-ran the BEFORE UPDATE trigger to recompute searchVector.
--      For a 10-variant create this is 20 extra round-trips inside
--      the placement transaction. Replaced with a no-op: drop the
--      propagator, have syncVariants in code do a single explicit
--      `UPDATE Product SET searchAliases = searchAliases` at the end
--      so the BEFORE UPDATE trigger fires once, recomputing searchVector
--      with the now-final variant set.

-- ===========================================================
-- 1. Denormalize Store id onto ProductVariant for the partial unique
--    SKU index. A trigger keeps it in sync with the parent Product.
-- ===========================================================

ALTER TABLE "ProductVariant" ADD COLUMN "storeId" TEXT;

-- Backfill from Product.
UPDATE "ProductVariant" v
   SET "storeId" = p."storeId"
  FROM "Product" p
 WHERE v."productId" = p.id;

ALTER TABLE "ProductVariant" ALTER COLUMN "storeId" SET NOT NULL;

-- Maintain storeId on insert/update — variants don't move products,
-- so we only need to set it on INSERT and on the rare case where
-- productId itself changes (which the service never does, but the
-- trigger covers it defensively).
CREATE OR REPLACE FUNCTION variant_set_store_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  SELECT p."storeId" INTO NEW."storeId"
    FROM "Product" p WHERE p.id = NEW."productId";
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS variant_set_store_id_trg ON "ProductVariant";
CREATE TRIGGER variant_set_store_id_trg
  BEFORE INSERT OR UPDATE OF "productId"
  ON "ProductVariant"
  FOR EACH ROW
  EXECUTE FUNCTION variant_set_store_id();

-- Partial unique: at most one variant per (store, sku) when sku is set.
-- Two products in the same store cannot reuse a SKU; two variants of
-- the same product cannot either (existing @@unique(productId, name)
-- handles per-product-name; this adds per-store-sku).
CREATE UNIQUE INDEX "ProductVariant_storeId_sku_unique_when_set"
  ON "ProductVariant" ("storeId", "sku")
  WHERE "sku" IS NOT NULL;

-- ===========================================================
-- 2. Exactly-one-default-per-product invariant at the DB level.
-- Service must clear the old default before setting the new one;
-- otherwise the insert/update collides on this index and fails.
-- ===========================================================

CREATE UNIQUE INDEX "ProductVariant_productId_default_unique"
  ON "ProductVariant" ("productId")
  WHERE "isDefault" = true;

-- ===========================================================
-- 3. Drop the per-row search-vector propagator. The service now does
-- ONE no-op write on Product.searchAliases at the end of syncVariants
-- which fires the BEFORE UPDATE trigger ONCE, recomputing searchVector
-- from the now-final variant set.
-- ===========================================================

DROP TRIGGER IF EXISTS variant_search_propagation_trg ON "ProductVariant";
DROP FUNCTION IF EXISTS variant_propagate_search();

-- ===========================================================
-- 4. Defensive — re-declare the Product search-vector trigger so the
-- watch-set is explicit in this migration. The previous migration's
-- CREATE OR REPLACE FUNCTION updated the function body but didn't
-- re-issue CREATE TRIGGER; a future hand-edit to the existing trigger
-- removing `searchAliases` from the watch-set would silently break
-- the new "no-op write to refresh" pattern. This locks the contract.
-- ===========================================================

DROP TRIGGER IF EXISTS product_search_vector_trg ON "Product";
CREATE TRIGGER product_search_vector_trg
  BEFORE INSERT OR UPDATE OF name, description, "subcategoryId", "storeId", "searchAliases"
  ON "Product"
  FOR EACH ROW
  EXECUTE FUNCTION product_search_vector_update();
