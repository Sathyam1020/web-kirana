import { z } from "zod"
import { CouponScope, CouponType } from "../../generated/prisma/enums.js"

// Coupon code conventions:
//  - case-insensitive at the API boundary; normalized to uppercase on save
//  - 3..40 chars, letters / digits / hyphens
//  - examples: WELCOME50, STORE-OFF-10
const codeSchema = z
  .string()
  .trim()
  .min(3)
  .max(40)
  .regex(/^[A-Z0-9-]+$/i, "Code may contain letters, digits, and hyphens only")
  .transform((v) => v.toUpperCase())

const valueSchema = z.number().int().min(1).max(100_000_000)

const minOrderSchema = z.number().int().min(0).max(10_000_000)

// Common create body, with PERCENT vs FLAT_PAISE rules enforced via
// superRefine so the type of `value` is checked against `type`.
const baseCouponBody = z.strictObject({
  code: codeSchema,
  type: z.nativeEnum(CouponType),
  value: valueSchema,
  maxDiscountPaise: z.number().int().min(1).max(10_000_000).nullable().optional(),
  minOrderPaise: minOrderSchema.optional().default(0),
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional().default(true),
  totalUsageLimit: z.number().int().min(1).max(1_000_000).nullable().optional(),
  perUserLimit: z.number().int().min(1).max(100).optional().default(1),
})

function refineCoupon(
  val: z.infer<typeof baseCouponBody>,
  ctx: z.RefinementCtx,
): void {
  // value range depends on type
  if (val.type === CouponType.PERCENT) {
    if (val.value < 1 || val.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "PERCENT coupons must have value between 1 and 100",
      })
    }
  } else if (val.type === CouponType.FLAT_PAISE) {
    if (val.value < 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "FLAT_PAISE coupons must discount at least ₹1 (100 paise)",
      })
    }
    if (val.maxDiscountPaise !== undefined && val.maxDiscountPaise !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxDiscountPaise"],
        message: "maxDiscountPaise only applies to PERCENT coupons",
      })
    }
  }
  if (
    val.validUntil !== undefined &&
    val.validUntil !== null &&
    val.validFrom !== undefined &&
    val.validFrom >= val.validUntil
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["validUntil"],
      message: "validUntil must be after validFrom",
    })
  }
}

// Admin (GLOBAL) — scope is implied; no storeId accepted.
export const adminCreateCouponBodySchema = baseCouponBody.superRefine(refineCoupon)
export type AdminCreateCouponBody = z.infer<typeof adminCreateCouponBodySchema>

// Owner (STORE) — same shape, scope+storeId derived server-side.
export const ownerCreateCouponBodySchema = baseCouponBody.superRefine(refineCoupon)
export type OwnerCreateCouponBody = z.infer<typeof ownerCreateCouponBodySchema>

// Partial update — same rules apply if the field is present.
export const updateCouponBodySchema = z
  .object({
    // code is immutable once issued — customers may have it written down
    type: z.nativeEnum(CouponType).optional(),
    value: valueSchema.optional(),
    maxDiscountPaise: z.number().int().min(1).max(10_000_000).nullable().optional(),
    minOrderPaise: minOrderSchema.optional(),
    validFrom: z.coerce.date().optional(),
    validUntil: z.coerce.date().nullable().optional(),
    isActive: z.boolean().optional(),
    totalUsageLimit: z.number().int().min(1).max(1_000_000).nullable().optional(),
    perUserLimit: z.number().int().min(1).max(100).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    // Only run type↔value refinement when BOTH are present in the patch.
    if (val.type !== undefined && val.value !== undefined) {
      refineCoupon(
        {
          ...val,
          type: val.type,
          value: val.value,
          // Fill the other required fields with safe defaults to satisfy the
          // refine fn's input shape — the refine only looks at type/value/
          // maxDiscount/validFrom/validUntil.
          code: "PATCH",
          minOrderPaise: val.minOrderPaise ?? 0,
          isActive: val.isActive ?? true,
          perUserLimit: val.perUserLimit ?? 1,
        },
        ctx,
      )
    }
  })
export type UpdateCouponBody = z.infer<typeof updateCouponBodySchema>

export const couponIdParamSchema = z.strictObject({
  id: z.string().min(1).max(40),
})
export type CouponIdParam = z.infer<typeof couponIdParamSchema>

export const listCouponsQuerySchema = z.strictObject({
  cursor: z.string().min(1).max(40).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  includeInactive: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
})
export type ListCouponsQuery = z.infer<typeof listCouponsQuerySchema>

// ---- Customer preview --------------------------------------------------

export const previewCouponBodySchema = z.strictObject({
  code: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .transform((v) => v.toUpperCase()),
  cart: z
    .array(
      z.strictObject({
        productId: z.string().min(1).max(40),
        quantity: z.number().int().min(1).max(100),
      }),
    )
    .min(1)
    .max(50),
})
export type PreviewCouponBody = z.infer<typeof previewCouponBodySchema>

export { CouponScope, CouponType }
