import type { Request, Response } from "express"
import { sendData } from "../../lib/response.js"
import { getValidated } from "../../lib/validated.js"
import * as service from "./search.service.js"
import type { SearchProductsQuery } from "./search.schemas.js"

/** Public search endpoint: customers + anonymous. */
export async function publicSearch(req: Request, res: Response): Promise<void> {
  const query = getValidated(req).query as SearchProductsQuery
  const result = await service.searchProducts({
    q: query.q,
    page: query.page,
    limit: query.limit,
    storeId: query.storeId,
    categoryId: query.categoryId,
    subcategoryId: query.subcategoryId,
    lat: query.lat,
    lng: query.lng,
    radiusMeters: query.radiusMeters,
    // No ownerScope — customers must see only active/open stuff.
  })
  sendData(res, result)
}
