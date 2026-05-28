import { z } from "zod"

const urlSchema = z
  .string()
  .max(500)
  .refine((v) => v.startsWith("https://") || v.startsWith("http://"), {
    message: "URL must start with http:// or https://",
  })

/**
 * Departments (L1) — admin-owned, global. Same shape as Category at L2;
 * a small fixed grid of these is what the customer PWA renders at the top
 * of every store-detail page (Blinkit-style icon strip).
 */
export const createDepartmentBodySchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  displayOrder: z.number().int().min(0).max(10_000).optional().default(0),
  iconUrl: urlSchema.optional(),
})
export type CreateDepartmentBody = z.infer<typeof createDepartmentBodySchema>

export const updateDepartmentBodySchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    displayOrder: z.number().int().min(0).max(10_000).optional(),
    iconUrl: urlSchema.nullable().optional(),
  })
  .strict()
export type UpdateDepartmentBody = z.infer<typeof updateDepartmentBodySchema>

export const departmentIdParamSchema = z.strictObject({
  id: z.string().min(1).max(40),
})
export type DepartmentIdParam = z.infer<typeof departmentIdParamSchema>

/**
 * GET /v1/departments — query supports `?nested=true` to embed each
 * department's categories[] in the response (one round-trip is friendlier
 * for the customer PWA's icon-grid renderer).
 */
export const listDepartmentsQuerySchema = z.strictObject({
  nested: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
})
export type ListDepartmentsQuery = z.infer<typeof listDepartmentsQuerySchema>
