import { z } from "zod"

/**
 * Subcategories (L3) — store-owned. Owner creates one under an
 * admin-published Category. (storeId, categoryId, name) is uniquely
 * indexed so the same store can't accidentally make two "Rice" subs
 * under the same L2 category.
 */

export const createSubcategoryBodySchema = z.strictObject({
  categoryId: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(80),
  displayOrder: z.number().int().min(0).max(10_000).optional().default(0),
})
export type CreateSubcategoryBody = z.infer<typeof createSubcategoryBodySchema>

/**
 * PATCH — name + displayOrder editable. categoryId reparenting is NOT
 * supported (moving a sub between L2 categories would orphan customer
 * browse paths; do a delete+recreate if you really need it).
 */
export const updateSubcategoryBodySchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    displayOrder: z.number().int().min(0).max(10_000).optional(),
  })
  .strict()
export type UpdateSubcategoryBody = z.infer<typeof updateSubcategoryBodySchema>

export const subcategoryIdParamSchema = z.strictObject({
  id: z.string().min(1).max(40),
})
export type SubcategoryIdParam = z.infer<typeof subcategoryIdParamSchema>

export const listSubcategoriesQuerySchema = z.strictObject({
  categoryId: z.string().min(1).max(40).optional(),
})
export type ListSubcategoriesQuery = z.infer<typeof listSubcategoriesQuerySchema>

/**
 * Bulk kill-switch. When false, the subcategory disappears from customer
 * browse + search even if individual products are still isAvailable=true
 * (monsoon-morning use case from CLEANUP.md).
 */
export const setSubcategoryAvailabilityBodySchema = z.strictObject({
  isAvailable: z.boolean(),
})
export type SetSubcategoryAvailabilityBody = z.infer<
  typeof setSubcategoryAvailabilityBodySchema
>

/**
 * Public-side: list a store's subcategories under one admin Category
 * (the left rail of the customer category page — your image #4).
 */
export const publicListSubcategoriesParamSchema = z.strictObject({
  id: z.string().min(1).max(40),        // storeId
  categoryId: z.string().min(1).max(40),
})
export type PublicListSubcategoriesParam = z.infer<
  typeof publicListSubcategoriesParamSchema
>
