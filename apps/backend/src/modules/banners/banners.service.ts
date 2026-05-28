import { prisma } from "../../db/prisma.js"
import { NotFoundError, ValidationError } from "../../lib/errors.js"
import { rethrowAsAppError } from "../../lib/prisma-errors.js"
import type { CreateBannerBody } from "./banners.schemas.js"

export interface BannerView {
  id: string
  name: string
  imageUrl: string
  imagePublicId: string | null
  isActive: boolean
  createdAt: Date
}

const SELECT = {
  id: true,
  name: true,
  imageUrl: true,
  imagePublicId: true,
  isActive: true,
  createdAt: true,
} as const

export async function listBanners(storeId: string): Promise<BannerView[]> {
  return prisma.storeBanner.findMany({
    where: { storeId },
    select: SELECT,
    orderBy: { createdAt: "desc" },
  })
}

export async function createBanner(
  storeId: string,
  input: CreateBannerBody,
): Promise<BannerView> {
  try {
    return await prisma.storeBanner.create({
      data: {
        storeId,
        name: input.name,
        imageUrl: input.imageUrl,
        imagePublicId: input.imagePublicId,
      },
      select: SELECT,
    })
  } catch (err) {
    rethrowAsAppError(err)
  }
}

export async function deleteBanner(storeId: string, id: string): Promise<void> {
  // deleteMany scoped by storeId = ownership check baked in (no IDOR).
  const result = await prisma.storeBanner.deleteMany({ where: { id, storeId } })
  if (result.count === 0) throw new NotFoundError("Banner not found")
}

/**
 * Sets exactly one banner active (or none if bannerId is null). The clear-all
 * + set-one happens in a transaction so the "one active per store" invariant
 * holds even under concurrent calls. Returns the refreshed list.
 */
export async function setActiveBanner(
  storeId: string,
  bannerId: string | null,
): Promise<BannerView[]> {
  await prisma.$transaction(async (tx) => {
    if (bannerId !== null) {
      const owned = await tx.storeBanner.findFirst({
        where: { id: bannerId, storeId },
        select: { id: true },
      })
      if (owned === null) {
        throw new ValidationError("Banner does not exist or doesn't belong to your store")
      }
    }
    await tx.storeBanner.updateMany({ where: { storeId }, data: { isActive: false } })
    if (bannerId !== null) {
      await tx.storeBanner.update({ where: { id: bannerId }, data: { isActive: true } })
    }
  })
  return listBanners(storeId)
}

/** Public: the active banner for a store, or null. Used by store detail. */
export async function getActiveBanner(
  storeId: string,
): Promise<{ id: string; name: string; imageUrl: string } | null> {
  return prisma.storeBanner.findFirst({
    where: { storeId, isActive: true },
    select: { id: true, name: true, imageUrl: true },
  })
}
