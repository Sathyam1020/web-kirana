import { prisma } from "../../db/prisma.js"
import { Unit } from "../../generated/prisma/enums.js"
import { events } from "../../lib/events.js"
import { NotFoundError, ValidationError } from "../../lib/errors.js"
import { rethrowAsAppError } from "../../lib/prisma-errors.js"
import type {
  CreateProductBody,
  ListProductsQuery,
  UpdateProductBody,
} from "./products.schemas.js"

export interface ProductView {
  id: string
  storeId: string
  categoryId: string
  categoryName: string
  name: string
  description: string | null
  pricePaise: number
  unit: Unit
  imageUrl: string | null
  isActive: boolean
  isAvailable: boolean
  createdAt: Date
  updatedAt: Date
}

const SELECT = {
  id: true,
  storeId: true,
  categoryId: true,
  name: true,
  description: true,
  pricePaise: true,
  unit: true,
  imageUrl: true,
  isActive: true,
  isAvailable: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { name: true } },
} as const

function toView(row: {
  id: string
  storeId: string
  categoryId: string
  name: string
  description: string | null
  pricePaise: number
  unit: Unit
  imageUrl: string | null
  isActive: boolean
  isAvailable: boolean
  createdAt: Date
  updatedAt: Date
  category: { name: string }
}): ProductView {
  const { category, ...rest } = row
  return { ...rest, categoryName: category.name }
}

async function assertCategoryExists(categoryId: string): Promise<void> {
  const cat = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true },
  })
  if (cat === null) throw new ValidationError("Category does not exist")
}

export async function createProduct(
  storeId: string,
  ownerId: string,
  input: CreateProductBody,
): Promise<ProductView> {
  // Validate FK up-front for a clean 400 rather than P2003 → mapped error.
  await assertCategoryExists(input.categoryId)

  try {
    const created = await prisma.product.create({
      data: {
        storeId,
        categoryId: input.categoryId,
        name: input.name,
        description: input.description,
        pricePaise: input.pricePaise,
        unit: input.unit,
        imageUrl: input.imageUrl,
        isAvailable: input.isAvailable ?? true,
      },
      select: SELECT,
    })
    events.emit({
      type: "product.created",
      storeId,
      productId: created.id,
      ownerId,
    })
    return toView(created)
  } catch (err) {
    rethrowAsAppError(err)
  }
}

export interface ListProductsResult {
  items: ProductView[]
  nextCursor: string | null
  hasMore: boolean
}

export async function listProducts(
  storeId: string,
  query: ListProductsQuery,
): Promise<ListProductsResult> {
  if (query.category !== undefined) await assertCategoryExists(query.category)

  const where: Record<string, unknown> = { storeId }
  if (!query.includeInactive) where.isActive = true
  if (query.category !== undefined) where.categoryId = query.category
  if (query.available !== undefined) where.isAvailable = query.available

  const items = await prisma.product.findMany({
    where,
    select: SELECT,
    take: query.limit + 1,
    ...(query.cursor !== undefined
      ? { cursor: { id: query.cursor }, skip: 1 }
      : {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  })

  const hasMore = items.length > query.limit
  const trimmed = hasMore ? items.slice(0, query.limit) : items
  const last = trimmed[trimmed.length - 1]
  const nextCursor = hasMore && last !== undefined ? last.id : null

  return {
    items: trimmed.map(toView),
    nextCursor,
    hasMore,
  }
}

export async function getProduct(
  storeId: string,
  productId: string,
): Promise<ProductView> {
  const row = await prisma.product.findFirst({
    where: { id: productId, storeId },
    select: SELECT,
  })
  if (row === null) throw new NotFoundError("Product not found")
  return toView(row)
}

export async function updateProduct(
  storeId: string,
  ownerId: string,
  productId: string,
  input: UpdateProductBody,
): Promise<ProductView> {
  if (input.categoryId !== undefined) {
    await assertCategoryExists(input.categoryId)
  }

  const data: Record<string, unknown> = {}
  if (input.categoryId !== undefined) data.categoryId = input.categoryId
  if (input.name !== undefined) data.name = input.name
  if (input.description !== undefined) data.description = input.description
  if (input.pricePaise !== undefined) data.pricePaise = input.pricePaise
  if (input.unit !== undefined) data.unit = input.unit
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl
  if (input.isAvailable !== undefined) data.isAvailable = input.isAvailable

  if (Object.keys(data).length === 0) {
    return getProduct(storeId, productId)
  }

  // Scope the UPDATE to (productId, storeId) so an owner can never patch a
  // foreign store's product even if they guessed an id.
  const claim = await prisma.product.updateMany({
    where: { id: productId, storeId },
    data,
  })
  if (claim.count === 0) throw new NotFoundError("Product not found")

  const updated = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    select: SELECT,
  })
  events.emit({
    type: "product.updated",
    storeId,
    productId,
    ownerId,
    fields: Object.keys(data),
  })
  return toView(updated)
}

export async function softDeleteProduct(
  storeId: string,
  ownerId: string,
  productId: string,
): Promise<ProductView> {
  // Idempotent: try to flip isActive=true→false. If we matched, emit. If we
  // didn't, either the row is already inactive (return it) or it doesn't
  // exist at all (404).
  const claim = await prisma.product.updateMany({
    where: { id: productId, storeId, isActive: true },
    data: { isActive: false },
  })

  const after = await prisma.product.findFirst({
    where: { id: productId, storeId },
    select: SELECT,
  })
  if (after === null) throw new NotFoundError("Product not found")

  if (claim.count > 0) {
    events.emit({ type: "product.deleted", storeId, productId, ownerId })
  }
  return toView(after)
}

export async function restoreProduct(
  storeId: string,
  ownerId: string,
  productId: string,
): Promise<ProductView> {
  const claim = await prisma.product.updateMany({
    where: { id: productId, storeId, isActive: false },
    data: { isActive: true },
  })

  const after = await prisma.product.findFirst({
    where: { id: productId, storeId },
    select: SELECT,
  })
  if (after === null) throw new NotFoundError("Product not found")

  if (claim.count > 0) {
    events.emit({ type: "product.restored", storeId, productId, ownerId })
  }
  return toView(after)
}
