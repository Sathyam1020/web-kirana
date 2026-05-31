import { prisma } from "../../db/prisma.js"

/**
 * Aggregate stats surfaced on the customer account screen's hero row.
 *
 * - ordersPlaced  → lifetime placed orders (any status — what the customer
 *                   intended to buy, not what shipped). Single COUNT.
 * - savingsPaise  → sum of `discountAppliedPaise` across the customer's
 *                   coupon redemptions. Discount lives on the
 *                   CouponRedemption row joined to Order; not directly on
 *                   Order. New customers see ₹0 until they redeem a coupon,
 *                   keeping the number honest.
 */
export interface MeStats {
  ordersPlaced: number
  savingsPaise: number
}

export async function getMeStats(customerId: string): Promise<MeStats> {
  const [ordersPlaced, redemptionAgg] = await Promise.all([
    prisma.order.count({ where: { customerId } }),
    prisma.couponRedemption.aggregate({
      where: { order: { customerId } },
      _sum: { discountAppliedPaise: true },
    }),
  ])
  return {
    ordersPlaced,
    savingsPaise: redemptionAgg._sum.discountAppliedPaise ?? 0,
  }
}
