import { z } from "zod"

/**
 * Phase 6 — Customer address book schemas.
 *
 * Address data is exclusively per-customer (FK Address.customerId → User).
 * `isDefault` lifecycle is owned by POST /v1/addresses/:id/default; PATCH
 * intentionally REJECTS isDefault so the flip-then-clear semantics live in
 * one code path (the dedicated endpoint). Same split as
 * `PATCH /stores/me` (fields) vs. `PATCH /stores/me/open` (lifecycle).
 */

const latitudeSchema = z.number().min(-90).max(90)
const longitudeSchema = z.number().min(-180).max(180)

export const createAddressBodySchema = z.strictObject({
  label: z.string().trim().min(1).max(50),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().min(1).max(200).optional(),
  city: z.string().trim().min(1).max(100),
  pincode: z.string().trim().min(3).max(20),
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  // Honoured but overridden server-side when this is the customer's first
  // address (auto-promoted to default regardless).
  isDefault: z.boolean().optional().default(false),
})
export type CreateAddressBody = z.infer<typeof createAddressBodySchema>

/**
 * Partial update. `isDefault` is NOT in the schema — strict-object will 400
 * if a client tries to pass it here. To switch the default, hit
 * POST /v1/addresses/:id/default. `line2` accepts null to clear.
 *
 * latitude and longitude must move together (same convention as the store
 * PATCH) — accepting one without the other would leave a half-updated
 * location.
 */
export const updateAddressBodySchema = z
  .object({
    label: z.string().trim().min(1).max(50).optional(),
    line1: z.string().trim().min(1).max(200).optional(),
    line2: z.string().trim().min(1).max(200).nullable().optional(),
    city: z.string().trim().min(1).max(100).optional(),
    pincode: z.string().trim().min(3).max(20).optional(),
    latitude: latitudeSchema.optional(),
    longitude: longitudeSchema.optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
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
export type UpdateAddressBody = z.infer<typeof updateAddressBodySchema>

export const addressIdParamSchema = z.strictObject({
  id: z.string().min(1).max(40),
})
export type AddressIdParam = z.infer<typeof addressIdParamSchema>
