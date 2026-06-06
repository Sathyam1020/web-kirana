import { prisma } from "../../db/prisma.js"
import { DiscountType, Unit } from "../../generated/prisma/enums.js"
import { events } from "../../lib/events.js"
import {
  MultipleDefaultVariantsError,
  NotFoundError,
  ProductMissingVariantsError,
  SkuConflictError,
  ValidationError,
} from "../../lib/errors.js"
import { effectivePricePaise, effectiveVariantPricePaise } from "../../lib/pricing.js"
import { rethrowAsAppError } from "../../lib/prisma-errors.js"
import { searchProducts } from "../search/search.service.js"
import type {
  CreateProductBody,
  ListProductsQuery,
  MoveProductBody,
  UpdateProductBody,
  VariantInput,
} from "./products.schemas.js"

// IP-2 — Prisma transaction client type. Hand-typing this avoids
// pulling Prisma.TransactionClient through the generated client export
// surface; the shape is just a subset of PrismaClient.
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/**
 * Phase 6.6 — Product carries Subcategory (L3) + the admin Category (L2)
 * and Department (L1) names by JOIN. The owner view denormalizes all three
 * for the catalogue UI; the public search view (see search.service) does
 * the same denormalization via tsvector.
 */
/**
 * IP-2 — owner-side variant shape exposed by ProductView.variants. The
 * customer-facing public view (ProductPublicView in stores.service)
 * adds `effectivePricePaise` per variant; this one keeps it raw so the
 * owner sees the list price they configured.
 */
export interface ProductVariantView {
  id: string
  name: string
  unitValue: string // Decimal serialized as string (matches existing pattern)
  unit: Unit
  pricePaise: number
  isAvailable: boolean
  isDefault: boolean
  sku: string | null
  sortOrder: number
  imageUrl: string | null
  imagePublicId: string | null
  createdAt: Date
  updatedAt: Date
}

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
  // Phase 6.8 — price after an active product discount (== pricePaise if none).
  effectivePricePaise: number
  discountType: DiscountType | null
  discountValue: number | null
  discountValidUntil: Date | null
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
  // IP-2 — sized SKUs under this product. Always ≥1; exactly one
  // isDefault=true. Owner UI renders these as a row-editor.
  variants: ProductVariantView[]
  createdAt: Date
  updatedAt: Date
}

const VARIANT_SELECT = {
  id: true,
  name: true,
  unitValue: true,
  unit: true,
  pricePaise: true,
  isAvailable: true,
  isDefault: true,
  sku: true,
  sortOrder: true,
  imageUrl: true,
  imagePublicId: true,
  createdAt: true,
  updatedAt: true,
} as const

const SELECT = {
  id: true,
  storeId: true,
  subcategoryId: true,
  name: true,
  description: true,
  pricePaise: true,
  discountType: true,
  discountValue: true,
  discountValidUntil: true,
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
  // IP-2 — variants ordered by sortOrder then name for a stable owner UI.
  // No `as const` on this nested object because Prisma's orderBy typing
  // rejects readonly arrays.
  variants: {
    select: VARIANT_SELECT,
    orderBy: [
      { sortOrder: "asc" },
      { name: "asc" },
    ] as Array<{ sortOrder: "asc" } | { name: "asc" }>,
  },
}

function toView(row: {
  id: string
  storeId: string
  subcategoryId: string
  name: string
  description: string | null
  pricePaise: number
  discountType: DiscountType | null
  discountValue: number | null
  discountValidUntil: Date | null
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
  variants: Array<{
    id: string
    name: string
    unitValue: unknown // Decimal
    unit: Unit
    pricePaise: number
    isAvailable: boolean
    isDefault: boolean
    sku: string | null
    sortOrder: number
    imageUrl: string | null
    imagePublicId: string | null
    createdAt: Date
    updatedAt: Date
  }>
}): ProductView {
  const { subcategory, variants, ...rest } = row
  return {
    ...rest,
    effectivePricePaise: effectivePricePaise(row),
    subcategoryName: subcategory.name,
    categoryId: subcategory.category.id,
    categoryName: subcategory.category.name,
    departmentId: subcategory.category.department.id,
    departmentName: subcategory.category.department.name,
    variants: variants.map((v) => ({
      ...v,
      unitValue: String(v.unitValue), // Decimal → string (existing pattern)
    })),
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

/**
 * FLAT_PAISE discounts must be strictly less than the price (a non-negative
 * effective price). PERCENT is already bounded 1..100 by the schema. The
 * schema can't do this check on update (price may be absent), so it lives here.
 */
function assertDiscountUnderPrice(
  pricePaise: number,
  discountType: DiscountType | null | undefined,
  discountValue: number | null | undefined,
): void {
  if (
    discountType === DiscountType.FLAT_PAISE &&
    discountValue != null &&
    discountValue >= pricePaise
  ) {
    throw new ValidationError("Flat discount must be less than the product price")
  }
}

// ---------------------------------------------------------------------------
// IP-2 — Variant CRUD helpers.
// ---------------------------------------------------------------------------

/**
 * Per-store SKU uniqueness lives here (Postgres partial unique with a
 * cross-table subquery isn't supported directly). Called inside the
 * transaction; reads every variant in the store with a matching SKU and
 * checks none belongs to a different product (or, within the same
 * product, a different variant).
 */
async function assertSkuUniqueInStore(
  tx: Tx,
  storeId: string,
  productId: string,
  variants: VariantInput[],
): Promise<void> {
  const skus = variants
    .map((v) => v.sku?.trim())
    .filter((s): s is string => s !== undefined && s !== null && s.length > 0)
  if (skus.length === 0) return

  // Each incoming SKU must be unique in the array first.
  const seen = new Set<string>()
  for (const sku of skus) {
    if (seen.has(sku)) {
      throw new SkuConflictError(sku, "(duplicate in request)")
    }
    seen.add(sku)
  }

  const conflicts = await tx.productVariant.findMany({
    where: {
      sku: { in: skus },
      product: { storeId },
      // Allow a variant to keep its own SKU on update — match by id only
      // against variants that are NOT in our incoming list.
      NOT: {
        AND: [
          { productId },
          { id: { in: variants.map((v) => v.id).filter((id): id is string => id !== undefined) } },
        ],
      },
    },
    select: { id: true, sku: true },
  })
  if (conflicts.length > 0) {
    const c = conflicts[0]
    if (c) throw new SkuConflictError(c.sku ?? "", c.id)
  }
}

/**
 * Diff-replace the variant set for a product. Returns the resolved
 * default variant so the caller can mirror its price/unit onto the
 * deprecated Product columns.
 *
 * Semantics:
 *   - Existing variant id matched in incoming → update.
 *   - Existing variant missing from incoming → delete. The FK is
 *     SetNull on OrderItem so historical orders survive; the snapshot
 *     fields preserve the customer-visible variant info.
 *   - Incoming entry without id → insert.
 *   - Zero defaults in incoming → first entry becomes default (this is
 *     defensive — the schema also requires the array be non-empty).
 */
async function syncVariants(
  tx: Tx,
  productId: string,
  storeId: string,
  incoming: VariantInput[],
): Promise<{ id: string; pricePaise: number; unit: Unit; imageUrl: string | null }> {
  if (incoming.length === 0) {
    throw new ProductMissingVariantsError()
  }

  // Resolve the default. Zero defaults → first entry. >1 → schema
  // already rejected at refine; here we double-check defensively.
  const declaredDefaults = incoming.filter((v) => v.isDefault === true)
  if (declaredDefaults.length > 1) {
    throw new MultipleDefaultVariantsError()
  }
  const resolved = incoming.map((v, i) => ({
    ...v,
    isDefault:
      declaredDefaults.length === 1
        ? v.isDefault === true
        : i === 0, // fallback: first entry default
  }))

  // Service-layer SKU pre-check is now a friendly-error fast-path; the
  // DB partial unique index added in 20260603083100 is the real
  // correctness gate against the cross-transaction race.
  await assertSkuUniqueInStore(tx, storeId, productId, resolved)

  const existing = await tx.productVariant.findMany({
    where: { productId },
    select: { id: true },
  })
  const existingIds = new Set(existing.map((v) => v.id))
  const incomingIds = new Set(
    resolved.map((v) => v.id).filter((id): id is string => id !== undefined),
  )

  // Delete: existing rows not referenced in the incoming array.
  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id))
  if (toDelete.length > 0) {
    await tx.productVariant.deleteMany({ where: { id: { in: toDelete } } })
  }

  // The partial unique index "ProductVariant_productId_default_unique"
  // enforces at-most-one isDefault=true per product. To avoid colliding
  // with an existing default while we write the new one, clear ALL
  // defaults on this product first, then re-flag the right one in the
  // upsert loop below.
  if (existingIds.size > 0) {
    await tx.productVariant.updateMany({
      where: { productId, isDefault: true },
      data: { isDefault: false },
    })
  }

  // Upsert each incoming variant. Sequential so any P2002 from the SKU
  // index surfaces against the exact culprit; map it to SkuConflictError.
  try {
    for (const v of resolved) {
      const data = {
        name: v.name,
        unitValue: v.unitValue.toString(),
        unit: v.unit,
        pricePaise: v.pricePaise,
        isAvailable: v.isAvailable ?? true,
        isDefault: v.isDefault,
        sku: v.sku ?? null,
        sortOrder: v.sortOrder ?? 0,
        imageUrl: v.imageUrl ?? null,
        imagePublicId: v.imagePublicId ?? null,
      }
      if (v.id !== undefined && existingIds.has(v.id)) {
        await tx.productVariant.update({ where: { id: v.id }, data })
      } else {
        await tx.productVariant.create({ data: { ...data, productId } })
      }
    }
  } catch (err) {
    // P2002 on the SKU partial unique index — translate to typed error.
    if (
      typeof err === "object" &&
      err !== null &&
      (err as { code?: string }).code === "P2002" &&
      Array.isArray((err as { meta?: { target?: string[] } }).meta?.target) &&
      (err as { meta: { target: string[] } }).meta.target.includes("sku")
    ) {
      const sku = resolved.find((v) => v.sku !== undefined && v.sku !== null)?.sku ?? ""
      throw new SkuConflictError(sku, "(race lost to concurrent write)")
    }
    throw err
  }

  // Force a no-op write on Product.searchAliases — the BEFORE UPDATE OF
  // trigger watches that column and recomputes searchVector from the
  // now-final variant set. Replaces the dropped per-row propagator from
  // 20260603083100, cutting an N-variant create from O(N) trigger-driven
  // round-trips to exactly one.
  await tx.$executeRaw`UPDATE "Product" SET "searchAliases" = "searchAliases" WHERE id = ${productId}`

  // Resolve default after writes to return the canonical values.
  const def = await tx.productVariant.findFirst({
    where: { productId, isDefault: true },
    select: { id: true, pricePaise: true, unit: true, imageUrl: true },
  })
  if (def === null) {
    // Should be impossible after the above logic; defensive throw.
    throw new MultipleDefaultVariantsError("Failed to resolve default variant after sync")
  }
  return def
}

/**
 * Build a legacy-shaped variant from the deprecated Product.pricePaise /
 * unit fields when the caller didn't pass a `variants` array. Lets
 * existing tests + scripts continue working through IP-2.0; new owner UI
 * always sends the explicit array.
 */
function synthesizeDefaultVariant(input: {
  pricePaise: number
  unit: Unit
  imageUrl?: string
  imagePublicId?: string
}): VariantInput {
  return {
    name: "Default",
    unitValue: 1,
    unit: input.unit,
    pricePaise: input.pricePaise,
    isAvailable: true,
    isDefault: true,
    sku: null,
    sortOrder: 0,
    imageUrl: input.imageUrl ?? null,
    imagePublicId: input.imagePublicId ?? null,
  }
}

export async function createProduct(
  storeId: string,
  ownerId: string,
  input: CreateProductBody,
): Promise<ProductView> {
  await assertOwnSubcategory(storeId, input.subcategoryId)
  assertDiscountUnderPrice(input.pricePaise, input.discountType, input.discountValue)

  // IP-2 — resolve incoming variants OR synthesize one from the legacy
  // pricePaise + unit fields so callers that haven't migrated keep working.
  const incomingVariants: VariantInput[] = input.variants ?? [
    synthesizeDefaultVariant(input),
  ]

  try {
    // Bumped transaction timeout — variant create/update fires the
    // search-vector trigger via a propagator on ProductVariant, which
    // each round-trips through Postgres for a SELECT-then-UPDATE on
    // Product.searchVector. On Neon (~100ms RTT) a 3-variant create
    // can cumulatively exceed Prisma's default 5s. 15s covers a
    // reasonable upper bound (10+ variants) without masking real issues.
    const created = await prisma.$transaction(
      async (tx) => {
        const product = await tx.product.create({
          data: {
            storeId,
            subcategoryId: input.subcategoryId,
            name: input.name,
            description: input.description,
            // Legacy columns; mirrored to the default variant below.
            pricePaise: input.pricePaise,
            unit: input.unit,
            imageUrl: input.imageUrl,
            imagePublicId: input.imagePublicId,
            isAvailable: input.isAvailable ?? true,
            searchAliases: input.searchAliases ?? [],
            discountType: input.discountType ?? null,
            discountValue: input.discountValue ?? null,
            discountValidUntil: input.discountValidUntil
              ? new Date(input.discountValidUntil)
              : null,
          },
          select: { id: true },
        })

        const def = await syncVariants(tx, product.id, storeId, incomingVariants)

        // Mirror the resolved default variant's price/unit (and image when
        // none was supplied at product-level) onto the legacy Product
        // columns so reads via the deprecated path stay consistent until
        // IP-2.5 drops them.
        await tx.product.update({
          where: { id: product.id },
          data: {
            pricePaise: def.pricePaise,
            unit: def.unit,
          },
        })

        return tx.product.findUniqueOrThrow({ where: { id: product.id }, select: SELECT })
      },
      { timeout: 15_000, maxWait: 5_000 },
    )

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
        effectivePricePaise: h.pricePaise,
        discountType: null,
        discountValue: null,
        discountValidUntil: null,
        imagePublicId: null,
        isFeatured: false,
        featuredOrder: null,
        isPromoted: false,
        promotedUntil: null,
        searchAliases: [],
        // IP-2 — SearchHit doesn't carry variants. Owner search-result
        // rows show the product summary; clicking through to the editor
        // calls getProduct which returns the full ProductView with
        // variants[].
        variants: [],
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

  // Phase 6.8 — discount. An explicit discountType drives the trio; null
  // clears the whole discount. (The schema refine guarantees value is present
  // when a type is set.)
  if (input.discountType !== undefined) {
    if (input.discountType === null) {
      data.discountType = null
      data.discountValue = null
      data.discountValidUntil = null
    } else {
      data.discountType = input.discountType
      data.discountValue = input.discountValue ?? null
      data.discountValidUntil =
        input.discountValidUntil != null ? new Date(input.discountValidUntil) : null
    }
  } else if (input.discountValidUntil !== undefined) {
    // Adjust just the expiry of an existing discount.
    data.discountValidUntil =
      input.discountValidUntil === null ? null : new Date(input.discountValidUntil)
  }

  // FLAT_PAISE must stay under the price. Use the new price if it's being
  // updated, else the product's current price.
  if (data.discountType === DiscountType.FLAT_PAISE && data.discountValue != null) {
    let priceForCheck = data.pricePaise as number | undefined
    if (priceForCheck === undefined) {
      const current = await prisma.product.findFirst({
        where: { id: productId, storeId },
        select: { pricePaise: true },
      })
      if (current === null) throw new NotFoundError("Product not found")
      priceForCheck = current.pricePaise
    }
    assertDiscountUnderPrice(priceForCheck, DiscountType.FLAT_PAISE, data.discountValue as number)
  }

  // IP-2 — if the caller is also reshaping variants in this PATCH, the
  // whole operation runs in a transaction so the product row + variant
  // table land atomically. Other PATCHes (price-only, name-only) still
  // get the cheaper single-statement path.
  const hasVariantUpdate = input.variants !== undefined
  const hasFieldUpdate = Object.keys(data).length > 0
  if (!hasVariantUpdate && !hasFieldUpdate) {
    return getProduct(storeId, productId)
  }

  try {
    // Bumped timeout — see createProduct for the rationale (variant
    // writes trigger per-row search-vector recomputation via the
    // ProductVariant propagator, which round-trips to Postgres N times).
    const updated = await prisma.$transaction(
      async (tx) => {
        // Verify product exists + belongs to this store BEFORE writing
        // variants (avoid orphaning a sync when the product PATCH would fail).
        const exists = await tx.product.findFirst({
          where: { id: productId, storeId },
          select: { id: true },
        })
        if (exists === null) throw new NotFoundError("Product not found")

        if (hasFieldUpdate) {
          await tx.product.update({ where: { id: productId }, data })
        }

        if (hasVariantUpdate) {
          const def = await syncVariants(tx, productId, storeId, input.variants!)
          // Mirror the new default variant onto the deprecated Product
          // columns so legacy reads stay consistent.
          await tx.product.update({
            where: { id: productId },
            data: { pricePaise: def.pricePaise, unit: def.unit },
          })
        }

        return tx.product.findUniqueOrThrow({ where: { id: productId }, select: SELECT })
      },
      { timeout: 15_000, maxWait: 5_000 },
    )

    events.emit({
      type: "product.updated",
      storeId,
      productId,
      ownerId,
      fields: [
        ...Object.keys(data),
        ...(hasVariantUpdate ? ["variants"] : []),
      ],
    })
    return toView(updated)
  } catch (err) {
    rethrowAsAppError(err)
  }
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
