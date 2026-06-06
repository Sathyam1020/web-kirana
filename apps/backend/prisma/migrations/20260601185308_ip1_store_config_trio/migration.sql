-- IP-1 — Store config trio (fees + free-delivery threshold + hours +
-- manual-closed override). All additive, NOT NULL with safe defaults so
-- existing rows behave identically to today (no fee, always-open by
-- hours, not manually closed). No backfill required.
--
-- The 3 spurious `DROP INDEX` lines Prisma generated for the PostGIS +
-- pg_trgm indexes (Store_location_gist_idx, Product_searchAliases_gin_idx,
-- Product_searchVector_gin_idx) have been stripped per the documented
-- migration gotcha — those indexes live outside Prisma's schema model.

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "baseDeliveryFeePaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "closeTime" TEXT NOT NULL DEFAULT '22:00',
ADD COLUMN     "freeDeliveryThresholdPaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "manualClosed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "openTime" TEXT NOT NULL DEFAULT '07:00';
