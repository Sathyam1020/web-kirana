-- Phase 6.6 — Taxonomy upgrade (Department + Subcategory; Product re-FK).
--
-- Multi-step migration:
--   1. Schema-additive — create Department + Subcategory tables; add
--      Category.departmentId (nullable); add Product.subcategoryId (nullable).
--   2. Data — seed 4 default departments; backfill Category.departmentId;
--      create one Subcategory per (store, category) that has products;
--      repoint Product.subcategoryId.
--   3. Schema-lock — flip both new columns to NOT NULL, drop the old
--      Category.name unique (replaced by composite with departmentId),
--      drop Product.categoryId, add FK + index constraints.
--   4. Search — rebuild product_search_vector_update trigger to traverse
--      Product → Subcategory → Category → Department for L3+L2+L1 names
--      in the tsvector. Replace category-rename propagator + add
--      subcategory-rename + department-rename propagators. Backfill
--      every product so the new vector lands.
--
-- NOTE: Three DROP INDEX statements that prisma migrate diff always
-- re-proposes (Product_searchAliases_gin_idx, Product_searchVector_gin_idx,
-- Store_location_gist_idx) are OMITTED — managed by raw SQL in the init /
-- search migrations. See PROGRESS.md → Schema gotchas #1.

-- ============================================================================
-- Step 0: drop the old search trigger up-front. The trigger references
-- Product."categoryId" in its UPDATE-OF column list — Postgres won't let
-- us drop the column with the trigger still attached. Rebuilt in step 4.
-- ============================================================================

DROP TRIGGER IF EXISTS product_search_vector_trg ON "Product";

-- ============================================================================
-- Step 1: schema-additive
-- ============================================================================

CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "iconUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");
CREATE INDEX "Department_displayOrder_idx" ON "Department"("displayOrder");

CREATE TABLE "Subcategory" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Subcategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Subcategory_storeId_categoryId_name_key" ON "Subcategory"("storeId", "categoryId", "name");
CREATE INDEX "Subcategory_storeId_categoryId_displayOrder_idx" ON "Subcategory"("storeId", "categoryId", "displayOrder");

ALTER TABLE "Subcategory" ADD CONSTRAINT "Subcategory_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Category.departmentId — nullable for now, locked NOT NULL in step 3.
ALTER TABLE "Category" ADD COLUMN "departmentId" TEXT;

-- Product.subcategoryId — nullable for now, locked NOT NULL in step 3.
ALTER TABLE "Product" ADD COLUMN "subcategoryId" TEXT;

-- ============================================================================
-- Step 2: data migration
-- ============================================================================

-- Seed 4 default departments. Hardcoded ids keep the FK backfill below
-- deterministic across runs (and the seed script keys off the same names).
INSERT INTO "Department" (id, name, "displayOrder", "createdAt") VALUES
  ('dept_grocery_kitchen',  'Grocery & Kitchen',       10, NOW()),
  ('dept_snacks_drinks',    'Snacks & Drinks',         20, NOW()),
  ('dept_beauty_personal',  'Beauty & Personal Care',  30, NOW()),
  ('dept_household',        'Household Essentials',    40, NOW())
ON CONFLICT (id) DO NOTHING;

-- Map the existing 4 seeded categories to the right department by name.
-- (The pre-6.6 init seed shipped exactly these four categories.)
UPDATE "Category" SET "departmentId" = 'dept_grocery_kitchen' WHERE name = 'Atta, Rice & Dal'   AND "departmentId" IS NULL;
UPDATE "Category" SET "departmentId" = 'dept_grocery_kitchen' WHERE name = 'Dairy & Eggs'       AND "departmentId" IS NULL;
UPDATE "Category" SET "departmentId" = 'dept_snacks_drinks'   WHERE name = 'Snacks & Beverages' AND "departmentId" IS NULL;
UPDATE "Category" SET "departmentId" = 'dept_beauty_personal' WHERE name = 'Personal Care'      AND "departmentId" IS NULL;
-- Safety net — any category we don't recognise lands under Grocery & Kitchen.
UPDATE "Category" SET "departmentId" = 'dept_grocery_kitchen' WHERE "departmentId" IS NULL;

-- For every (storeId, categoryId) pair that has at least one product,
-- create a Subcategory named after the category. The owner can rename /
-- split these later via the new owner endpoints.
INSERT INTO "Subcategory" (id, "storeId", "categoryId", name, "displayOrder", "isAvailable", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  p."storeId",
  p."categoryId",
  c.name,
  c."displayOrder",
  TRUE,
  NOW(),
  NOW()
FROM "Product" p
JOIN "Category" c ON c.id = p."categoryId"
GROUP BY p."storeId", p."categoryId", c.name, c."displayOrder"
ON CONFLICT ("storeId", "categoryId", "name") DO NOTHING;

-- Re-point each product at its newly-created subcategory.
UPDATE "Product" p
SET "subcategoryId" = sc.id
FROM "Subcategory" sc
WHERE sc."storeId" = p."storeId"
  AND sc."categoryId" = p."categoryId"
  AND p."subcategoryId" IS NULL;

-- ============================================================================
-- Step 3: schema-lock
-- ============================================================================

-- Lock the new required columns.
ALTER TABLE "Category" ALTER COLUMN "departmentId" SET NOT NULL;
ALTER TABLE "Product"  ALTER COLUMN "subcategoryId" SET NOT NULL;

-- Drop the legacy Category.name unique (replaced by composite).
ALTER TABLE "Category" DROP CONSTRAINT IF EXISTS "Category_name_key";
DROP INDEX IF EXISTS "Category_name_key";

-- Add the composite unique + dept-scoped display-order index.
CREATE UNIQUE INDEX "Category_departmentId_name_key" ON "Category"("departmentId", "name");
CREATE INDEX "Category_departmentId_displayOrder_idx" ON "Category"("departmentId", "displayOrder");

-- Drop the old per-category-per-store product index (categoryId gone).
DROP INDEX IF EXISTS "Product_storeId_categoryId_isActive_idx";

-- Drop the old Product.categoryId FK + column.
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_categoryId_fkey";
ALTER TABLE "Product" DROP COLUMN "categoryId";

-- Add the new FKs + indexes.
ALTER TABLE "Category" ADD CONSTRAINT "Category_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subcategory" ADD CONSTRAINT "Subcategory_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_subcategoryId_fkey"
  FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Product_subcategoryId_isActive_idx" ON "Product"("subcategoryId", "isActive");

-- ============================================================================
-- Step 4: search triggers
-- ============================================================================

-- Rebuild the product-vector function to traverse Product → Subcategory →
-- Category → Department. All three levels' names land in the tsvector at
-- weight C so a search for "rice" matches at L2, "basmati" matches at L3,
-- "grocery" matches at L1.
DROP TRIGGER IF EXISTS product_search_vector_trg ON "Product";

CREATE OR REPLACE FUNCTION product_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  subcat_name  text;
  cat_name     text;
  dept_name    text;
  store_name   text;
BEGIN
  SELECT s.name, c.name, d.name
    INTO subcat_name, cat_name, dept_name
    FROM "Subcategory" s
    JOIN "Category"   c ON c.id = s."categoryId"
    JOIN "Department" d ON d.id = c."departmentId"
   WHERE s.id = NEW."subcategoryId";

  SELECT name INTO store_name FROM "Store" WHERE id = NEW."storeId";

  NEW."searchVector" :=
       setweight(to_tsvector('simple', immutable_unaccent(coalesce(NEW.name, ''))), 'A')
    || setweight(to_tsvector('simple', immutable_unaccent(coalesce(array_to_string(NEW."searchAliases", ' '), ''))), 'A')
    || setweight(to_tsvector('simple', immutable_unaccent(coalesce(NEW.description, ''))), 'B')
    || setweight(to_tsvector('simple', immutable_unaccent(coalesce(subcat_name, ''))), 'C')
    || setweight(to_tsvector('simple', immutable_unaccent(coalesce(cat_name,    ''))), 'C')
    || setweight(to_tsvector('simple', immutable_unaccent(coalesce(dept_name,   ''))), 'C')
    || setweight(to_tsvector('simple', immutable_unaccent(coalesce(store_name,  ''))), 'C');

  RETURN NEW;
END;
$$;

CREATE TRIGGER product_search_vector_trg
  BEFORE INSERT OR UPDATE OF name, description, "subcategoryId", "storeId", "searchAliases"
  ON "Product"
  FOR EACH ROW
  EXECUTE FUNCTION product_search_vector_update();

-- Replace the category-rename propagator — old version reached products
-- via Product."categoryId" which no longer exists; new version walks
-- Category → Subcategory → Product.
CREATE OR REPLACE FUNCTION refresh_products_for_category()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE "Product"
       SET "searchAliases" = "searchAliases"
     WHERE "subcategoryId" IN (
       SELECT id FROM "Subcategory" WHERE "categoryId" = NEW.id
     );
  END IF;
  RETURN NEW;
END;
$$;

-- The store-rename propagator's WHERE clause is unchanged (still
-- Product."storeId") so it doesn't need rebuilding. Verify by recreating
-- defensively.
DROP TRIGGER IF EXISTS store_name_change_trg ON "Store";
CREATE TRIGGER store_name_change_trg
  AFTER UPDATE OF name ON "Store"
  FOR EACH ROW
  EXECUTE FUNCTION refresh_products_for_store();

-- New: subcategory-rename propagator. When the owner renames a sub the
-- products under it need their searchVector rebuilt.
CREATE OR REPLACE FUNCTION refresh_products_for_subcategory()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE "Product"
       SET "searchAliases" = "searchAliases"
     WHERE "subcategoryId" = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subcategory_name_change_trg ON "Subcategory";
CREATE TRIGGER subcategory_name_change_trg
  AFTER UPDATE OF name ON "Subcategory"
  FOR EACH ROW
  EXECUTE FUNCTION refresh_products_for_subcategory();

-- New: department-rename propagator. Reaches products through
-- Department → Category → Subcategory → Product (3 hops, but rename is rare).
CREATE OR REPLACE FUNCTION refresh_products_for_department()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE "Product"
       SET "searchAliases" = "searchAliases"
     WHERE "subcategoryId" IN (
       SELECT s.id FROM "Subcategory" s
       JOIN "Category" c ON c.id = s."categoryId"
       WHERE c."departmentId" = NEW.id
     );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS department_name_change_trg ON "Department";
CREATE TRIGGER department_name_change_trg
  AFTER UPDATE OF name ON "Department"
  FOR EACH ROW
  EXECUTE FUNCTION refresh_products_for_department();

-- Backfill — touch every product so the new trigger writes the new
-- tsvector (now including department + subcategory names).
UPDATE "Product" SET "searchAliases" = "searchAliases";
