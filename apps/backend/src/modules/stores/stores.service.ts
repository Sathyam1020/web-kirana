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

export interface ProductPublicView {
  id: string
  storeId: string
  categoryId: string
  categoryName: string
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
  categoryId: true,
  name: true,
  description: true,
  pricePaise: true,
  unit: true,
  imageUrl: true,
  isAvailable: true,
  isFeatured: true,
  featuredOrder: true,
  category: { select: { name: true } },
} as const

function toPublicProductView(row: {
  id: string
  storeId: string
  categoryId: string
  name: string
  description: string | null
  pricePaise: number
  unit: Unit
  imageUrl: string | null
  isAvailable: boolean
  isFeatured: boolean
  featuredOrder: number | null
  category: { name: string }
}): ProductPublicView {
  const { category, ...rest } = row
  return { ...rest, categoryName: category.name }
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

export interface StoreDetailResult {
  store: StorePublicView
  featuredProducts: ProductPublicView[]
  categories: CategoryCount[]
}

export async function getStorePublic(storeId: string): Promise<StoreDetailResult> {
  // Three reads with no inter-dependency: parallelize. Saves 2 × Neon RTT
  // (~10-20ms) on every store-detail render — directly visible on the
  // customer PWA's hero load.
  const [store, featuredRows, groups] = await Promise.all([
    prisma.store.findFirst({
      where: { id: storeId, isActive: true },
      select: PUBLIC_STORE_SELECT,
    }),
    // Featured products surface the curated row first on store detail.
    // Hidden products (isActive=false) and out-of-stock items
    // (isAvailable=false) are excluded so the carousel never shows ghosts.
    // Note: even if the store turns out to be inactive (404 below), this
    // extra query is wasted work — but it's small (LIMIT 20), and the
    // happy path always renders these, so eager-fetching is the right
    // default.
    prisma.product.findMany({
      where: {
        storeId,
        isActive: true,
        isAvailable: true,
        isFeatured: true,
      },
      select: PUBLIC_PRODUCT_SELECT,
      // featuredOrder ASC NULLS LAST keeps pinned items predictable;
      // createdAt DESC breaks ties so the most recently featured wins.
      orderBy: [
        { featuredOrder: { sort: "asc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      take: MAX_FEATURED_PRODUCTS,
    }),
    // Per-category counts so the customer PWA can render category chips
    // with badge counts. Empty categories are filtered out by groupBy
    // semantics (only produces rows for present categoryIds).
    prisma.product.groupBy({
      by: ["categoryId"],
      where: {
        storeId,
        isActive: true,
        isAvailable: true,
      },
      _count: { _all: true },
    }),
  ])
  if (store === null) throw new NotFoundError("Store not found")

  const categoryIds = groups.map((g) => g.categoryId)
  const categoryRows =
    categoryIds.length === 0
      ? []
      : await prisma.category.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true, displayOrder: true },
        })
  const countMap = new Map(groups.map((g) => [g.categoryId, g._count._all]))

  const sortedRows = categoryRows
    .map((c) => ({
      id: c.id,
      name: c.name,
      productCount: countMap.get(c.id) ?? 0,
      displayOrder: c.displayOrder,
    }))
    .sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder
      return a.name.localeCompare(b.name)
    })
  const categories: CategoryCount[] = sortedRows.map((c) => ({
    id: c.id,
    name: c.name,
    productCount: c.productCount,
  }))

  return {
    store: toPublicView(store),
    featuredProducts: featuredRows.map(toPublicProductView),
    categories,
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
    category?: string
    page: number
    limit: number
  },
): Promise<StoreProductsResult> {
  await assertActivePublicStore(storeId)

  // When `q` is present, delegate to the central search service so ranking
  // matches /v1/search/products exactly. The search service enforces the
  // public-customer filter (store open+active, product active+available).
  if (opts.q !== undefined && opts.q.length > 0) {
    const result = await searchProducts({
      q: opts.q,
      storeId,
      categoryId: opts.category,
      page: opts.page,
      limit: opts.limit,
    })
    return {
      items: result.items.map((h) => ({
        id: h.id,
        storeId: h.storeId,
        categoryId: h.categoryId,
        categoryName: h.categoryName,
        name: h.name,
        description: h.description,
        pricePaise: h.pricePaise,
        unit: h.unit,
        imageUrl: h.imageUrl,
        isAvailable: h.isAvailable,
        // SearchHit doesn't carry featured state. Tile UI that needs the
        // star/pin can call /v1/stores/:id (featuredProducts list) which is
        // always cheap.
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
  }
  if (opts.category !== undefined) where.categoryId = opts.category

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

