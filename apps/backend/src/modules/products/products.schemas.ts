import { z } from "zod"
import { DiscountType, Unit } from "../../generated/prisma/enums.js"

// Phase 6.8 — per-product discount validation shared by create + update.
// The FLAT_PAISE < pricePaise check needs the (possibly updated) price, so it
// lives in the service; here we only check shape + the type/value pairing.
function refineDiscount(
  v: { discountType?: DiscountType | null; discountValue?: number | null },
  ctx: z.RefinementCtx,
): void {
  const { discountType: type, discountValue: value } = v
  const typeSet = type !== undefined && type !== null
  const valueSet = value !== undefined && value !== null
  if (typeSet && !valueSet) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["discountValue"],
      message: "discountValue is required when discountType is set",
    })
    return
  }
  if (valueSet && !typeSet) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["discountType"],
      message: "discountType is required when discountValue is set",
    })
    return
  }
  if (typeSet && valueSet) {
    if (type === DiscountType.PERCENT && (value < 1 || value > 100)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discountValue"],
        message: "Percentage discount must be between 1 and 100",
      })
    }
    if (type === DiscountType.FLAT_PAISE && value < 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discountValue"],
        message: "Flat discount must be at least ₹1",
      })
    }
  }
}

const imageUrlSchema = z
  .string()
  .max(500)
  .refine((v) => v.startsWith("https://") || v.startsWith("http://"), {
    message: "imageUrl must start with http:// or https://",
  })

// Cloudinary public_id (e.g. "products/<storeId>/<id>"). Opaque string,
// persisted alongside imageUrl for future orphan-asset cleanup (Phase 6.7).
const imagePublicIdSchema = z.string().max(255)

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

/**
 * IP-2 — one entry in the variants array carried by create / update.
 *
 * `id` is optional: present when editing an existing variant (service
 * matches by id and patches), absent for new ones (service inserts).
 * The full incoming array is the new state — anything not in it gets
 * deleted (per-store SKU uniqueness + per-product-name uniqueness are
 * service-layer assertions on top).
 *
 * Each variant carries its own unit + unitValue so a single product can
 * have "1 kg" (KG) + "Pack of 6" (PIECE) sized differently. Per-variant
 * imageUrl is optional with read-time fallback to the product image.
 */
const variantInputSchema = z.strictObject({
  id: z.string().min(1).max(40).optional(),
  name: z.string().trim().min(1).max(80),
  unitValue: z.number().positive().max(100_000),
  unit: z.nativeEnum(Unit),
  pricePaise: z.number().int().min(100).max(5_000_000),
  isAvailable: z.boolean().optional().default(true),
  isDefault: z.boolean().optional().default(false),
  sku: z.string().trim().min(1).max(60).nullable().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional().default(0),
  imageUrl: imageUrlSchema.nullable().optional(),
  imagePublicId: imagePublicIdSchema.nullable().optional(),
})
export type VariantInput = z.infer<typeof variantInputSchema>

const variantsArraySchema = z
  .array(variantInputSchema)
  .min(1, { message: "A product must have at least one variant" })
  .max(20, { message: "Max 20 variants per product" })
  .superRefine((arr, ctx) => {
    // At most one isDefault=true. Zero defaults is OK — the service marks
    // the first variant default in that case (consistent with the
    // "every product has exactly one default" invariant).
    const defaults = arr.filter((v) => v.isDefault === true).length
    if (defaults > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exactly one variant must be isDefault=true",
      })
    }
    // Names unique within the array (the DB also enforces via @@unique).
    const seenNames = new Set<string>()
    for (let i = 0; i < arr.length; i++) {
      const variant = arr[i]
      if (variant === undefined) continue
      const name = variant.name.toLowerCase()
      if (seenNames.has(name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [i, "name"],
          message: "Variant name must be unique within the product",
        })
      }
      seenNames.add(name)
    }
  })

/**
 * Phase 6.6 — products FK to Subcategory (L3), not Category. The admin
 * L2/L1 are reachable via JOIN through Subcategory.categoryId on the read
 * path; on writes the owner picks a sub they own (verified server-side).
 */
export const createProductBodySchema = z
  .strictObject({
    subcategoryId: z.string().min(1).max(40),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(1000).optional(),
    // ₹1 floor, ₹50,000 ceiling. Sub-rupee items can be re-enabled by dropping
    // the min to 1 if/when the marketplace decides to.
    pricePaise: z.number().int().min(100).max(5_000_000),
    unit: z.nativeEnum(Unit),
    imageUrl: imageUrlSchema.optional(),
    imagePublicId: imagePublicIdSchema.optional(),
    isAvailable: z.boolean().optional().default(true),
    searchAliases: searchAliasesSchema.optional(),
    // Phase 6.8 — optional product discount.
    discountType: z.nativeEnum(DiscountType).optional(),
    discountValue: z.number().int().min(1).max(5_000_000).optional(),
    discountValidUntil: z.string().datetime().optional(),
    // IP-2 — optional variants array. When present, defines the variant
    // set explicitly (service inserts each); when absent, the service
    // synthesizes a single "Default" variant from `pricePaise` + `unit`
    // so legacy callers (existing tests + scripts that haven't migrated)
    // keep working through IP-2.0.
    variants: variantsArraySchema.optional(),
  })
  .superRefine(refineDiscount)
export type CreateProductBody = z.infer<typeof createProductBodySchema>

export const updateProductBodySchema = z
  .object({
    // Moving across subs goes through POST /:id/move (see moveProductBodySchema).
    // PATCH is field-edits only.
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    pricePaise: z.number().int().min(100).max(5_000_000).optional(),
    unit: z.nativeEnum(Unit).optional(),
    imageUrl: imageUrlSchema.nullable().optional(),
    imagePublicId: imagePublicIdSchema.nullable().optional(),
    isAvailable: z.boolean().optional(),
    searchAliases: searchAliasesSchema.optional(),
    // Phase 6.8 — set the discount, or pass null to clear it. Clearing the
    // type clears value + expiry too (handled in the service).
    discountType: z.nativeEnum(DiscountType).nullable().optional(),
    discountValue: z.number().int().min(1).max(5_000_000).nullable().optional(),
    discountValidUntil: z.string().datetime().nullable().optional(),
    // IP-2 — when present, replaces the full variant set (id-matched
    // upsert; missing ids are deleted; new entries inserted). When
    // absent, variants are left unchanged. The service mirrors the
    // default variant's price/unit onto the deprecated Product.pricePaise
    // / Product.unit columns for legacy reader compat.
    variants: variantsArraySchema.optional(),
  })
  .strict()
  .superRefine(refineDiscount)
export type UpdateProductBody = z.infer<typeof updateProductBodySchema>

/**
 * Phase 6.6 — move a product between subcategories (within the same
 * store). Both source and target subs must belong to the calling owner.
 */
export const moveProductBodySchema = z.strictObject({
  subcategoryId: z.string().min(1).max(40),
})
export type MoveProductBody = z.infer<typeof moveProductBodySchema>

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
  // Phase 6.6: filter by L3 (subcategoryId) for "products in this sub"
  // or L2 (categoryId) for "products under this admin category, across
  // all of my subs under it". Both optional, can combine.
  subcategoryId: z.string().min(1).max(40).optional(),
  categoryId: z.string().min(1).max(40).optional(),
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
