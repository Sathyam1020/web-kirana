import type { Request, Response } from "express"
import { UnauthorizedError } from "../../lib/errors.js"
import { sendCreated, sendData } from "../../lib/response.js"
import { getValidated } from "../../lib/validated.js"
import * as service from "./products.service.js"
import type {
  CreateProductBody,
  FeatureProductBody,
  ListProductsQuery,
  ProductIdParam,
  UpdateProductBody,
} from "./products.schemas.js"

function requireContext(req: Request): { storeId: string; ownerId: string } {
  if (req.user === undefined) throw new UnauthorizedError()
  if (req.ownStore === undefined) {
    throw new UnauthorizedError("Store context missing — middleware misconfigured")
  }
  return { storeId: req.ownStore.id, ownerId: req.user.id }
}

export async function create(req: Request, res: Response): Promise<void> {
  const { storeId, ownerId } = requireContext(req)
  const body = req.body as CreateProductBody
  const product = await service.createProduct(storeId, ownerId, body)
  sendCreated(res, { product })
}

export async function list(req: Request, res: Response): Promise<void> {
  const { storeId } = requireContext(req)
  const query = getValidated(req).query as ListProductsQuery
  const result = await service.listProducts(storeId, query)
  sendData(res, result)
}

export async function get(req: Request, res: Response): Promise<void> {
  const { storeId } = requireContext(req)
  const { id } = getValidated(req).params as ProductIdParam
  const product = await service.getProduct(storeId, id)
  sendData(res, { product })
}

export async function update(req: Request, res: Response): Promise<void> {
  const { storeId, ownerId } = requireContext(req)
  const { id } = getValidated(req).params as ProductIdParam
  const body = req.body as UpdateProductBody
  const product = await service.updateProduct(storeId, ownerId, id, body)
  sendData(res, { product })
}

export async function softDelete(req: Request, res: Response): Promise<void> {
  const { storeId, ownerId } = requireContext(req)
  const { id } = getValidated(req).params as ProductIdParam
  const product = await service.softDeleteProduct(storeId, ownerId, id)
  sendData(res, { product })
}

export async function restore(req: Request, res: Response): Promise<void> {
  const { storeId, ownerId } = requireContext(req)
  const { id } = getValidated(req).params as ProductIdParam
  const product = await service.restoreProduct(storeId, ownerId, id)
  sendData(res, { product })
}

export async function feature(req: Request, res: Response): Promise<void> {
  const { storeId, ownerId } = requireContext(req)
  const { id } = getValidated(req).params as ProductIdParam
  const body = req.body as FeatureProductBody
  const product = await service.featureProduct(storeId, ownerId, id, body)
  sendData(res, { product })
}

export async function unfeature(req: Request, res: Response): Promise<void> {
  const { storeId, ownerId } = requireContext(req)
  const { id } = getValidated(req).params as ProductIdParam
  const product = await service.unfeatureProduct(storeId, ownerId, id)
  sendData(res, { product })
}
