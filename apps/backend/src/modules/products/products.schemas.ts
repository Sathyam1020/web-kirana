import { z } from "zod"
import { Unit } from "../../generated/prisma/enums.js"

const imageUrlSchema = z
  .string()
  .max(500)
  .refine((v) => v.startsWith("https://") || v.startsWith("http://"), {
    message: "imageUrl must start with http:// or https://",
  })

// Coerce-then-check for query params that arrive as strings. The default-
// before-transform pattern keeps both the input ("true"/"false" string or
// missing) and output (boolean) types correct.
const boolFromQuery = z
  .enum(["true", "false"])
  .transform((v) => v === "true")

const optionalBoolFromQuery = z
  .enum(["true", "false"])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === "true"))

// Phase 4.2 — owner-curated synonyms (English, Romanized Hindi, native script).
// Bounded so a malicious owner can't blow up the search vector.
const searchAliasesSchema = z
  .array(z.string().trim().min(1).max(100))
  .max(20)
  .default([])
  .transform((arr) =>
    Array.from(new Set(arr.map((a) => a.toLowerCase()))), // dedupe, lowercase
  )

export const createProductBodySchema = z.strictObject({
  categoryId: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  // ₹1 floor, ₹50,000 ceiling. Sub-rupee items can be re-enabled by dropping
  // the min to 1 if/when the marketplace decides to.
  pricePaise: z.number().int().min(100).max(5_000_000),
  unit: z.nativeEnum(Unit),
  imageUrl: imageUrlSchema.optional(),
  isAvailable: z.boolean().optional().default(true),
  searchAliases: searchAliasesSchema.optional(),
})
export type CreateProductBody = z.infer<typeof createProductBodySchema>

export const updateProductBodySchema = z
  .object({
    categoryId: z.string().min(1).max(40).optional(),
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    pricePaise: z.number().int().min(100).max(5_000_000).optional(),
    unit: z.nativeEnum(Unit).optional(),
    imageUrl: imageUrlSchema.nullable().optional(),
    isAvailable: z.boolean().optional(),
    searchAliases: searchAliasesSchema.optional(),
  })
  .strict()
export type UpdateProductBody = z.infer<typeof updateProductBodySchema>

export const productIdParamSchema = z.strictObject({
  id: z.string().min(1).max(40),
})
export type ProductIdParam = z.infer<typeof productIdParamSchema>

// Phase 4.3 — Featured (owner self-curates within their store).
export const featureProductBodySchema = z.strictObject({
  // Sort key within the store's featured row. Lower = more prominent. If
  // omitted, defaults to 0 (which puts it first by default unless another
  // featured product has 0 too — break ties by createdAt).
  featuredOrder: z.number().int().min(0).max(10_000).optional(),
})
export type FeatureProductBody = z.infer<typeof featureProductBodySchema>

export const listProductsQuerySchema = z.strictObject({
  cursor: z.string().min(1).max(40).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  category: z.string().min(1).max(40).optional(),
  available: optionalBoolFromQuery,
  includeInactive: boolFromQuery
    .optional()
    .transform((v) => v ?? false),
  // Owner-side search: when present, switches the list to scored search
  // results filtered to the owner's store. Defers to the central search
  // service for ranking consistency with the public endpoint.
  q: z.string().trim().min(1).max(100).optional(),
})
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>
