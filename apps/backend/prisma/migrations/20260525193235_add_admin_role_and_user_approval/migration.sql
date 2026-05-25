-- ============================================================================
-- Phase 3 schema change: ADMIN role + user approval gate.
--
-- NOTE: Prisma's generator wanted to also emit "DROP INDEX Store_location_gist_idx"
-- because that index is on a column it doesn't fully model (the geography
-- `location` column is `Unsupported(...)` in schema.prisma). We REMOVED that
-- DROP statement by hand — the index is required by /stores/nearby in Phase 5.
-- Any future migration that proposes to drop it must do the same.
-- ============================================================================

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'ADMIN';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "isApproved" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "User_role_isApproved_idx" ON "User"("role", "isApproved");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
