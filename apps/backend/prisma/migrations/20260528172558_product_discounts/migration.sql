-- Phase 6.8 — per-product discounts. Additive: new enum + nullable columns +
-- one index. Safe on existing rows.
--
-- NOTE: `prisma migrate dev` also generated DROP INDEX statements for the
-- PostGIS GIST + pg_trgm/tsvector GIN indexes (created via raw SQL, not
-- modelled in schema.prisma, so Prisma misreads them as drift). They are
-- DELIBERATELY NOT dropped here — removing them would break search + nearby.

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FLAT_PAISE');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "discountType" "DiscountType",
ADD COLUMN     "discountValidUntil" TIMESTAMP(3),
ADD COLUMN     "discountValue" INTEGER;

-- CreateIndex
CREATE INDEX "Product_discountValidUntil_idx" ON "Product"("discountValidUntil");
