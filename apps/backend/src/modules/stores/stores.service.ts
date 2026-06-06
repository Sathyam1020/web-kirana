import { join, sql, type Sql } from "@prisma/client-runtime-utils"
import { prisma } from "../../db/prisma.js"
import { OrderStatus } from "../../generated/prisma/enums.js"
import type { DiscountType, Unit } from "../../generated/prisma/enums.js"
import { events } from "../../lib/events.js"
import { ConflictError, NotFoundError, StoreNotCreatedError } from "../../lib/errors.js"
import { normalizePhone } from "../../lib/phone.js"
import { effectivePricePaise, effectiveVariantPricePaise } from "../../lib/pricing.js"
import { rethrowAsAppError } from "../../lib/prisma-errors.js"
import { getActiveBanner } from "../banners/banners.service.js"
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
  autoResetAvailability: boolean
  latitude: string
  longitude: string
  deliveryRadiusMeters: number
  minOrderPaise: number
  // IP-1 — fee + free-above-threshold config.
  baseDeliveryFeePaise: number
  freeDeliveryThresholdPaise: number
  // IP-1 — operating hours + emergency override (owner-only).
  openTime: string
  closeTime: string
  manualClosed: boolean
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
  autoResetAvailability: true,
  latitude: true,
  longitude: true,
  deliveryRadiusMeters: true,
  minOrderPaise: true,
  baseDeliveryFeePaise: true,
  freeDeliveryThresholdPaise: true,
  openTime: true,
  closeTime: true,
  manualClosed: true,
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
  autoResetAvailability: boolean
  latitude: unknown
  longitude: unknown
  deliveryRadiusMeters: number
  minOrderPaise: number
  baseDeliveryFeePaise: number
  freeDeliveryThresholdPaise: number
  openTime: string
  closeTime: string
  manualClosed: boolean
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
        // IP-1 — explicit on create; zod defaults fill them when omitted.
        baseDeliveryFeePaise: input.baseDeliveryFeePaise,
        freeDeliveryThresholdPaise: input.freeDeliveryThresholdPaise,
        openTime: input.openTime,
        closeTime: input.closeTime,
        manualClosed: input.manualClosed,
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
  // IP-1 — all 5 new fields editable via owner settings.
  if (input.baseDeliveryFeePaise !== undefined) data.baseDeliveryFeePaise = input.baseDeliveryFeePaise
  if (input.freeDeliveryThresholdPaise !== undefined)
    data.freeDeliveryThresholdPaise = input.freeDeliveryThresholdPaise
  if (input.openTime !== undefined) data.openTime = input.openTime
  if (input.closeTime !== undefined) data.closeTime = input.closeTime
  if (input.manualClosed !== undefined) {
    data.manualClosed = input.manualClosed
    // IP-1 — keep `isOpen` consistent with the new `manualClosed` value
    // in the SAME write so the customer view doesn't lag behind by up
    // to 15 min (the next cron tick) and show "Open" on an
    // emergency-closed store.
    //   - manualClosed → true   : force isOpen=false immediately.
    //   - manualClosed → false  : recompute isOpen from the (existing or
    //     newly-set) hours so a re-opened store snaps to the right state
    //     without waiting for the cron.
    if (input.manualClosed === true) {
      data.isOpen = false
    } else {
      // Compute hours from incoming-or-existing values. If no openTime/
      // closeTime is in this PATCH body, we need the persisted ones —
      // safe to read in a quick findUnique because we're not in a tx.
      let openTime = input.openTime
      let closeTime = input.closeTime
      if (openTime === undefined || closeTime === undefined) {
        const existing = await prisma.store.findUnique({
          where: { ownerId },
          select: { openTime: true, closeTime: true },
        })
        if (existing !== null) {
          openTime ??= existing.openTime
          closeTime ??= existing.closeTime
        }
      }
      if (openTime !== undefined && closeTime !== undefined) {
        const openMin = hhmmToMinutes(openTime)
        const closeMin = hhmmToMinutes(closeTime)
        if (openMin !== null && closeMin !== null) {
          data.isOpen = isInsideHours(istMinuteOfDay(), openMin, closeMin)
        }
      }
    }
  }
  if (input.addressLine !== undefined) data.addressLine = input.addressLine
  if (input.city !== undefined) data.city = input.city
  if (input.pincode !== undefined) data.pincode = input.pincode
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl
  if (input.imagePublicId !== undefined) data.imagePublicId = input.imagePublicId
  if (input.autoResetAvailability !== undefined)
    data.autoResetAvailability = input.autoResetAvailability

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
  // IP-1 — guarded on the value transition. An unconditional updateMany
  // would emit `store.opened` / `store.closed` even on a no-op write
  // (owner taps Open seconds after the cron already opened the store),
  // double-firing the push fan-out. Two-phase:
  //   1. updateMany WHERE isOpen != target → flips iff different.
  //   2. If count === 0, the store either doesn't exist OR is already in
  //      the target state. Disambiguate with findUnique.
  const claim = await prisma.store.updateMany({
    where: { ownerId, isOpen: !isOpen },
    data: { isOpen },
  })
  const updated = await prisma.store.findUnique({
    where: { ownerId },
    select: SELECT,
  })
  if (updated === null) throw new StoreNotCreatedError()

  if (claim.count > 0) {
    events.emit({
      type: isOpen ? "store.opened" : "store.closed",
      storeId: updated.id,
      ownerId,
    })
  }
  return toView(updated)
}

// ------------------------------------------------------------------------
// IP-1 — auto-open / auto-close based on the store's configured hours.
// ------------------------------------------------------------------------

/**
 * Parse `"HH:MM"` into `H*60 + M` for fast comparison. Returns null when
 * the string isn't well-formed (defence in depth — the zod schema gates
 * input, but bad legacy data shouldn't crash a cron tick).
 */
function hhmmToMinutes(s: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s)
  if (match === null) return null
  return Number(match[1]) * 60 + Number(match[2])
}

/**
 * `true` when `now` is inside the wall-clock window `[open, close)`.
 *
 *   - Same-day window (open < close):   inside ⇔ open ≤ now < close
 *   - Crossing-midnight (open > close): inside ⇔ now ≥ open OR now < close
 *
 * Exported for the cron test.
 */
export function isInsideHours(
  nowMinutes: number,
  openMinutes: number,
  closeMinutes: number,
): boolean {
  if (openMinutes === closeMinutes) return false // schema rejects this, but be safe
  if (openMinutes < closeMinutes) {
    return nowMinutes >= openMinutes && nowMinutes < closeMinutes
  }
  return nowMinutes >= openMinutes || nowMinutes < closeMinutes
}

/**
 * Read the wall-clock minute-of-day in `Asia/Kolkata` (IST). Stores in this
 * app are India-only, so the cron's "is it within hours right now?"
 * computation runs in IST regardless of the server's TZ (Railway runs UTC).
 *
 * Exported for the test, which injects fixed dates to exercise the
 * midnight-crossing branch.
 */
export function istMinuteOfDay(now: Date = new Date()): number {
  // Intl.DateTimeFormat is the only standard-library way to coerce a Date
  // into a target timezone without pulling in dayjs/luxon. We ask for the
  // 24-hour parts and arithmetic them — locale-independent.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now)
  const hourPart = parts.find((p) => p.type === "hour")?.value ?? "0"
  const minPart = parts.find((p) => p.type === "minute")?.value ?? "0"
  // en-GB renders 00:00 (not 24:00); Number() handles leading zeros.
  return Number(hourPart) * 60 + Number(minPart)
}

/**
 * Phase 11+IP-1 cron — sweep every active store and flip its `isOpen`
 * column to match the current IST wall clock against its configured
 * `openTime`/`closeTime`. Stores with `manualClosed=true` are skipped
 * entirely (owner override always wins).
 *
 * Per-row guarded `updateMany WHERE id=? AND isOpen=oldValue` ensures
 * that an owner who flips the manual toggle (or hits the toggleOpen
 * endpoint) in the same tick window doesn't get overwritten by stale
 * state. Each flip emits the matching `store.opened` / `store.closed`
 * event so the rest of the system (push notifications etc.) reacts
 * exactly as it does for an owner-triggered toggle.
 *
 * Returns counters so the cron log line is informative.
 */
export async function autoOpenCloseStores(
  now: Date = new Date(),
): Promise<{ opened: number; closed: number; skipped: number; scanned: number }> {
  // Perf note (deferred): sequential per-row updateMany below is O(N)
  // round-trips to Neon. At MVP store count (~tens) this is well under
  // a minute. When the catalog grows past ~hundreds and ticks start
  // bumping into the 15-min cadence (runGuarded would then skip ticks
  // and stale "Opens at HH:MM" pills last up to 30 min), bucket stores
  // by (isOpen, shouldBeOpen) into two batched `UPDATE … WHERE id =
  // ANY($1) AND isOpen=$2 RETURNING id` raw queries and emit per
  // survivor. Not worth the complexity at current scale.
  const stores = await prisma.store.findMany({
    where: { isActive: true, manualClosed: false },
    select: {
      id: true,
      ownerId: true,
      isOpen: true,
      openTime: true,
      closeTime: true,
    },
  })

  const nowMin = istMinuteOfDay(now)
  let opened = 0
  let closed = 0
  let skipped = 0

  for (const store of stores) {
    const openMin = hhmmToMinutes(store.openTime)
    const closeMin = hhmmToMinutes(store.closeTime)
    if (openMin === null || closeMin === null) {
      skipped += 1
      continue
    }
    const shouldBeOpen = isInsideHours(nowMin, openMin, closeMin)
    if (shouldBeOpen === store.isOpen) continue

    // Guarded flip: only succeeds if `isOpen` is still what we read AND
    // the owner hasn't flipped `manualClosed=true` between our SELECT
    // and this UPDATE. Without the manualClosed predicate, this race
    // sequence flips a store the owner just declared emergency-closed:
    //   1. cron findMany: store {isOpen=true, manualClosed=false}
    //   2. owner PATCH manualClosed=true (without touching isOpen)
    //   3. cron updateMany WHERE id=?, isOpen=true → matches → flips
    //      isOpen to whatever shouldBeOpen says.
    // Locking down the predicate keeps the docstring's "manualClosed
    // always wins" contract honest even under contention.
    const claim = await prisma.store.updateMany({
      where: { id: store.id, isOpen: store.isOpen, manualClosed: false },
      data: { isOpen: shouldBeOpen },
    })
    if (claim.count === 0) {
      // Someone else moved it between our SELECT and UPDATE.
      skipped += 1
      continue
    }

    if (shouldBeOpen) opened += 1
    else closed += 1
    events.emit({
      type: shouldBeOpen ? "store.opened" : "store.closed",
      storeId: store.id,
      ownerId: store.ownerId,
    })
  }

  return { opened, closed, skipped, scanned: stores.length }
}

/**
 * Phase 11 cron — re-enable products for stores that opted into the daily
 * availability reset, so owners re-check stock each morning. Only flips
 * currently-unavailable, active products on active opted-in stores.
 */
export async function resetAvailabilityForOptedInStores(): Promise<{
  stores: number
  products: number
}> {
  const stores = await prisma.store.findMany({
    where: { autoResetAvailability: true, isActive: true },
    select: { id: true },
  })
  if (stores.length === 0) return { stores: 0, products: 0 }
  const res = await prisma.product.updateMany({
    where: { storeId: { in: stores.map((s) => s.id) }, isActive: true, isAvailable: false },
    data: { isAvailable: true },
  })
  return { stores: stores.length, products: res.count }
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
  // IP-1 — exposed publicly so the customer cart can render the
  // "Add ₹X for free delivery" nudge + show the delivery fee row in the
  // bill breakdown without a second fetch.
  baseDeliveryFeePaise: number
  freeDeliveryThresholdPaise: number
  // IP-1 — hours surfaced for the store page ("Opens at 07:00" subline
  // when closed). `manualClosed` stays owner-only — customers only need
  // to know the resulting `isOpen`.
  openTime: string
  closeTime: string
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
 *
 * IP-2 — also carries the sized SKUs as `variants[]`. Each variant has its
 * own `effectivePricePaise` (the product-level discount applied to that
 * variant's `pricePaise`) so the customer card can swap pricing per chip
 * without recomputing client-side.
 */
export interface ProductPublicVariantView {
  id: string
  name: string
  unitValue: string
  unit: Unit
  pricePaise: number
  effectivePricePaise: number
  isAvailable: boolean
  isDefault: boolean
  sortOrder: number
  // Resolved image: variant.imageUrl ?? product.imageUrl. Customers don't
  // need the Cloudinary public_id.
  imageUrl: string | null
}

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
  // Phase 6.8 — price after an active discount (== pricePaise if none).
  effectivePricePaise: number
  discountType: DiscountType | null
  discountValue: number | null
  discountValidUntil: Date | null
  unit: Unit
  imageUrl: string | null
  isAvailable: boolean
  isFeatured: boolean
  featuredOrder: number | null
  // IP-2 — sized SKUs. Always ≥1; exactly one isDefault=true. Each
  // entry carries its own effectivePricePaise (product discount applied
  // to variant.pricePaise) and a resolved imageUrl (variant's if set,
  // else falls back to the product's).
  variants: ProductPublicVariantView[]
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
  // IP-1 — exposed publicly (see StorePublicView). manualClosed is NOT
  // here on purpose — owner-only.
  baseDeliveryFeePaise: true,
  freeDeliveryThresholdPaise: true,
  openTime: true,
  closeTime: true,
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
  baseDeliveryFeePaise: number
  freeDeliveryThresholdPaise: number
  openTime: string
  closeTime: string
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
  discountType: true,
  discountValue: true,
  discountValidUntil: true,
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
  // IP-2 — pull variants in the same query so customer surfaces don't
  // round-trip per product. Ordered for a stable chip layout.
  variants: {
    select: {
      id: true,
      name: true,
      unitValue: true,
      unit: true,
      pricePaise: true,
      isAvailable: true,
      isDefault: true,
      sortOrder: true,
      imageUrl: true,
    },
    orderBy: [
      { sortOrder: "asc" },
      { name: "asc" },
    ] as Array<{ sortOrder: "asc" } | { name: "asc" }>,
  },
}

function toPublicProductView(row: {
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
  isAvailable: boolean
  isFeatured: boolean
  featuredOrder: number | null
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
    sortOrder: number
    imageUrl: string | null
  }>
}): ProductPublicView {
  const { subcategory, variants, ...rest } = row
  // The product-level discount fields apply to every variant — combine
  // here so the wire format carries per-variant effective prices.
  const product = {
    discountType: row.discountType,
    discountValue: row.discountValue,
    discountValidUntil: row.discountValidUntil,
  }
  return {
    ...rest,
    effectivePricePaise: effectivePricePaise(row),
    subcategoryName: subcategory.name,
    categoryId: subcategory.category.id,
    categoryName: subcategory.category.name,
    departmentId: subcategory.category.department.id,
    departmentName: subcategory.category.department.name,
    variants: variants.map((v) => ({
      id: v.id,
      name: v.name,
      unitValue: String(v.unitValue), // Decimal → string per the convention
      unit: v.unit,
      pricePaise: v.pricePaise,
      effectivePricePaise: effectiveVariantPricePaise(v, product),
      isAvailable: v.isAvailable,
      isDefault: v.isDefault,
      sortOrder: v.sortOrder,
      // IP-2 — variant.imageUrl ?? product.imageUrl resolution at the
      // wire boundary so customer cards don't have to fall back.
      imageUrl: v.imageUrl ?? row.imageUrl,
    })),
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
  // IP-1 — same shape as StorePublicView; the raw query has to project
  // them explicitly since it doesn't use PUBLIC_STORE_SELECT.
  baseDeliveryFeePaise: number
  freeDeliveryThresholdPaise: number
  openTime: string
  closeTime: string
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
    // Store-centric coverage: each store sets its own deliveryRadiusMeters, so a
    // store with a 15km reach should appear for a user 6km away even if the
    // user's UI radius is smaller. The user-provided radiusMeters acts as an
    // outer sanity cap so we don't surface a store 80km away just because it
    // claims that radius.
    sql`ST_DWithin(
      s.location,
      ST_SetSRID(ST_MakePoint(${opts.lng}, ${opts.lat}), 4326)::geography,
      s."deliveryRadiusMeters"
    )`,
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
      s."baseDeliveryFeePaise",
      s."freeDeliveryThresholdPaise",
      s."openTime",
      s."closeTime",
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

/**
 * Trust signals shown on the customer home hero. Each value is `null` until
 * we have enough sample size; the FE hides individual pills accordingly.
 *
 *   - ordersThisMonth   — count of placed-or-later orders this calendar month
 *   - avgDeliveryMinutes — average (deliveredAt - acceptedAt) over the past
 *                          30 days; null until at least 5 delivered orders
 *   - onTimePercent      — % of those that finished within 45 min of accept;
 *                          null on the same threshold
 */
export interface StoreTrustStats {
  ordersThisMonth: number
  avgDeliveryMinutes: number | null
  onTimePercent: number | null
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
  // Phase 6.8 — active promotional banner, or null.
  activeBanner: { id: string; name: string; imageUrl: string } | null
  // DP-1 — trust signals for the hero stats pills.
  stats: StoreTrustStats
}

const ON_TIME_THRESHOLD_MS = 45 * 60 * 1000
const STATS_MIN_SAMPLE = 5

async function getStoreTrustStats(storeId: string): Promise<StoreTrustStats> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [ordersThisMonth, delivered] = await Promise.all([
    prisma.order.count({
      where: {
        storeId,
        createdAt: { gte: monthStart },
        // Anything that survived past the "placed but never accepted" bin.
        status: { notIn: [OrderStatus.REJECTED] },
      },
    }),
    prisma.order.findMany({
      where: {
        storeId,
        status: OrderStatus.DELIVERED,
        deliveredAt: { gte: last30 },
        acceptedAt: { not: null },
      },
      select: { acceptedAt: true, deliveredAt: true },
    }),
  ])

  const durations: number[] = []
  for (const o of delivered) {
    if (o.acceptedAt === null || o.deliveredAt === null) continue
    const d = o.deliveredAt.getTime() - o.acceptedAt.getTime()
    if (d > 0) durations.push(d)
  }

  if (durations.length < STATS_MIN_SAMPLE) {
    return { ordersThisMonth, avgDeliveryMinutes: null, onTimePercent: null }
  }

  const totalMs = durations.reduce((a, b) => a + b, 0)
  const avgDeliveryMinutes = Math.round(totalMs / durations.length / 60_000)
  const onTimeCount = durations.filter((d) => d <= ON_TIME_THRESHOLD_MS).length
  const onTimePercent = Math.round((onTimeCount / durations.length) * 100)

  return { ordersThisMonth, avgDeliveryMinutes, onTimePercent }
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
  const [store, featuredRows, categoryStats, activeBanner, stats] =
    await Promise.all([
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
      getActiveBanner(storeId),
      getStoreTrustStats(storeId),
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
    activeBanner,
    stats,
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
        // SearchHit doesn't carry discount fields; the search path shows the
        // list price. Discounts surface on the browse path (toPublicProductView).
        effectivePricePaise: h.pricePaise,
        discountType: null,
        discountValue: null,
        discountValidUntil: null,
        unit: h.unit,
        imageUrl: h.imageUrl,
        isAvailable: h.isAvailable,
        isFeatured: false,
        featuredOrder: null,
        // IP-2 — SearchHit doesn't carry variants. Search result tiles
        // surface the product summary; tapping through hits the full
        // product detail (toPublicProductView) which DOES carry the
        // variant chips. Empty array here keeps the contract honest.
        variants: [],
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

