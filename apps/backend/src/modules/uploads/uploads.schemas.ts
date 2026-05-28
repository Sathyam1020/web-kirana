import { z } from "zod"

/** Owner can sign uploads for their own store's product / cover / banner images. */
export const ownerSignatureBodySchema = z.object({
  scope: z.enum(["product", "store", "banner"]),
})
export type OwnerSignatureBody = z.infer<typeof ownerSignatureBodySchema>

/** Admin can sign uploads for global category / department icons. */
export const adminSignatureBodySchema = z.object({
  scope: z.enum(["category", "department"]),
})
export type AdminSignatureBody = z.infer<typeof adminSignatureBodySchema>
