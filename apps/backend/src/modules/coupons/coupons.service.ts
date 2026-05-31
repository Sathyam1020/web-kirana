import { prisma } from "../../db/prisma.js"
import { CouponScope, CouponType } from "../../generated/prisma/enums.js"
import { NotFoundError } from "../../lib/errors.js"
import { effectivePricePaise } from "../../lib/pricing.js"
import { rethrowAsAppError } from "../../lib/prisma-errors.js"
import type {
  AdminCreateCouponBody,
  OwnerCreateCouponBody,
  PreviewCouponBody,
  UpdateCouponBody,
} from "./coupons.schemas.js"

/**
 * Pure discount math, shared by the customer preview and the Phase 7 order
 * placement transaction so both compute the coupon discount identically.
 * PERCENT is floored and capped by maxDiscountPaise; FLAT never exceeds the
 * subtotal.
 */
export function computeCouponDiscountPaise(opts: {
  type: CouponType
  value: number
  maxDiscountPaise: number | null
  subtotalPaise: number
}): number {
  if (opts.type === CouponType.PERCENT) {
    let d = Math.floor((opts.subtotalPaise * opts.value) / 100)
    if (opts.maxDiscountPaise !== null) d = Math.min(d, opts.maxDiscountPaise)
    return d
  }
  return Math.min(opts.value, opts.subtotalPaise)
}

export interface CouponView {
  id: string
  code: string
  type: CouponType
  value: number
  scope: CouponScope
  storeId: string | null
  maxDiscountPaise: number | null
  minOrderPaise: number
  validFrom: Date
  validUntil: Date | null
  isActive: boolean
  totalUsageLimit: number | null
  perUserLimit: number
  usageCount: number
  createdById: string
  createdAt: Date
  updatedAt: Date
}

const SELECT = {
  id: true,
  code: true,
  type: true,
  value: true,
  scope: true,
  storeId: true,
  maxDiscountPaise: true,
  minOrderPaise: true,
  validFrom: true,
  validUntil: true,
  isActive: true,
  totalUsageLimit: true,
  perUserLimit: true,
  usageCount: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} as const

// --- Admin (GLOBAL) ----------------------------------------------------

export async function adminCreate(
  adminId: string,
  input: AdminCreateCouponBody,
): Promise<CouponView> {
  try {
    return await prisma.coupon.create({
      data: {
        code: input.code,
        type: input.type,
        value: input.value,
        scope: CouponScope.GLOBAL,
        storeId: null,
        maxDiscountPaise: input.maxDiscountPaise ?? null,
        minOrderPaise: input.minOrderPaise,
        validFrom: input.validFrom,
        validUntil: input.validUntil ?? null,
        isActive: input.isActive,
        totalUsageLimit: input.totalUsageLimit ?? null,
        perUserLimit: input.perUserLimit,
        createdById: adminId,
      },
      select: SELECT,
    })
  } catch (err) {
    rethrowAsAppError(err)
  }
}

export async function adminList(opts: {
  cursor?: string
  limit: number
  includeInactive: boolean
}): Promise<{ items: CouponView[]; nextCursor: string | null; hasMore: boolean }> {
  const where: Record<string, unknown> = { scope: CouponScope.GLOBAL }
  if (!opts.includeInactive) where.isActive = true
  const items = await prisma.coupon.findMany({
    where,
    select: SELECT,
    take: opts.limit + 1,
    ...(opts.cursor !== undefined ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  })
  const hasMore = items.length > opts.limit
  const trimmed = hasMore ? items.slice(0, opts.limit) : items
  const last = trimmed[trimmed.length - 1]
  return {
    items: trimmed,
    nextCursor: hasMore && last !== undefined ? last.id : null,
    hasMore,
  }
}

export async function adminGet(id: string): Promise<CouponView> {
  const row = await prisma.coupon.findFirst({
    where: { id, scope: CouponScope.GLOBAL },
    select: SELECT,
  })
  if (row === null) throw new NotFoundError("Coupon not found")
  return row
}

export async function adminUpdate(
  id: string,
  input: UpdateCouponBody,
): Promise<CouponView> {
  const data: Record<string, unknown> = {}
  if (input.type !== undefined) data.type = input.type
  if (input.value !== undefined) data.value = input.value
  if (input.maxDiscountPaise !== undefined) data.maxDiscountPaise = input.maxDiscountPaise
  if (input.minOrderPaise !== undefined) data.minOrderPaise = input.minOrderPaise
  if (input.validFrom !== undefined) data.validFrom = input.validFrom
  if (input.validUntil !== undefined) data.validUntil = input.validUntil
  if (input.isActive !== undefined) data.isActive = input.isActive
  if (input.totalUsageLimit !== undefined) data.totalUsageLimit = input.totalUsageLimit
  if (input.perUserLimit !== undefined) data.perUserLimit = input.perUserLimit

  if (Object.keys(data).length === 0) return adminGet(id)
  const claim = await prisma.coupon.updateMany({
    where: { id, scope: CouponScope.GLOBAL },
    data,
  })
  if (claim.count === 0) throw new NotFoundError("Coupon not found")
  return prisma.coupon.findUniqueOrThrow({ where: { id }, select: SELECT })
}

export async function adminSoftDelete(id: string): Promise<void> {
  const claim = await prisma.coupon.updateMany({
    where: { id, scope: CouponScope.GLOBAL, isActive: true },
    data: { isActive: false },
  })
  if (claim.count === 0) {
    const exists = await prisma.coupon.findFirst({
      where: { id, scope: CouponScope.GLOBAL },
      select: { id: true },
    })
    if (exists === null) throw new NotFoundError("Coupon not found")
    // already inactive — idempotent
  }
}

// --- Owner (STORE) -----------------------------------------------------

export async function ownerCreate(
  ownerId: string,
  storeId: string,
  input: OwnerCreateCouponBody,
): Promise<CouponView> {
  try {
    return await prisma.coupon.create({
      data: {
        code: input.code,
        type: input.type,
        value: input.value,
        scope: CouponScope.STORE,
        storeId, // server-derived from req.ownStore — never trust the body
        maxDiscountPaise: input.maxDiscountPaise ?? null,
        minOrderPaise: input.minOrderPaise,
        validFrom: input.validFrom,
        validUntil: input.validUntil ?? null,
        isActive: input.isActive,
        totalUsageLimit: input.totalUsageLimit ?? null,
        perUserLimit: input.perUserLimit,
        createdById: ownerId,
      },
      select: SELECT,
    })
  } catch (err) {
    rethrowAsAppError(err)
  }
}

export async function ownerList(opts: {
  storeId: string
  cursor?: string
  limit: number
  includeInactive: boolean
}): Promise<{ items: CouponView[]; nextCursor: string | null; hasMore: boolean }> {
  const where: Record<string, unknown> = {
    scope: CouponScope.STORE,
    storeId: opts.storeId,
  }
  if (!opts.includeInactive) where.isActive = true
  const items = await prisma.coupon.findMany({
    where,
    select: SELECT,
    take: opts.limit + 1,
    ...(opts.cursor !== undefined ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  })
  const hasMore = items.length > opts.limit
  const trimmed = hasMore ? items.slice(0, opts.limit) : items
  const last = trimmed[trimmed.length - 1]
  return {
    items: trimmed,
    nextCursor: hasMore && last !== undefined ? last.id : null,
    hasMore,
  }
}

export async function ownerGet(storeId: string, id: string): Promise<CouponView> {
  const row = await prisma.coupon.findFirst({
    where: { id, scope: CouponScope.STORE, storeId },
    select: SELECT,
  })
  if (row === null) throw new NotFoundError("Coupon not found")
  return row
}

export async function ownerUpdate(
  storeId: string,
  id: string,
  input: UpdateCouponBody,
): Promise<CouponView> {
  const data: Record<string, unknown> = {}
  if (input.type !== undefined) data.type = input.type
  if (input.value !== undefined) data.value = input.value
  if (input.maxDiscountPaise !== undefined) data.maxDiscountPaise = input.maxDiscountPaise
  if (input.minOrderPaise !== undefined) data.minOrderPaise = input.minOrderPaise
  if (input.validFrom !== undefined) data.validFrom = input.validFrom
  if (input.validUntil !== undefined) data.validUntil = input.validUntil
  if (input.isActive !== undefined) data.isActive = input.isActive
  if (input.totalUsageLimit !== undefined) data.totalUsageLimit = input.totalUsageLimit
  if (input.perUserLimit !== undefined) data.perUserLimit = input.perUserLimit

  if (Object.keys(data).length === 0) return ownerGet(storeId, id)
  const claim = await prisma.coupon.updateMany({
    where: { id, scope: CouponScope.STORE, storeId },
    data,
  })
  if (claim.count === 0) throw new NotFoundError("Coupon not found")
  return prisma.coupon.findUniqueOrThrow({ where: { id }, select: SELECT })
}

export async function ownerSoftDelete(storeId: string, id: string): Promise<void> {
  const claim = await prisma.coupon.updateMany({
    where: { id, scope: CouponScope.STORE, storeId, isActive: true },
    data: { isActive: false },
  })
  if (claim.count === 0) {
    const exists = await prisma.coupon.findFirst({
      where: { id, scope: CouponScope.STORE, storeId },
      select: { id: true },
    })
    if (exists === null) throw new NotFoundError("Coupon not found")
  }
}

// --- Public listing (DP-1) ---------------------------------------------

/**
 * Active-coupon view exposed to the customer home — slimmer than CouponView
 * (no internal createdById / usageCount / perUserLimit fields).
 */
export interface PublicCouponView {
  id: string
  code: string
  type: CouponType
  value: number
  scope: CouponScope
  /** null for GLOBAL; the owning store's id for STORE-scoped coupons. */
  storeId: string | null
  maxDiscountPaise: number | null
  minOrderPaise: number
  validUntil: Date | null
}

const PUBLIC_SELECT = {
  id: true,
  code: true,
  type: true,
  value: true,
  scope: true,
  storeId: true,
  maxDiscountPaise: true,
  minOrderPaise: true,
  validUntil: true,
} as const

/**
 * List currently-redeemable coupons for the customer-facing carousel.
 *
 * Returns combined GLOBAL (admin) + STORE (owner) coupons when `storeId`
 * is provided; GLOBAL only otherwise. Order: GLOBAL first (platform-wide
 * offers feel like the primary deal), then STORE; expiring soonest
 * surfaces first within each scope so customers see what they need to
 * grab today.
 *
 * `validFrom` / `validUntil` filtering means a coupon scheduled for the
 * future won't appear yet, and an expired one stops appearing immediately.
 */
export async function listActivePublic(
  storeId: string | undefined,
): Promise<PublicCouponView[]> {
  const now = new Date()
  const validityFilter = {
    isActive: true,
    validFrom: { lte: now },
    OR: [{ validUntil: null }, { validUntil: { gt: now } }],
  }

  const scopeFilter =
    storeId !== undefined
      ? {
          OR: [
            { scope: CouponScope.GLOBAL },
            { scope: CouponScope.STORE, storeId },
          ],
        }
      : { scope: CouponScope.GLOBAL }

  const rows = await prisma.coupon.findMany({
    where: { AND: [validityFilter, scopeFilter] },
    select: PUBLIC_SELECT,
    // GLOBAL ('GLOBAL' < 'STORE' alphabetically) → asc puts global first.
    orderBy: [{ scope: "asc" }, { validUntil: "asc" }, { createdAt: "desc" }],
    take: 20,
  })
  return rows
}

// --- Customer preview --------------------------------------------------

/**
 * Preview returns deliberately coarse reasons for any coupon-side failure
 * to avoid leaking lifecycle state via the small `[A-Z0-9-]{3,40}` code
 * space. Cart-side problems (PRODUCT_*, MULTI_STORE_CART) and
 * MIN_ORDER_NOT_MET stay granular — UX needs them and they don't reveal
 * anything about the coupon that the customer doesn't already know.
 */
export type PreviewFailureReason =
  | "INVALID_CODE"
  | "MIN_ORDER_NOT_MET"
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_UNAVAILABLE"
  | "MULTI_STORE_CART"

export interface PreviewBreakdown {
  subtotalPaise: number
  discountPaise: number
  finalPaise: number
  couponCode: string
  type: CouponType
  scope: CouponScope
  storeId: string | null
}

export type PreviewResult =
  | {
      isValid: true
      discountPaise: number
      breakdown: PreviewBreakdown
    }
  | {
      isValid: false
      reason: PreviewFailureReason
      minOrderPaise?: number
    }

/**
 * Customer-facing dry-run. Re-reads product prices server-side, validates
 * the coupon end-to-end, and returns the discount preview. Phase 7's order
 * placement re-runs the same checks inside the order transaction.
 *
 * This endpoint does NOT mutate the coupon's usageCount.
 */
export async function preview(
  userId: string,
  input: PreviewCouponBody,
): Promise<PreviewResult> {
  const coupon = await prisma.coupon.findUnique({
    where: { code: input.code },
    select: {
      id: true,
      code: true,
      type: true,
      value: true,
      scope: true,
      storeId: true,
      maxDiscountPaise: true,
      minOrderPaise: true,
      validFrom: true,
      validUntil: true,
      isActive: true,
      totalUsageLimit: true,
      perUserLimit: true,
      usageCount: true,
    },
  })

  // Single coarse failure for any coupon-state issue. Distinguishing
  // expired vs not-yet-valid vs exhausted would let an authenticated
  // customer enumerate live private codes (influencer / staff codes) by
  // binary-discriminating INVALID_CODE from the other reasons.
  const now = new Date()
  if (
    coupon === null ||
    !coupon.isActive ||
    coupon.validFrom.getTime() > now.getTime() ||
    (coupon.validUntil !== null && coupon.validUntil.getTime() <= now.getTime()) ||
    (coupon.totalUsageLimit !== null && coupon.usageCount >= coupon.totalUsageLimit)
  ) {
    return { isValid: false, reason: "INVALID_CODE" }
  }

  const productIds = input.cart.map((i) => i.productId)
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, isActive: true },
    select: {
      id: true,
      storeId: true,
      pricePaise: true,
      isAvailable: true,
      // Phase 6.8 — coupons stack on the discounted price, so the subtotal
      // is computed from each product's effective (post-discount) price.
      discountType: true,
      discountValue: true,
      discountValidUntil: true,
    },
  })
  const byId = new Map(products.map((p) => [p.id, p]))

  let subtotal = 0
  const storeIds = new Set<string>()
  for (const item of input.cart) {
    const p = byId.get(item.productId)
    if (p === undefined) return { isValid: false, reason: "PRODUCT_NOT_FOUND" }
    if (!p.isAvailable) return { isValid: false, reason: "PRODUCT_UNAVAILABLE" }
    subtotal += effectivePricePaise(p) * item.quantity
    storeIds.add(p.storeId)
  }

  // Single-store cart enforced by the order placement contract (Phase 7);
  // surfacing it here too keeps the preview honest.
  if (storeIds.size > 1) {
    return { isValid: false, reason: "MULTI_STORE_CART" }
  }
  const cartStoreId = storeIds.values().next().value as string

  // Store-scope mismatch and per-user exhaustion both collapse into
  // INVALID_CODE — same enumeration concern as the lifecycle checks above.
  // MIN_ORDER_NOT_MET stays granular because UX needs to surface the
  // threshold the customer has to clear; we only return it AFTER the
  // coupon is otherwise applicable to this cart, so it doesn't leak
  // existence of unapplicable codes.
  if (coupon.scope === CouponScope.STORE) {
    if (coupon.storeId === null || coupon.storeId !== cartStoreId) {
      return { isValid: false, reason: "INVALID_CODE" }
    }
  }

  if (coupon.perUserLimit > 0) {
    const used = await prisma.couponRedemption.count({
      where: { couponId: coupon.id, userId },
    })
    if (used >= coupon.perUserLimit) {
      return { isValid: false, reason: "INVALID_CODE" }
    }
  }

  if (subtotal < coupon.minOrderPaise) {
    return {
      isValid: false,
      reason: "MIN_ORDER_NOT_MET",
      minOrderPaise: coupon.minOrderPaise,
    }
  }

  const discountPaise = computeCouponDiscountPaise({
    type: coupon.type,
    value: coupon.value,
    maxDiscountPaise: coupon.maxDiscountPaise,
    subtotalPaise: subtotal,
  })

  return {
    isValid: true,
    discountPaise,
    breakdown: {
      subtotalPaise: subtotal,
      discountPaise,
      finalPaise: subtotal - discountPaise,
      couponCode: coupon.code,
      type: coupon.type,
      scope: coupon.scope,
      storeId: coupon.storeId,
    },
  }
}

