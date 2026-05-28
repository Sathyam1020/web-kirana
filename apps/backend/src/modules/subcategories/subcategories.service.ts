import { prisma } from "../../db/prisma.js"
import { events } from "../../lib/events.js"
import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors.js"
import { rethrowAsAppError } from "../../lib/prisma-errors.js"
import type {
  CreateSubcategoryBody,
  ListSubcategoriesQuery,
  UpdateSubcategoryBody,
} from "./subcategories.schemas.js"

/**
 * Subcategory views split by audience:
 *  - SubcategoryOwnerView keeps internal fields (storeId, isAvailable)
 *  - SubcategoryPublicView is what the customer category-page left rail
 *    consumes; includes productCount so the chip can render the badge.
 */
export interface SubcategoryOwnerView {
  id: string
  storeId: string
  categoryId: string
  name: string
  displayOrder: number
  isAvailable: boolean
  productCount: number
  createdAt: Date
  updatedAt: Date
}

export interface SubcategoryPublicView {
  id: string
  categoryId: string
  name: string
  displayOrder: number
  productCount: number
}

const SELECT_BASE = {
  id: true,
  storeId: true,
  categoryId: true,
  name: true,
  displayOrder: true,
  isAvailable: true,
  createdAt: true,
  updatedAt: true,
} as const

async function assertCategoryExists(categoryId: string): Promise<void> {
  const cat = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true },
  })
  if (cat === null) {
    throw new ValidationError("Category does not exist")
  }
}

async function countActiveProducts(subcategoryIds: string[]): Promise<Map<string, number>> {
  if (subcategoryIds.length === 0) return new Map()
  const groups = await prisma.product.groupBy({
    by: ["subcategoryId"],
    where: { subcategoryId: { in: subcategoryIds }, isActive: true },
    _count: { _all: true },
  })
  return new Map(groups.map((g) => [g.subcategoryId, g._count._all]))
}

// --- Owner side --------------------------------------------------------

export async function listOwnerSubcategories(
  storeId: string,
  query: ListSubcategoriesQuery,
): Promise<SubcategoryOwnerView[]> {
  const where: Record<string, unknown> = { storeId }
  if (query.categoryId !== undefined) where.categoryId = query.categoryId
  const rows = await prisma.subcategory.findMany({
    where,
    select: SELECT_BASE,
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  })
  const counts = await countActiveProducts(rows.map((r) => r.id))
  return rows.map((r) => ({ ...r, productCount: counts.get(r.id) ?? 0 }))
}

export async function createOwnerSubcategory(
  storeId: string,
  ownerId: string,
  input: CreateSubcategoryBody,
): Promise<SubcategoryOwnerView> {
  await assertCategoryExists(input.categoryId)
  try {
    const created = await prisma.subcategory.create({
      data: {
        storeId,
        categoryId: input.categoryId,
        name: input.name,
        displayOrder: input.displayOrder,
      },
      select: SELECT_BASE,
    })
    events.emit({
      type: "subcategory.created",
      subcategoryId: created.id,
      storeId,
      categoryId: input.categoryId,
      ownerId,
    })
    return { ...created, productCount: 0 }
  } catch (err) {
    rethrowAsAppError(err)
  }
}

export async function updateOwnerSubcategory(
  storeId: string,
  ownerId: string,
  subcategoryId: string,
  input: UpdateSubcategoryBody,
): Promise<SubcategoryOwnerView> {
  const data: Record<string, unknown> = {}
  if (input.name !== undefined) data.name = input.name
  if (input.displayOrder !== undefined) data.displayOrder = input.displayOrder

  if (Object.keys(data).length === 0) {
    return getOwnerSubcategoryById(storeId, subcategoryId)
  }

  // Scope to (id, storeId) so an owner can never edit a foreign sub.
  const claim = await prisma.subcategory.updateMany({
    where: { id: subcategoryId, storeId },
    data,
  })
  if (claim.count === 0) throw new NotFoundError("Subcategory not found")

  try {
    const fresh = await prisma.subcategory.findUniqueOrThrow({
      where: { id: subcategoryId },
      select: SELECT_BASE,
    })
    const counts = await countActiveProducts([fresh.id])
    events.emit({
      type: "subcategory.updated",
      subcategoryId,
      storeId,
      ownerId,
      fields: Object.keys(data),
    })
    return { ...fresh, productCount: counts.get(fresh.id) ?? 0 }
  } catch (err) {
    rethrowAsAppError(err)
  }
}

export async function deleteOwnerSubcategory(
  storeId: string,
  ownerId: string,
  subcategoryId: string,
): Promise<void> {
  // Block delete when any product still references this sub — FK is
  // Restrict on Product.subcategoryId, so Prisma would throw P2003 anyway.
  // We do the explicit count check to translate that to a clean 409.
  const productCount = await prisma.product.count({
    where: { subcategoryId, storeId },
  })
  if (productCount > 0) {
    throw new ConflictError(
      `Subcategory has ${productCount} product(s); move or delete them first`,
    )
  }
  const result = await prisma.subcategory.deleteMany({
    where: { id: subcategoryId, storeId },
  })
  if (result.count === 0) throw new NotFoundError("Subcategory not found")
  events.emit({
    type: "subcategory.deleted",
    subcategoryId,
    storeId,
    ownerId,
  })
}

export async function setOwnerSubcategoryAvailability(
  storeId: string,
  ownerId: string,
  subcategoryId: string,
  isAvailable: boolean,
): Promise<SubcategoryOwnerView> {
  const claim = await prisma.subcategory.updateMany({
    where: { id: subcategoryId, storeId },
    data: { isAvailable },
  })
  if (claim.count === 0) throw new NotFoundError("Subcategory not found")
  events.emit({
    type: "subcategory.availability_changed",
    subcategoryId,
    storeId,
    ownerId,
    isAvailable,
  })
  return getOwnerSubcategoryById(storeId, subcategoryId)
}

export async function getOwnerSubcategoryById(
  storeId: string,
  subcategoryId: string,
): Promise<SubcategoryOwnerView> {
  const row = await prisma.subcategory.findFirst({
    where: { id: subcategoryId, storeId },
    select: SELECT_BASE,
  })
  if (row === null) throw new NotFoundError("Subcategory not found")
  const counts = await countActiveProducts([row.id])
  return { ...row, productCount: counts.get(row.id) ?? 0 }
}

// --- Public side -------------------------------------------------------

/**
 * Used by the customer category page (your image #4): list a store's
 * subs under one admin Category, with productCount for the chip badge.
 *
 * Filters to subcategories that contain at least one
 * (active + available) product so we never surface a dead chip. Also
 * excludes subcategories with isAvailable=false (owner's kill-switch).
 */
export async function listPublicSubcategoriesForStoreCategory(
  storeId: string,
  categoryId: string,
): Promise<SubcategoryPublicView[]> {
  const rows = await prisma.subcategory.findMany({
    where: {
      storeId,
      categoryId,
      isAvailable: true,
    },
    select: {
      id: true,
      categoryId: true,
      name: true,
      displayOrder: true,
    },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  })

  // Count only the products that would actually surface to a customer
  // (active + available).
  const counts = await (async () => {
    if (rows.length === 0) return new Map<string, number>()
    const groups = await prisma.product.groupBy({
      by: ["subcategoryId"],
      where: {
        subcategoryId: { in: rows.map((r) => r.id) },
        isActive: true,
        isAvailable: true,
      },
      _count: { _all: true },
    })
    return new Map(groups.map((g) => [g.subcategoryId, g._count._all]))
  })()

  // Drop subs that ended up empty for a customer (the chip would be a
  // dead-end). Keeps the left rail tight.
  return rows
    .map((r) => ({ ...r, productCount: counts.get(r.id) ?? 0 }))
    .filter((r) => r.productCount > 0)
}
