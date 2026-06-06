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

// IP-1 — "HH:MM" 24-hour wall-clock. 00:00 → 23:59. Used for openTime /
// closeTime. Storing as a string (not minutes-past-midnight) keeps the UI,
// the cron, and admin debugging in the same units the picker speaks.
const hhmmSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "expected HH:MM (00:00–23:59)" })

// IP-1 — caps. Base fee ≤ ₹500 keeps owners from typo'ing a fee that locks
// every customer out. Threshold ≤ ₹20,000 is generous (most kiranas live in
// the ₹100–₹500 band). Min order already capped at ₹10,000.
const baseDeliveryFeePaiseSchema = z.number().int().min(0).max(50_000)
const freeDeliveryThresholdPaiseSchema = z.number().int().min(0).max(2_000_000)

export const createStoreBodySchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  phone: phoneSchema,
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  // IP-1: bumped 15k → 25k so owners on the edge of a service area can
  // reach customers in the adjacent neighbourhood.
  deliveryRadiusMeters: z.number().int().min(500).max(25_000).optional().default(3000),
  minOrderPaise: z.number().int().min(0).max(1_000_000).optional().default(0),
  // IP-1: fee + free-above-threshold; both default 0 so a store created
  // without setting them charges nothing — matches pre-IP-1 behaviour.
  baseDeliveryFeePaise: baseDeliveryFeePaiseSchema.optional().default(0),
  freeDeliveryThresholdPaise: freeDeliveryThresholdPaiseSchema.optional().default(0),
  // IP-1: hours default to 07:00–22:00, the most common kirana window.
  openTime: hhmmSchema.optional().default("07:00"),
  closeTime: hhmmSchema.optional().default("22:00"),
  // IP-1: emergency override. New stores default OFF (the hours decide).
  manualClosed: z.boolean().optional().default(false),
  addressLine: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(100),
  pincode: z.string().trim().min(3).max(20),
  imageUrl: imageUrlSchema.optional(),
  imagePublicId: imagePublicIdSchema.optional(),
}).superRefine((val, ctx) => {
  // IP-1: same equal-hours guard as updateStoreBodySchema. Defaults are
  // 07:00 / 22:00 so this only fires when the owner explicitly sends a
  // pair that's equal.
  if (val.openTime === val.closeTime) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["closeTime"],
      message: "openTime and closeTime must be different",
    })
  }
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
    // IP-1: bumped 15k → 25k (same as createStoreBodySchema).
    deliveryRadiusMeters: z.number().int().min(500).max(25_000).optional(),
    minOrderPaise: z.number().int().min(0).max(1_000_000).optional(),
    // IP-1: fees + hours + manual override editable via owner settings.
    baseDeliveryFeePaise: baseDeliveryFeePaiseSchema.optional(),
    freeDeliveryThresholdPaise: freeDeliveryThresholdPaiseSchema.optional(),
    openTime: hhmmSchema.optional(),
    closeTime: hhmmSchema.optional(),
    manualClosed: z.boolean().optional(),
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
    // IP-1: openTime === closeTime is the one window that doesn't mean
    // anything (zero-length OR full-day, depending on how you read it).
    // Force the owner to pick. Crossing midnight (open > close) is fine —
    // the cron handles it.
    if (
      val.openTime !== undefined &&
      val.closeTime !== undefined &&
      val.openTime === val.closeTime
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["closeTime"],
        message: "openTime and closeTime must be different",
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
