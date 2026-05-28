-- Phase 6.7 — Cloudinary public_id columns for future orphan-asset cleanup.
-- Purely additive, nullable columns; safe on existing rows.
--
-- NOTE: `prisma migrate dev` also generated DROP INDEX statements for the
-- PostGIS GIST index (Store_location_gist_idx) and the pg_trgm/tsvector GIN
-- indexes (Product_searchVector_gin_idx, Product_searchAliases_gin_idx).
-- Those indexes are created via raw SQL in earlier migrations and aren't
-- modelled in schema.prisma, so Prisma misreads them as drift. They are
-- DELIBERATELY NOT dropped here — removing them would break search + nearby.

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "iconPublicId" TEXT;

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "iconPublicId" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "imagePublicId" TEXT;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "imagePublicId" TEXT;
