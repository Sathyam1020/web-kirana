import { prisma } from "../../db/prisma.js"
import { Unit } from "../../generated/prisma/enums.js"
import { events } from "../../lib/events.js"
import { NotFoundError, ValidationError } from "../../lib/errors.js"
import { rethrowAsAppError } from "../../lib/prisma-errors.js"
import { searchProducts } from "../search/search.service.js"
import type {
  CreateProductBody,
  ListProductsQuery,
  MoveProductBody,
  UpdateProductBody,
} from "./products.schemas.js"

/**
 * Phase 6.6 — Product carries Subcategory (L3) + the admin Category (L2)
 * and Department (L1) names by JOIN. The owner view denormalizes all three
 * for the catalogue UI; the public search view (see search.service) does
 * the same denormalization via tsvector.
 */
export interface ProductView {
  id: string
  storeId: string
  subcategoryId: string
  subcategoryName: string
  categoryId: string
  categoryName: string
  departmentId: string
  departmentName: string
  name: string
  description: string | null
  pricePaise: number
  unit: Unit
  imageUrl: string | null
  imagePublicId: string | null
  isActive: boolean
  isAvailable: boolean
  isFeatured: boolean
  featuredOrder: number | null
  isPromoted: boolean
  promotedUntil: Date | null
  searchAliases: string[]
  createdAt: Date
  updatedAt: Date
}

const SELECT = {
  id: true,
  storeId: true,
  subcategoryId: true,
  name: true,
  description: true,
  pricePaise: true,
  unit: true,
  imageUrl: true,
  imagePublicId: true,
  isActive: true,
  isAvailable: true,
  isFeatured: true,
  featuredOrder: true,
  isPromoted: true,
  promotedUntil: true,
  searchAliases: true,
  createdAt: true,
  updatedAt: true,
  subcategory: {
    select: {
      name: true,
      category: {
        select: {
          id: true,
          name: true,
          department: { select: { id: true, name: true } },
        },
      },
    },
  },
} as const

function toView(row: {
  id: string
  storeId: string
  subcategoryId: string
  name: string
  description: string | null
  pricePaise: number
  unit: Unit
  imageUrl: string | null
  imagePublicId: string | null
  isActive: boolean
  isAvailable: boolean
  isFeatured: boolean
  featuredOrder: number | null
  isPromoted: boolean
  promotedUntil: Date | null
  searchAliases: string[]
  createdAt: Date
  updatedAt: Date
  subcategory: {
    name: string
    category: { id: string; name: string; department: { id: string; name: string } }
  }
}): ProductView {
  const { subcategory, ...rest } = row
  return {
    ...rest,
    subcategoryName: subcategory.name,
    categoryId: subcategory.category.id,
    categoryName: subcategory.category.name,
    departmentId: subcategory.category.department.id,
    departmentName: subcategory.category.department.name,
  }
}

/**
 * Verify the subcategory exists AND belongs to the calling owner's store.
 * Combined check prevents an owner from attaching a product to a sub they
 * don't own. Returns the sub for caller use (e.g. event payload).
 */
async function assertOwnSubcategory(
  storeId: string,
  subcategoryId: string,
): Promise<void> {
  const sub = await prisma.subcategory.findFirst({
    where: { id: subcategoryId, storeId },
    select: { id: true },
  })
  if (sub === null) {
    throw new ValidationError("Subcategory does not exist or doesn't belong to your store")
  }
}

export async function createProduct(
  storeId: string,
  ownerId: string,
  input: CreateProductBody,
): Promise<ProductView> {
  await assertOwnSubcategory(storeId, input.subcategoryId)

  try {
    const created = await prisma.product.create({
      data: {
        storeId,
        subcategoryId: input.subcategoryId,
        name: input.name,
        description: input.description,
        pricePaise: input.pricePaise,
        unit: input.unit,
        imageUrl: input.imageUrl,
        imagePublicId: input.imagePublicId,
        isAvailable: input.isAvailable ?? true,
        searchAliases: input.searchAliases ?? [],
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
  /** Present only when `q` was used and results came from the search service. */
  searchPage?: number
}

export async function listProducts(
  storeId: string,
  query: ListProductsQuery,
): Promise<ListProductsResult> {
  // When the owner sends `q`, delegate to the search service so ranking is
  // consistent with the public endpoint.
  if (query.q !== undefined && query.q.length > 0) {
    const result = await searchProducts({
      q: query.q,
      page: 1, // owner self-search isn't paginated through this path yet —
               // cursor pagination doesn't compose with scored search.
      limit: query.limit,
      categoryId: query.categoryId,
      subcategoryId: query.subcategoryId,
      ownerScope: { storeId },
    })

    // Owner view filters are applied client-side on the score-sorted list
    // (cheaper than re-querying). For server-side consistency, hide
    // inactive when includeInactive is false, and respect `available`.
    const visible = result.items.filter((h) => {
      if (!query.includeInactive && !h.isActive) return false
      if (query.available !== undefined && h.isAvailable !== query.available) return false
      return true
    })

    return {
      items: visible.map((h) => ({
        id: h.id,
        storeId: h.storeId,
        subcategoryId: h.subcategoryId,
        subcategoryName: h.subcategoryName,
        categoryId: h.categoryId,
        categoryName: h.categoryName,
        departmentId: h.departmentId,
        departmentName: h.departmentName,
        name: h.name,
        description: h.description,
        pricePaise: h.pricePaise,
        unit: h.unit,
        imageUrl: h.imageUrl,
        isActive: h.isActive,
        isAvailable: h.isAvailable,
        // SearchHit doesn't carry these. Owner UIs that need them call
        // get-product after picking a row.
        imagePublicId: null,
        isFeatured: false,
        featuredOrder: null,
        isPromoted: false,
        promotedUntil: null,
        searchAliases: [],
        createdAt: new Date(0),
        updatedAt: new Date(0),
      })),
      nextCursor: null,
      hasMore: result.hasMore,
      searchPage: result.page,
    }
  }

  const where: Record<string, unknown> = { storeId }
  if (!query.includeInactive) where.isActive = true
  if (query.subcategoryId !== undefined) where.subcategoryId = query.subcategoryId
  if (query.categoryId !== undefined) {
    // Filter through Subcategory → Category via a nested relation filter
    // (Prisma supports this directly). Equivalent to a JOIN.
    where.subcategory = { categoryId: query.categoryId }
  }
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
  const data: Record<string, unknown> = {}
  if (input.name !== undefined) data.name = input.name
  if (input.description !== undefined) data.description = input.description
  if (input.pricePaise !== undefined) data.pricePaise = input.pricePaise
  if (input.unit !== undefined) data.unit = input.unit
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl
  if (input.imagePublicId !== undefined) data.imagePublicId = input.imagePublicId
  if (input.isAvailable !== undefined) data.isAvailable = input.isAvailable
  if (input.searchAliases !== undefined) data.searchAliases = input.searchAliases

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

/**
 * Phase 6.6 — move a product between subcategories within the same store.
 * Both target sub and source product are scoped to the calling owner;
 * cross-store moves are impossible by design.
 */
export async function moveProduct(
  storeId: string,
  ownerId: string,
  productId: string,
  input: MoveProductBody,
): Promise<ProductView> {
  // Verify the destination sub is owned by this store (also implicitly
  // verifies it exists).
  await assertOwnSubcategory(storeId, input.subcategoryId)

  // Look up current sub for the event payload, and to no-op if unchanged.
  const current = await prisma.product.findFirst({
    where: { id: productId, storeId },
    select: { subcategoryId: true },
  })
  if (current === null) throw new NotFoundError("Product not found")

  if (current.subcategoryId === input.subcategoryId) {
    // Idempotent — no-op return.
    return getProduct(storeId, productId)
  }

  const claim = await prisma.product.updateMany({
    where: { id: productId, storeId },
    data: { subcategoryId: input.subcategoryId },
  })
  if (claim.count === 0) throw new NotFoundError("Product not found")

  const after = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    select: SELECT,
  })
  events.emit({
    type: "product.moved",
    productId,
    storeId,
    ownerId,
    fromSubcategoryId: current.subcategoryId,
    toSubcategoryId: input.subcategoryId,
  })
  return toView(after)
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

// --- Featured (owner self-curates) -------------------------------------

/**
 * Pins a product to the store's featured row. Idempotent: calling with the
 * same `featuredOrder` twice returns the same view both times.
 *
 * Scope: WHERE id AND storeId — owner can't feature a foreign-store product
 * even with a guessed productId (404, not 403, to avoid leaking existence).
 */
export async function featureProduct(
  storeId: string,
  ownerId: string,
  productId: string,
  input: { featuredOrder?: number },
): Promise<ProductView> {
  const claim = await prisma.product.updateMany({
    where: { id: productId, storeId },
    data: {
      isFeatured: true,
      featuredOrder: input.featuredOrder ?? 0,
    },
  })
  if (claim.count === 0) throw new NotFoundError("Product not found")
  const after = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    select: SELECT,
  })
  events.emit({
    type: "product.updated",
    storeId,
    productId,
    ownerId,
    fields: ["isFeatured", "featuredOrder"],
  })
  return toView(after)
}

export async function unfeatureProduct(
  storeId: string,
  ownerId: string,
  productId: string,
): Promise<ProductView> {
  const claim = await prisma.product.updateMany({
    where: { id: productId, storeId },
    data: {
      isFeatured: false,
      featuredOrder: null,
    },
  })
  if (claim.count === 0) throw new NotFoundError("Product not found")
  const after = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    select: SELECT,
  })
  events.emit({
    type: "product.updated",
    storeId,
    productId,
    ownerId,
    fields: ["isFeatured", "featuredOrder"],
  })
  return toView(after)
}

// --- Promoted (admin marketplace-wide boost) ---------------------------

/**
 * Admin-only. Scope is global — admin can promote a product in ANY store
 * (so this lives off `products.service` rather than the owner-scoped path).
 * The product just needs to exist. Phase 4.2 search multiplies the score
 * for products whose (isPromoted, promotedUntil) window is active.
 */
export async function promoteProductAdmin(
  productId: string,
  promotedUntil: Date,
): Promise<ProductView> {
  const claim = await prisma.product.updateMany({
    where: { id: productId },
    data: {
      isPromoted: true,
      promotedUntil,
    },
  })
  if (claim.count === 0) throw new NotFoundError("Product not found")
  const after = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    select: SELECT,
  })
  return toView(after)
}

export async function unpromoteProductAdmin(
  productId: string,
): Promise<ProductView> {
  const claim = await prisma.product.updateMany({
    where: { id: productId },
    data: {
      isPromoted: false,
      promotedUntil: null,
    },
  })
  if (claim.count === 0) throw new NotFoundError("Product not found")
  const after = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    select: SELECT,
  })
  return toView(after)
}
