-- ============================================================================
-- Phase 4.2 — production search.
--
-- Idempotent: uses IF NOT EXISTS / CREATE OR REPLACE everywhere so the
-- migration can be re-applied after a partial failure on the same DB.
--
-- NOTE: the Prisma generator wanted to also emit "DROP INDEX
-- Store_location_gist_idx" (Phase 1's PostGIS index — Prisma can't model
-- GiST on Unsupported columns). That line is removed; the index is required
-- by Phase 5's /stores/nearby.
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- New columns (idempotent — IF NOT EXISTS supported since PG 9.6+)
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "searchAliases" text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS "searchVector"  tsvector;

-- Phase 5 will use this for "stores within radius with ≥1 available product"
CREATE INDEX IF NOT EXISTS "Product_storeId_isActive_isAvailable_idx"
  ON "Product"("storeId", "isActive", "isAvailable");

-- ----------------------------------------------------------------------------
-- `unaccent(text)` is STABLE, not IMMUTABLE, so Postgres rejects it inside
-- index expressions. Wrapping it in an IMMUTABLE SQL function makes it
-- index-safe — the trade-off is that you must redeploy this function if
-- the unaccent rules file changes (rare).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$ SELECT public.unaccent('public.unaccent', $1) $$;

-- Search indexes
CREATE INDEX IF NOT EXISTS "Product_searchVector_gin_idx"
  ON "Product" USING GIN("searchVector");

CREATE INDEX IF NOT EXISTS "Product_name_trgm_idx"
  ON "Product" USING GIN(immutable_unaccent(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Product_searchAliases_gin_idx"
  ON "Product" USING GIN("searchAliases");

-- ----------------------------------------------------------------------------
-- Search-vector trigger.
--
-- Uses the 'simple' text-search config (no stemming) — Indian product names
-- often look weird after the English stemmer, and we get fuzzy / synonym
-- coverage from pg_trgm + searchAliases instead.
--
-- Weights:  A = name + aliases (most authoritative)
--           B = description
--           C = category / store name (context)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION product_search_vector_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cat_name   text;
  store_name text;
BEGIN
  SELECT name INTO cat_name   FROM "Category" WHERE id = NEW."categoryId";
  SELECT name INTO store_name FROM "Store"    WHERE id = NEW."storeId";

  NEW."searchVector" :=
       setweight(to_tsvector('simple', immutable_unaccent(coalesce(NEW.name, ''))), 'A')
    || setweight(to_tsvector('simple', immutable_unaccent(coalesce(array_to_string(NEW."searchAliases", ' '), ''))), 'A')
    || setweight(to_tsvector('simple', immutable_unaccent(coalesce(NEW.description, ''))), 'B')
    || setweight(to_tsvector('simple', immutable_unaccent(coalesce(cat_name,   ''))), 'C')
    || setweight(to_tsvector('simple', immutable_unaccent(coalesce(store_name, ''))), 'C');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_search_vector_trg ON "Product";
CREATE TRIGGER product_search_vector_trg
  BEFORE INSERT OR UPDATE OF name, description, "categoryId", "storeId", "searchAliases"
  ON "Product"
  FOR EACH ROW
  EXECUTE FUNCTION product_search_vector_update();

-- ----------------------------------------------------------------------------
-- Propagation: when a Category or Store name changes, refresh searchVector
-- on every related Product. We "touch" the row by re-writing searchAliases
-- to itself, which fires the product trigger.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION refresh_products_for_category()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE "Product"
       SET "searchAliases" = "searchAliases"
     WHERE "categoryId" = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS category_name_change_trg ON "Category";
CREATE TRIGGER category_name_change_trg
  AFTER UPDATE OF name ON "Category"
  FOR EACH ROW
  EXECUTE FUNCTION refresh_products_for_category();

CREATE OR REPLACE FUNCTION refresh_products_for_store()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE "Product"
       SET "searchAliases" = "searchAliases"
     WHERE "storeId" = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS store_name_change_trg ON "Store";
CREATE TRIGGER store_name_change_trg
  AFTER UPDATE OF name ON "Store"
  FOR EACH ROW
  EXECUTE FUNCTION refresh_products_for_store();

-- ----------------------------------------------------------------------------
-- Backfill — touch every existing product so the trigger populates searchVector.
-- ----------------------------------------------------------------------------

UPDATE "Product" SET "searchAliases" = "searchAliases";
