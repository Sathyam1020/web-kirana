import { join, sql, type Sql } from "@prisma/client-runtime-utils"
import { prisma } from "../../db/prisma.js"
import type { Unit } from "../../generated/prisma/enums.js"
import { events } from "../../lib/events.js"
import { ConflictError, NotFoundError, StoreNotCreatedError } from "../../lib/errors.js"
import { normalizePhone } from "../../lib/phone.js"
import { rethrowAsAppError } from "../../lib/prisma-errors.js"
import { searchProducts } from "../search/search.service.js"
import type { CreateStoreBody, UpdateStoreBody } from "./stores.schemas.js"

/**
 * Service-layer view shape. Latitude/longitude come back as strings (Prisma
 * Decimal serializes that way) — clients parseFloat as needed.
 */
export interface StoreView {
  id: string
  ownerId: string
  name: string
  description: string | null
  phone: string
  isActive: boolean
  isOpen: boolean
  latitude: string
  longitude: string
  deliveryRadiusMeters: number
  minOrderPaise: number
  addressLine: string
  city: string
  pincode: string
  imageUrl: string | null
  imagePublicId: string | null
  createdAt: Date
  updatedAt: Date
}

const SELECT = {
  id: true,
  ownerId: true,
  name: true,
  description: true,
  phone: true,
  isActive: true,
  isOpen: true,
  latitude: true,
  longitude: true,
  deliveryRadiusMeters: true,
  minOrderPaise: true,
  addressLine: true,
  city: true,
  pincode: true,
  imageUrl: true,
  imagePublicId: true,
  createdAt: true,
  updatedAt: true,
} as const

function toView(row: {
  id: string
  ownerId: string
  name: string
  description: string | null
  phone: string
  isActive: boolean
  isOpen: boolean
  latitude: unknown
  longitude: unknown
  deliveryRadiusMeters: number
  minOrderPaise: number
  addressLine: string
  city: string
  pincode: string
  imageUrl: string | null
  imagePublicId: string | null
  createdAt: Date
  updatedAt: Date
}): StoreView {
  return {
    ...row,
    latitude: String(row.latitude),
    longitude: String(row.longitude),
  }
}

export async function createOwnStore(
  ownerId: string,
  input: CreateStoreBody,
): Promise<StoreView> {
  const existing = await prisma.store.findUnique({
    where: { ownerId },
    select: { id: true },
  })
  if (existing !== null) {
    throw new ConflictError("You already have a store")
  }

  try {
    const created = await prisma.store.create({
      data: {
        ownerId,
        name: input.name,
        description: input.description,
        phone: normalizePhone(input.phone),
        latitude: input.latitude.toString(),
        longitude: input.longitude.toString(),
        deliveryRadiusMeters: input.deliveryRadiusMeters,
        minOrderPaise: input.minOrderPaise,
        addressLine: input.addressLine,
        city: input.city,
        pincode: input.pincode,
        imageUrl: input.imageUrl,
        imagePublicId: input.imagePublicId,
        // isOpen defaults to false in the schema — new stores require an
        // explicit open before they appear in /stores/nearby.
      },
      select: SELECT,
    })
    events.emit({ type: "store.created", storeId: created.id, ownerId })
    return toView(created)
  } catch (err) {
    rethrowAsAppError(err)
  }
}

export async function getOwnStore(ownerId: string): Promise<StoreView> {
  const row = await prisma.store.findUnique({
    where: { ownerId },
    select: SELECT,
  })
  if (row === null) throw new StoreNotCreatedError()
  return toView(row)
}

export async function updateOwnStore(
  ownerId: string,
  input: UpdateStoreBody,
): Promise<StoreView> {
  // Build the data object explicitly. `null` clears optional string fields;
  // `undefined` means "don't touch".
  const data: Record<string, unknown> = {}
  if (input.name !== undefined) data.name = input.name
  if (input.description !== undefined) data.description = input.description
  if (input.phone !== undefined) data.phone = normalizePhone(input.phone)
  if (input.latitude !== undefined) data.latitude = input.latitude.toString()
  if (input.longitude !== undefined) data.longitude = input.longitude.toString()
  if (input.deliveryRadiusMeters !== undefined) data.deliveryRadiusMeters = input.deliveryRadiusMeters
  if (input.minOrderPaise !== undefined) data.minOrderPaise = input.minOrderPaise
  if (input.addressLine !== undefined) data.addressLine = input.addressLine
  if (input.city !== undefined) data.city = input.city
  if (input.pincode !== undefined) data.pincode = input.pincode
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl
  if (input.imagePublicId !== undefined) data.imagePublicId = input.imagePublicId

  if (Object.keys(data).length === 0) {
    return getOwnStore(ownerId)
  }

  const claim = await prisma.store.updateMany({
    where: { ownerId },
    data,
  })
  if (claim.count === 0) throw new StoreNotCreatedError()

  const updated = await prisma.store.findUniqueOrThrow({
    where: { ownerId },
    select: SELECT,
  })
  events.emit({
    type: "store.updated",
    storeId: updated.id,
    ownerId,
    fields: Object.keys(data),
  })
  return toView(updated)
}

export async function toggleOpen(
  ownerId: string,
  isOpen: boolean,
): Promise<StoreView> {
  const claim = await prisma.store.updateMany({
    where: { ownerId },
    data: { isOpen },
  })
  if (claim.count === 0) throw new StoreNotCreatedError()

  const updated = await prisma.store.findUniqueOrThrow({
    where: { ownerId },
    select: SELECT,
  })
  events.emit({
    type: isOpen ? "store.opened" : "store.closed",
    storeId: updated.id,
    ownerId,
  })
  return toView(updated)
}

/**
 * Internal helper used by Phase 5 (discovery) and Phase 7 (order placement)
 * later. Not exported via the public API.
 */
export async function findStoreByIdInternal(storeId: string): Promise<StoreView | null> {
  const row = await prisma.store.findUnique({
    where: { id: storeId },
    select: SELECT,
  })
  return row === null ? null : toView(row)
}

// ========================================================================
// Phase 5 — Public discovery
// ------------------------------------------------------------------------
// Read-only, anonymous-allowed surface used by the customer PWA. We expose a
// narrower view than the owner one — no ownerId, no isActive (filtered out),
// no updatedAt. Phone stays public (kirana stores advertise it).
// ========================================================================

export interface StorePublicView {
  id: string
  name: string
  description: string | null
  phone: string
  isOpen: boolean
  latitude: string
  longitude: string
  deliveryRadiusMeters: number
  minOrderPaise: number
  addressLine: string
  city: string
  pincode: string
  imageUrl: string | null
  createdAt: Date
}

export interface StoreNearbyHit extends StorePublicView {
  /** Great-circle distance from the query point in meters (integer). */
  distanceMeters: number
}

/**
 * Phase 6.6 — public product view carries the full taxonomy chain (L1+L2+L3)
 * so customer-side tiles can show a "Atta, Rice & Dal → Rice" badge without
 * a second round-trip per item.
 */
export interface ProductPublicView {
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
  isAvailable: boolean
  isFeatured: boolean
  featuredOrder: number | null
}

export interface CategoryCount {
  id: string
  name: string
  productCount: number
}

const PUBLIC_STORE_SELECT = {
  id: true,
  name: true,
  description: true,
  phone: true,
  isOpen: true,
  latitude: true,
  longitude: true,
  deliveryRadiusMeters: true,
  minOrderPaise: true,
  addressLine: true,
  city: true,
  pincode: true,
  imageUrl: true,
  createdAt: true,
} as const

function toPublicView(row: {
  id: string
  name: string
  description: string | null
  phone: string
  isOpen: boolean
  latitude: unknown
  longitude: unknown
  deliveryRadiusMeters: number
  minOrderPaise: number
  addressLine: string
  city: string
  pincode: string
  imageUrl: string | null
  createdAt: Date
}): StorePublicView {
  return {
    ...row,
    latitude: String(row.latitude),
    longitude: String(row.longitude),
  }
}

const PUBLIC_PRODUCT_SELECT = {
  id: true,
  storeId: true,
  subcategoryId: true,
  name: true,
  description: true,
  pricePaise: true,
  unit: true,
  imageUrl: true,
  isAvailable: true,
  isFeatured: true,
  featuredOrder: true,
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

function toPublicProductView(row: {
  id: string
  storeId: string
  subcategoryId: string
  name: string
  description: string | null
  pricePaise: number
  unit: Unit
  imageUrl: string | null
  isAvailable: boolean
  isFeatured: boolean
  featuredOrder: number | null
  subcategory: {
    name: string
    category: { id: string; name: string; department: { id: string; name: string } }
  }
}): ProductPublicView {
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

// --- /v1/stores/nearby --------------------------------------------------

/**
 * Row shape returned by the raw PostGIS query in listNearbyStores. The
 * Prisma adapter for Neon decodes Decimal as runtime Decimal; we serialize
 * to string in the view so the public envelope is consistent with toView.
 */
interface NearbyRow {
  id: string
  name: string
  description: string | null
  phone: string
  isOpen: boolean
  latitude: unknown
  longitude: unknown
  deliveryRadiusMeters: number
  minOrderPaise: number
  addressLine: string
  city: string
  pincode: string
  imageUrl: string | null
  createdAt: Date
  distanceMeters: number
}

export interface NearbyResult {
  items: StoreNearbyHit[]
  page: number
  limit: number
  hasMore: boolean
}

export async function listNearbyStores(opts: {
  lat: number
  lng: number
  radiusMeters: number
  page: number
  limit: number
  includeClosed: boolean
}): Promise<NearbyResult> {
  const offset = (opts.page - 1) * opts.limit

  // Filter list. ST_DWithin uses the GIST index on Store.location; we only
  // compute ST_Distance for the candidates that survive the bbox+distance
  // prefilter.
  const conditions: Sql[] = [
    sql`s."isActive" = true`,
    sql`s.location IS NOT NULL`,
    sql`ST_DWithin(
      s.location,
      ST_SetSRID(ST_MakePoint(${opts.lng}, ${opts.lat}), 4326)::geography,
      ${opts.radiusMeters}
    )`,
  ]
  if (!opts.includeClosed) {
    conditions.push(sql`s."isOpen" = true`)
  }
  const where = join(conditions, " AND ")

  const query = sql`
    SELECT
      s.id,
      s.name,
      s.description,
      s.phone,
      s."isOpen",
      s.latitude,
      s.longitude,
      s."deliveryRadiusMeters",
      s."minOrderPaise",
      s."addressLine",
      s.city,
      s.pincode,
      s."imageUrl",
      s."createdAt",
      ROUND(
        ST_Distance(
          s.location,
          ST_SetSRID(ST_MakePoint(${opts.lng}, ${opts.lat}), 4326)::geography
        )
      )::int AS "distanceMeters"
    FROM "Store" s
    WHERE ${where}
    ORDER BY "distanceMeters" ASC, s.id ASC
    LIMIT ${opts.limit + 1} OFFSET ${offset}
  `
  const rows = await prisma.$queryRaw<NearbyRow[]>(query)

  const hasMore = rows.length > opts.limit
  const trimmed = hasMore ? rows.slice(0, opts.limit) : rows

  return {
    items: trimmed.map((row) => ({
      ...toPublicView(row),
      distanceMeters: Number(row.distanceMeters),
    })),
    page: opts.page,
    limit: opts.limit,
    hasMore,
  }
}

// --- /v1/stores/:id -----------------------------------------------------

const MAX_FEATURED_PRODUCTS = 20
/**
 * How many CategorySection objects we return on the initial store-detail
 * call. The FE lazy-paginates the rest via GET /v1/stores/:id/categories.
 */
const INITIAL_CATEGORY_SECTIONS = 8
const PRODUCTS_PER_SECTION = 12

/**
 * Phase 6.6 — new store-detail response. Locked in CLEANUP.md per your spec:
 *
 *   • departments      — admin grid (L1 → L2 nested) for the icon strip
 *                        under the banner. Only depts that have at least
 *                        one category that has at least one (active +
 *                        available) product in THIS store are returned.
 *   • featuredProducts — owner-pinned, capped at 20.
 *   • categorySections — first N (default 8) admin Categories the store
 *                        carries, each with the top M (default 12)
 *                        products + totalCount for the "See all 47" link.
 *                        Sections beyond N come from
 *                        GET /v1/stores/:id/categories.
 */
export interface StoreDetailDepartmentView {
  id: string
  name: string
  displayOrder: number
  iconUrl: string | null
  categories: Array<{
    id: string
    name: string
    displayOrder: number
    iconUrl: string | null
  }>
}

export interface CategorySection {
  category: { id: string; name: string; displayOrder: number; iconUrl: string | null }
  products: ProductPublicView[]
  totalCount: number
  hasMore: boolean
}

export interface StoreDetailResult {
  store: StorePublicView
  departments: StoreDetailDepartmentView[]
  featuredProducts: ProductPublicView[]
  categorySections: CategorySection[]
  /** Cursor for the lazy-paginated categories endpoint: total count of
   *  categories this store carries; the FE has loaded first
   *  INITIAL_CATEGORY_SECTIONS already. */
  totalCategoryCount: number
}

/**
 * Internal helper — for one storeId, returns the set of distinct
 * (categoryId, productCount) the store currently carries (active +
 * available products only, with the subcategory's kill-switch respected).
 * Ordered by Category.displayOrder asc, name asc. Used to feed the
 * category-grid + sections + paginated /:id/categories.
 */
interface StoreCategoryStat {
  category: { id: string; name: string; displayOrder: number; iconUrl: string | null; departmentId: string }
  totalCount: number
}

async function computeStoreCategoryStats(storeId: string): Promise<StoreCategoryStat[]> {
  // groupBy by Product.subcategoryId → group again client-side by
  // Subcategory.categoryId. This is two queries but the JOIN happens
  // in Prisma's relational include so we don't fan out N+1.
  const groups = await prisma.product.groupBy({
    by: ["subcategoryId"],
    where: {
      storeId,
      isActive: true,
      isAvailable: true,
      subcategory: { isAvailable: true },
    },
    _count: { _all: true },
  })

  if (groups.length === 0) return []

  const subRows = await prisma.subcategory.findMany({
    where: { id: { in: groups.map((g) => g.subcategoryId) } },
    select: {
      id: true,
      categoryId: true,
      category: {
        select: {
          id: true,
          name: true,
          displayOrder: true,
          iconUrl: true,
          departmentId: true,
        },
      },
    },
  })

  // Roll up counts per category.
  const countBySubId = new Map(groups.map((g) => [g.subcategoryId, g._count._all]))
  const perCategory = new Map<string, StoreCategoryStat>()
  for (const sub of subRows) {
    const count = countBySubId.get(sub.id) ?? 0
    const existing = perCategory.get(sub.categoryId)
    if (existing) {
      existing.totalCount += count
    } else {
      perCategory.set(sub.categoryId, {
        category: sub.category,
        totalCount: count,
      })
    }
  }
  return Array.from(perCategory.values()).sort((a, b) => {
    if (a.category.displayOrder !== b.category.displayOrder)
      return a.category.displayOrder - b.category.displayOrder
    return a.category.name.localeCompare(b.category.name)
  })
}

/**
 * Internal helper — for a single (storeId, categoryId), pulls top N
 * products (featured pinned first) + the totalCount. Used by both
 * getStorePublic and listStoreCategoryPage.
 */
async function loadProductsForStoreCategory(
  storeId: string,
  categoryId: string,
  limit: number,
): Promise<{ products: ProductPublicView[]; totalCount: number }> {
  const where = {
    storeId,
    isActive: true,
    isAvailable: true,
    subcategory: { categoryId, isAvailable: true },
  }
  const [rows, totalCount] = await Promise.all([
    prisma.product.findMany({
      where,
      select: PUBLIC_PRODUCT_SELECT,
      orderBy: [
        { isFeatured: "desc" },
        { featuredOrder: { sort: "asc", nulls: "last" } },
        { name: "asc" },
        { id: "asc" },
      ],
      take: limit,
    }),
    prisma.product.count({ where }),
  ])
  return { products: rows.map(toPublicProductView), totalCount }
}

export async function getStorePublic(storeId: string): Promise<StoreDetailResult> {
  // Parallelize the three eager reads. The category-section materialisation
  // happens after we know which top-N categories to surface (sequential).
  const [store, featuredRows, categoryStats] = await Promise.all([
    prisma.store.findFirst({
      where: { id: storeId, isActive: true },
      select: PUBLIC_STORE_SELECT,
    }),
    prisma.product.findMany({
      where: {
        storeId,
        isActive: true,
        isAvailable: true,
        isFeatured: true,
        subcategory: { isAvailable: true },
      },
      select: PUBLIC_PRODUCT_SELECT,
      orderBy: [
        { featuredOrder: { sort: "asc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      take: MAX_FEATURED_PRODUCTS,
    }),
    computeStoreCategoryStats(storeId),
  ])
  if (store === null) throw new NotFoundError("Store not found")

  // Department grid — only show departments that contain at least one
  // category present in this store.
  const departmentMap = new Map<string, StoreDetailDepartmentView>()
  for (const stat of categoryStats) {
    let dept = departmentMap.get(stat.category.departmentId)
    if (!dept) {
      dept = {
        id: stat.category.departmentId,
        name: "", // filled below in one query
        displayOrder: 0,
        iconUrl: null,
        categories: [],
      }
      departmentMap.set(stat.category.departmentId, dept)
    }
    dept.categories.push({
      id: stat.category.id,
      name: stat.category.name,
      displayOrder: stat.category.displayOrder,
      iconUrl: stat.category.iconUrl,
    })
  }
  if (departmentMap.size > 0) {
    const deptRows = await prisma.department.findMany({
      where: { id: { in: Array.from(departmentMap.keys()) } },
      select: { id: true, name: true, displayOrder: true, iconUrl: true },
    })
    for (const d of deptRows) {
      const entry = departmentMap.get(d.id)
      if (entry) {
        entry.name = d.name
        entry.displayOrder = d.displayOrder
        entry.iconUrl = d.iconUrl
      }
    }
  }
  const departments = Array.from(departmentMap.values()).sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder
    return a.name.localeCompare(b.name)
  })

  // First N category sections, each with top M products.
  const firstSlice = categoryStats.slice(0, INITIAL_CATEGORY_SECTIONS)
  const categorySections: CategorySection[] = await Promise.all(
    firstSlice.map(async (stat) => {
      const { products, totalCount } = await loadProductsForStoreCategory(
        storeId,
        stat.category.id,
        PRODUCTS_PER_SECTION,
      )
      return {
        category: {
          id: stat.category.id,
          name: stat.category.name,
          displayOrder: stat.category.displayOrder,
          iconUrl: stat.category.iconUrl,
        },
        products,
        totalCount,
        hasMore: totalCount > products.length,
      }
    }),
  )

  return {
    store: toPublicView(store),
    departments,
    featuredProducts: featuredRows.map(toPublicProductView),
    categorySections,
    totalCategoryCount: categoryStats.length,
  }
}

/**
 * Phase 6.6 — paginated continuation of categorySections. Used by the
 * customer PWA when scrolling past the initial 8 sections from
 * GET /v1/stores/:id. Each page returns up to `limit` sections with
 * `PRODUCTS_PER_SECTION` products each (12 by default).
 */
export interface StoreCategorySectionsResult {
  items: CategorySection[]
  page: number
  limit: number
  hasMore: boolean
  totalCategoryCount: number
}

export async function listStoreCategorySections(
  storeId: string,
  opts: { page: number; limit: number },
): Promise<StoreCategorySectionsResult> {
  await assertActivePublicStore(storeId)

  const stats = await computeStoreCategoryStats(storeId)
  const offset = (opts.page - 1) * opts.limit
  const slice = stats.slice(offset, offset + opts.limit)
  const items: CategorySection[] = await Promise.all(
    slice.map(async (stat) => {
      const { products, totalCount } = await loadProductsForStoreCategory(
        storeId,
        stat.category.id,
        PRODUCTS_PER_SECTION,
      )
      return {
        category: {
          id: stat.category.id,
          name: stat.category.name,
          displayOrder: stat.category.displayOrder,
          iconUrl: stat.category.iconUrl,
        },
        products,
        totalCount,
        hasMore: totalCount > products.length,
      }
    }),
  )
  return {
    items,
    page: opts.page,
    limit: opts.limit,
    hasMore: offset + slice.length < stats.length,
    totalCategoryCount: stats.length,
  }
}

// --- /v1/stores/:id/products --------------------------------------------

export interface StoreProductsResult {
  items: ProductPublicView[]
  page: number
  limit: number
  hasMore: boolean
}

async function assertActivePublicStore(storeId: string): Promise<void> {
  const row = await prisma.store.findFirst({
    where: { id: storeId, isActive: true },
    select: { id: true },
  })
  if (row === null) throw new NotFoundError("Store not found")
}

export async function listStoreProducts(
  storeId: string,
  opts: {
    q?: string
    categoryId?: string
    subcategoryId?: string
    page: number
    limit: number
  },
): Promise<StoreProductsResult> {
  await assertActivePublicStore(storeId)

  // When `q` is present, delegate to the central search service so ranking
  // matches /v1/search/products exactly. The search service enforces the
  // public-customer filter (store open+active, product active+available,
  // subcategory available).
  if (opts.q !== undefined && opts.q.length > 0) {
    const result = await searchProducts({
      q: opts.q,
      storeId,
      categoryId: opts.categoryId,
      subcategoryId: opts.subcategoryId,
      page: opts.page,
      limit: opts.limit,
    })
    return {
      items: result.items.map((h) => ({
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
        isAvailable: h.isAvailable,
        isFeatured: false,
        featuredOrder: null,
      })),
      page: result.page,
      limit: result.limit,
      hasMore: result.hasMore,
    }
  }

  const where: Record<string, unknown> = {
    storeId,
    isActive: true,
    isAvailable: true,
    // Customer-facing — respect the subcategory kill-switch too.
    subcategory: { isAvailable: true },
  }
  if (opts.subcategoryId !== undefined) {
    where.subcategoryId = opts.subcategoryId
  }
  if (opts.categoryId !== undefined) {
    // Compose with the kill-switch filter we set above.
    where.subcategory = { ...(where.subcategory as object), categoryId: opts.categoryId }
  }

  const offset = (opts.page - 1) * opts.limit
  const rows = await prisma.product.findMany({
    where,
    select: PUBLIC_PRODUCT_SELECT,
    // Featured pinned first, then by featuredOrder, then deterministic
    // tiebreak. Name ASC keeps the catalog page from shuffling on refresh.
    orderBy: [
      { isFeatured: "desc" },
      { featuredOrder: { sort: "asc", nulls: "last" } },
      { name: "asc" },
      { id: "asc" },
    ],
    take: opts.limit + 1,
    skip: offset,
  })

  const hasMore = rows.length > opts.limit
  const trimmed = hasMore ? rows.slice(0, opts.limit) : rows

  return {
    items: trimmed.map(toPublicProductView),
    page: opts.page,
    limit: opts.limit,
    hasMore,
  }
}

