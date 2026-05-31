import { z } from "zod"
import { OrderStatus } from "../../generated/prisma/enums.js"

export const placeOrderBodySchema = z.strictObject({
  addressId: z.string().min(1).max(40),
  cart: z
    .array(
      z.strictObject({
        productId: z.string().min(1).max(40),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(100),
  couponCode: z.string().trim().min(3).max(40).optional(),
  customerNote: z.string().trim().max(500).optional(),
  // COD is the only payment method today; accept it explicitly so the wire
  // contract is future-proof when more land.
  paymentMethod: z.literal("COD").optional().default("COD"),
})
export type PlaceOrderBody = z.infer<typeof placeOrderBodySchema>

export const orderIdParamSchema = z.strictObject({
  id: z.string().min(1).max(40),
})
export type OrderIdParam = z.infer<typeof orderIdParamSchema>

export const listOrdersQuerySchema = z.strictObject({
  cursor: z.string().min(1).max(40).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  // Phase DP-1 — filter to a specific store. Used by the home "Buy again"
  // rail to fetch only orders from the currently-selected primary store.
  storeId: z.string().min(1).max(40).optional(),
})
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>

export const ownerListOrdersQuerySchema = z.strictObject({
  cursor: z.string().min(1).max(40).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  status: z.nativeEnum(OrderStatus).optional(),
})
export type OwnerListOrdersQuery = z.infer<typeof ownerListOrdersQuerySchema>

// Phase 8 — lifecycle transition bodies.
export const rejectOrderBodySchema = z.strictObject({
  reason: z.string().trim().min(1).max(300),
})
export type RejectOrderBody = z.infer<typeof rejectOrderBodySchema>

export const cancelOrderBodySchema = z.strictObject({
  reason: z.string().trim().min(1).max(300).optional(),
})
export type CancelOrderBody = z.infer<typeof cancelOrderBodySchema>
