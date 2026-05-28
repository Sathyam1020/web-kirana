import { z } from "zod"

const imageUrlSchema = z
  .string()
  .max(500)
  .refine((v) => v.startsWith("https://") || v.startsWith("http://"), {
    message: "imageUrl must start with http:// or https://",
  })

export const createBannerBodySchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  imageUrl: imageUrlSchema,
  imagePublicId: z.string().max(255).optional(),
})
export type CreateBannerBody = z.infer<typeof createBannerBodySchema>

/** `bannerId: null` hides the banner (deactivates whatever is active). */
export const setActiveBannerBodySchema = z.strictObject({
  bannerId: z.string().min(1).max(40).nullable(),
})
export type SetActiveBannerBody = z.infer<typeof setActiveBannerBodySchema>

export const bannerIdParamSchema = z.strictObject({
  id: z.string().min(1).max(40),
})
export type BannerIdParam = z.infer<typeof bannerIdParamSchema>
