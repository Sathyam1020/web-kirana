import type { Request, Response } from "express"
import { UnauthorizedError, ValidationError } from "../../lib/errors.js"
import { sendCreated, sendData } from "../../lib/response.js"
import { getValidated } from "../../lib/validated.js"
import * as service from "./orders.service.js"
import type {
  ListOrdersQuery,
  OrderIdParam,
  OwnerListOrdersQuery,
  PlaceOrderBody,
} from "./orders.schemas.js"

// --- Customer -----------------------------------------------------------

export async function place(req: Request, res: Response): Promise<void> {
  if (req.user === undefined) throw new UnauthorizedError()
  const key = req.header("Idempotency-Key")
  if (key === undefined || key.length < 8 || key.length > 200) {
    throw new ValidationError("Idempotency-Key header is required")
  }
  const body = req.body as PlaceOrderBody
  const { order } = await service.placeOrder(req.user.id, key, body)
  // Always 201 — a replay returns the same order, which is still the
  // canonical "your order exists" result.
  sendCreated(res, { order })
}

export async function listMine(req: Request, res: Response): Promise<void> {
  if (req.user === undefined) throw new UnauthorizedError()
  const query = getValidated(req).query as ListOrdersQuery
  sendData(res, await service.listCustomerOrders(req.user.id, query))
}

export async function getMine(req: Request, res: Response): Promise<void> {
  if (req.user === undefined) throw new UnauthorizedError()
  const { id } = getValidated(req).params as OrderIdParam
  sendData(res, { order: await service.getCustomerOrder(req.user.id, id) })
}

// --- Owner (req.ownStore set by requireOwnStore) ------------------------

export async function listStore(req: Request, res: Response): Promise<void> {
  if (req.ownStore === undefined) throw new UnauthorizedError()
  const query = getValidated(req).query as OwnerListOrdersQuery
  sendData(res, await service.listStoreOrders(req.ownStore.id, query))
}

export async function getStore(req: Request, res: Response): Promise<void> {
  if (req.ownStore === undefined) throw new UnauthorizedError()
  const { id } = getValidated(req).params as OrderIdParam
  sendData(res, { order: await service.getStoreOrder(req.ownStore.id, id) })
}
