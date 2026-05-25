import { z } from "zod"

/**
 * Public product search. Page-based pagination (vs cursor) because the
 * order column is a derived score — cursors over a scored list are
 * brittle when scores tie or queries reshape the result set.
 */
export const searchProductsQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(100),
  page: z.coerce.number().int().min(1).max(50).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  // Optional scope filters
  storeId: z.string().min(1).max(40).optional(),
  categoryId: z.string().min(1).max(40).optional(),
  // Optional location filter for Phase 5 to plug in via querystring rather
  // than a separate endpoint. All three must be present together.
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusMeters: z.coerce.number().int().min(500).max(50_000).optional(),
})

export type SearchProductsQuery = z.infer<typeof searchProductsQuerySchema>
