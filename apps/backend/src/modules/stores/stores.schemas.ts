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
