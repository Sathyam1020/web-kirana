import { z } from "zod"

const urlSchema = z
  .string()
  .max(500)
  .refine((v) => v.startsWith("https://") || v.startsWith("http://"), {
    message: "URL must start with http:// or https://",
  })

/**
 * Categories (L2). Admin-owned, scoped to a Department. (departmentId, name)
 * is unique — two departments can both have a category called "Beverages".
 */
export const createCategoryBodySchema = z.strictObject({
  departmentId: z.string().min(1).max(40),
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
    // departmentId reparenting is intentionally NOT supported here — moving
    // an L2 between departments invalidates every subcategory + product
    // under it from a discovery perspective, so it should be a deliberate
    // future-phase operation (likely with a confirmation flow).
  })
  .strict()
export type UpdateCategoryBody = z.infer<typeof updateCategoryBodySchema>

export const categoryIdParamSchema = z.strictObject({
  id: z.string().min(1).max(40),
})
export type CategoryIdParam = z.infer<typeof categoryIdParamSchema>

/**
 * GET /v1/categories — optional `?departmentId=` to narrow to one dept.
 * Flat list either way; departments grid uses GET /v1/departments?nested=true.
 */
export const listCategoriesQuerySchema = z.strictObject({
  departmentId: z.string().min(1).max(40).optional(),
})
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>
