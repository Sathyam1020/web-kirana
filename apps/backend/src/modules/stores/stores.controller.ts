import type { Request, Response } from "express"
import { UnauthorizedError } from "../../lib/errors.js"
import { sendCreated, sendData } from "../../lib/response.js"
import { getValidated } from "../../lib/validated.js"
import * as service from "./stores.service.js"
import type {
  CreateStoreBody,
  NearbyQuery,
  OpenToggleBody,
  StoreIdParam,
  StoreProductsQuery,
  UpdateStoreBody,
} from "./stores.schemas.js"

export async function createOwnStore(req: Request, res: Response): Promise<void> {
  if (req.user === undefined) throw new UnauthorizedError()
  const body = req.body as CreateStoreBody
  const store = await service.createOwnStore(req.user.id, body)
  sendCreated(res, { store })
}

export async function getOwnStore(req: Request, res: Response): Promise<void> {
  if (req.user === undefined) throw new UnauthorizedError()
  const store = await service.getOwnStore(req.user.id)
  sendData(res, { store })
}

export async function updateOwnStore(req: Request, res: Response): Promise<void> {
  if (req.user === undefined) throw new UnauthorizedError()
  const body = req.body as UpdateStoreBody
  const store = await service.updateOwnStore(req.user.id, body)
  sendData(res, { store })
}

export async function toggleOpen(req: Request, res: Response): Promise<void> {
  if (req.user === undefined) throw new UnauthorizedError()
  const body = req.body as OpenToggleBody
  const store = await service.toggleOpen(req.user.id, body.isOpen)
  sendData(res, { store })
}

// --- Phase 5: public discovery -----------------------------------------

export async function listNearby(req: Request, res: Response): Promise<void> {
  const query = getValidated(req).query as NearbyQuery
  const result = await service.listNearbyStores({
    lat: query.lat,
    lng: query.lng,
    radiusMeters: query.radiusMeters,
    page: query.page,
    limit: query.limit,
    includeClosed: query.includeClosed ?? false,
  })
  sendData(res, result)
}

/**
 * GET /v1/stores/:id — public store detail.
 *
 * Note: /v1/stores/me is handled by the OWNER router. A router-level guard
 * on storesPublicRouter (see stores.routes.ts) exits the public router
 * with next("router") for any /me or /me/* path, so this handler only
 * ever runs for non-"me" ids.
 */
export async function getPublic(req: Request, res: Response): Promise<void> {
  const params = getValidated(req).params as StoreIdParam
  const result = await service.getStorePublic(params.id)
  sendData(res, result)
}

export async function listPublicProducts(req: Request, res: Response): Promise<void> {
  const params = getValidated(req).params as StoreIdParam
  const query = getValidated(req).query as StoreProductsQuery
  const result = await service.listStoreProducts(params.id, {
    q: query.q,
    category: query.category,
    page: query.page,
    limit: query.limit,
  })
  sendData(res, result)
}
