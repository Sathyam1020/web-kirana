-- Phase 6.8 — StoreBanner table (promotional banners; one active per store).
-- Purely additive (new table). Safe on existing rows.
--
-- NOTE: `prisma migrate dev` also generated DROP INDEX statements for the
-- PostGIS GIST + pg_trgm/tsvector GIN indexes (created via raw SQL, not
-- modelled in schema.prisma, so Prisma misreads them as drift). They are
-- DELIBERATELY NOT dropped here — removing them would break search + nearby.

-- CreateTable
CREATE TABLE "StoreBanner" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imagePublicId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreBanner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreBanner_storeId_isActive_idx" ON "StoreBanner"("storeId", "isActive");

-- AddForeignKey
ALTER TABLE "StoreBanner" ADD CONSTRAINT "StoreBanner_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
