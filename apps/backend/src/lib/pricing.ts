/**
 * Phase 6.8 — product discount pricing. Single source of truth for "is this
 * discount active right now" and "what does the customer actually pay",
 * reused by the product views and the coupon preview (coupons stack on the
 * already-discounted price).
 */

import { DiscountType } from "../generated/prisma/enums.js"

export interface DiscountInput {
  pricePaise: number
  discountType: DiscountType | null
  discountValue: number | null
  discountValidUntil: Date | null
}

/**
 * A discount counts only when type + value are set AND it hasn't expired
 * (null validUntil = no expiry).
 */
export function isDiscountActive(
  p: Pick<DiscountInput, "discountType" | "discountValue" | "discountValidUntil">,
  now: Date = new Date(),
): boolean {
  if (p.discountType === null || p.discountValue === null) return false
  if (p.discountValidUntil !== null && p.discountValidUntil.getTime() <= now.getTime()) {
    return false
  }
  return true
}

/**
 * The price the customer pays after an active discount. Floors to whole paise
 * and never drops below 0. Returns pricePaise unchanged when no active
 * discount applies.
 */
export function effectivePricePaise(p: DiscountInput, now: Date = new Date()): number {
  if (!isDiscountActive(p, now)) return p.pricePaise
  // discountValue is non-null here (isDiscountActive checked it).
  const value = p.discountValue as number
  if (p.discountType === DiscountType.PERCENT) {
    const discounted = Math.round(p.pricePaise * (1 - value / 100))
    return Math.max(0, discounted)
  }
  // FLAT_PAISE
  return Math.max(0, p.pricePaise - value)
}
