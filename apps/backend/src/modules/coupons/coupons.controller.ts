import type { Request, Response } from "express"
import { UnauthorizedError } from "../../lib/errors.js"
import { sendCreated, sendData, sendNoContent } from "../../lib/response.js"
import { getValidated } from "../../lib/validated.js"
import * as service from "./coupons.service.js"
import type {
  AdminCreateCouponBody,
  CouponIdParam,
  ListCouponsQuery,
  OwnerCreateCouponBody,
  PreviewCouponBody,
  UpdateCouponBody,
} from "./coupons.schemas.js"

// --- Admin (GLOBAL) ----------------------------------------------------

export async function adminCreate(req: Request, res: Response): Promise<void> {
  if (req.user === undefined) throw new UnauthorizedError()
  const body = req.body as AdminCreateCouponBody
  const coupon = await service.adminCreate(req.user.id, body)
  sendCreated(res, { coupon })
}

export async function adminList(req: Request, res: Response): Promise<void> {
  const query = getValidated(req).query as ListCouponsQuery
  const result = await service.adminList({
    cursor: query.cursor,
    limit: query.limit,
    includeInactive: query.includeInactive,
  })
  sendData(res, result)
}

export async function adminGet(req: Request, res: Response): Promise<void> {
  const { id } = getValidated(req).params as CouponIdParam
  const coupon = await service.adminGet(id)
  sendData(res, { coupon })
}

export async function adminUpdate(req: Request, res: Response): Promise<void> {
  const { id } = getValidated(req).params as CouponIdParam
  const body = req.body as UpdateCouponBody
  const coupon = await service.adminUpdate(id, body)
  sendData(res, { coupon })
}

export async function adminSoftDelete(req: Request, res: Response): Promise<void> {
  const { id } = getValidated(req).params as CouponIdParam
  await service.adminSoftDelete(id)
  sendNoContent(res)
}

// --- Owner (STORE) -----------------------------------------------------

function requireStoreContext(req: Request): { storeId: string; ownerId: string } {
  if (req.user === undefined) throw new UnauthorizedError()
  if (req.ownStore === undefined) {
    throw new UnauthorizedError("Store context missing — middleware misconfigured")
  }
  return { storeId: req.ownStore.id, ownerId: req.user.id }
}

export async function ownerCreate(req: Request, res: Response): Promise<void> {
  const { storeId, ownerId } = requireStoreContext(req)
  const body = req.body as OwnerCreateCouponBody
  const coupon = await service.ownerCreate(ownerId, storeId, body)
  sendCreated(res, { coupon })
}

export async function ownerList(req: Request, res: Response): Promise<void> {
  const { storeId } = requireStoreContext(req)
  const query = getValidated(req).query as ListCouponsQuery
  const result = await service.ownerList({
    storeId,
    cursor: query.cursor,
    limit: query.limit,
    includeInactive: query.includeInactive,
  })
  sendData(res, result)
}

export async function ownerGet(req: Request, res: Response): Promise<void> {
  const { storeId } = requireStoreContext(req)
  const { id } = getValidated(req).params as CouponIdParam
  const coupon = await service.ownerGet(storeId, id)
  sendData(res, { coupon })
}

export async function ownerUpdate(req: Request, res: Response): Promise<void> {
  const { storeId } = requireStoreContext(req)
  const { id } = getValidated(req).params as CouponIdParam
  const body = req.body as UpdateCouponBody
  const coupon = await service.ownerUpdate(storeId, id, body)
  sendData(res, { coupon })
}

export async function ownerSoftDelete(req: Request, res: Response): Promise<void> {
  const { storeId } = requireStoreContext(req)
  const { id } = getValidated(req).params as CouponIdParam
  await service.ownerSoftDelete(storeId, id)
  sendNoContent(res)
}

// --- Customer preview --------------------------------------------------

export async function preview(req: Request, res: Response): Promise<void> {
  if (req.user === undefined) throw new UnauthorizedError()
  const body = req.body as PreviewCouponBody
  const result = await service.preview(req.user.id, body)
  sendData(res, result)
}
