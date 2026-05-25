import { z } from "zod"

const urlSchema = z
  .string()
  .max(500)
  .refine((v) => v.startsWith("https://") || v.startsWith("http://"), {
    message: "URL must start with http:// or https://",
  })

export const createCategoryBodySchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  displayOrder: z.number().int().min(0).max(10_000).optional().default(0),
  iconUrl: urlSchema.optional(),
})
export type CreateCategoryBody = z.infer<typeof createCategoryBodySchema>

export const updateCategoryBodySchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    displayOrder: z.number().int().min(0).max(10_000).optional(),
    iconUrl: urlSchema.nullable().optional(),
  })
  .strict()
export type UpdateCategoryBody = z.infer<typeof updateCategoryBodySchema>

export const categoryIdParamSchema = z.strictObject({
  id: z.string().min(1).max(40),
})
export type CategoryIdParam = z.infer<typeof categoryIdParamSchema>
