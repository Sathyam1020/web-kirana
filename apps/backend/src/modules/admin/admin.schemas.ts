import { z } from "zod"

// cuid format isn't strictly required (the WHERE clauses scope the rows so a
// bad id resolves to 404 / no-op) — keep this lenient so the schema doesn't
// silently lock us in if id format changes later.
export const userIdParamSchema = z.strictObject({
  id: z.string().min(1).max(40),
})
export type UserIdParam = z.infer<typeof userIdParamSchema>

export const productIdParamSchema = z.strictObject({
  id: z.string().min(1).max(40),
})
export type ProductIdParam = z.infer<typeof productIdParamSchema>

/**
 * Promotion expiry. Required, must be in the future. No min duration — admin
 * can short-promote (e.g., 1-hour flash) if they want.
 */
export const promoteProductBodySchema = z
  .strictObject({
    promotedUntil: z.coerce.date(),
  })
  .superRefine((val, ctx) => {
    if (val.promotedUntil.getTime() <= Date.now()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["promotedUntil"],
        message: "promotedUntil must be in the future",
      })
    }
  })
export type PromoteProductBody = z.infer<typeof promoteProductBodySchema>
