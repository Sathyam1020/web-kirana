import { z } from "zod"
import { isLooksLikePhone } from "../../lib/phone.js"

const phoneSchema = z
  .string()
  .max(40)
  .refine(isLooksLikePhone, { message: "Invalid phone number" })

const latitudeSchema = z.number().min(-90).max(90)
const longitudeSchema = z.number().min(-180).max(180)

const imageUrlSchema = z
  .string()
  .max(500)
  .refine((v) => v.startsWith("https://") || v.startsWith("http://"), {
    message: "imageUrl must start with http:// or https://",
  })

// Cloudinary public_id, persisted alongside imageUrl for future cleanup.
const imagePublicIdSchema = z.string().max(255)

export const createStoreBodySchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  phone: phoneSchema,
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  deliveryRadiusMeters: z.number().int().min(500).max(15_000).optional().default(3000),
  minOrderPaise: z.number().int().min(0).max(1_000_000).optional().default(0),
  addressLine: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(100),
  pincode: z.string().trim().min(3).max(20),
  imageUrl: imageUrlSchema.optional(),
  imagePublicId: imagePublicIdSchema.optional(),
})
export type CreateStoreBody = z.infer<typeof createStoreBodySchema>

/**
 * Partial update — all create fields optional, unknown keys rejected, isOpen
 * NOT accepted here (use PATCH /open). Description and imageUrl accept null
 * so the owner can clear them.
 */
export const updateStoreBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    phone: phoneSchema.optional(),
    latitude: latitudeSchema.optional(),
    longitude: longitudeSchema.optional(),
    deliveryRadiusMeters: z.number().int().min(500).max(15_000).optional(),
    minOrderPaise: z.number().int().min(0).max(1_000_000).optional(),
    addressLine: z.string().trim().min(1).max(200).optional(),
    city: z.string().trim().min(1).max(100).optional(),
    pincode: z.string().trim().min(3).max(20).optional(),
    imageUrl: imageUrlSchema.nullable().optional(),
    imagePublicId: imagePublicIdSchema.nullable().optional(),
    autoResetAvailability: z.boolean().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    // Latitude and longitude must move together — accepting one without the
    // other would leave a half-updated location (the trigger fires correctly
    // either way, but it's a sign of client bug).
    const hasLat = val.latitude !== undefined
    const hasLng = val.longitude !== undefined
    if (hasLat !== hasLng) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: hasLat ? ["longitude"] : ["latitude"],
        message: "latitude and longitude must be updated together",
      })
    }
  })
export type UpdateStoreBody = z.infer<typeof updateStoreBodySchema>

export const openToggleBodySchema = z.strictObject({
  isOpen: z.boolean(),
})
export type OpenToggleBody = z.infer<typeof openToggleBodySchema>

// --- Phase 5: public discovery -----------------------------------------

/**
 * GET /v1/stores/nearby — public, anonymous-allowed. Geo filter is required:
 * lat + lng, with an optional radiusMeters (default 5km). includeClosed flips
 * the isOpen filter; isActive=true is ALWAYS enforced server-side regardless.
 */
export const nearbyQuerySchema = z.strictObject({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusMeters: z.coerce.number().int().min(500).max(50_000).optional().default(5000),
  page: z.coerce.number().int().min(1).max(50).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
  // Query strings are strings; accept "true"/"false" and coerce.
  includeClosed: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
})
export type NearbyQuery = z.infer<typeof nearbyQuerySchema>

/**
 * Used by GET /v1/stores/:id and GET /v1/stores/:id/products. The controller
 * short-circuits with next() when id === "me" so the owner-side router can
 * take over for that path — without that, /:id would shadow /me.
 */
export const storeIdParamSchema = z.strictObject({
  id: z.string().min(1).max(40),
})
export type StoreIdParam = z.infer<typeof storeIdParamSchema>

/**
 * GET /v1/stores/:id/products — public product list scoped to a single store.
 * Phase 6.6: accepts both `categoryId` (L2, JOINs via subcategory) and
 * `subcategoryId` (L3, direct FK) — combine to narrow further.
 * `q` delegates to the search service so ranking matches /v1/search/products.
 */
export const storeProductsQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(100).optional(),
  categoryId: z.string().min(1).max(40).optional(),
  subcategoryId: z.string().min(1).max(40).optional(),
  page: z.coerce.number().int().min(1).max(50).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
})
export type StoreProductsQuery = z.infer<typeof storeProductsQuerySchema>

/**
 * GET /v1/stores/:id/categories — paginated continuation of the initial
 * categorySections returned by /v1/stores/:id. The FE calls this when the
 * customer scrolls past the first 8 sections on the store-home page.
 */
export const storeCategoriesQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(50).optional().default(1),
  limit: z.coerce.number().int().min(1).max(20).optional().default(6),
})
export type StoreCategoriesQuery = z.infer<typeof storeCategoriesQuerySchema>
