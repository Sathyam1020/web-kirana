import type { Request, Response } from "express"
import { UnauthorizedError } from "../../lib/errors.js"
import { sendData, sendNoContent } from "../../lib/response.js"
import { getValidated } from "../../lib/validated.js"
import {
  promoteProductAdmin,
  unpromoteProductAdmin,
} from "../products/products.service.js"
import * as adminService from "./admin.service.js"
import type {
  ProductIdParam,
  PromoteProductBody,
  UserIdParam,
} from "./admin.schemas.js"

export async function listPendingOwners(req: Request, res: Response): Promise<void> {
  if (req.user === undefined) throw new UnauthorizedError()
  const owners = await adminService.listPendingOwners()
  sendData(res, { owners })
}

export async function approveOwner(req: Request, res: Response): Promise<void> {
  if (req.user === undefined) throw new UnauthorizedError()
  const { id } = getValidated(req).params as UserIdParam
  const owner = await adminService.approveOwner({
    ownerId: id,
    approverId: req.user.id,
  })
  sendData(res, { owner })
}

export async function rejectOwner(req: Request, res: Response): Promise<void> {
  if (req.user === undefined) throw new UnauthorizedError()
  const { id } = getValidated(req).params as UserIdParam
  await adminService.rejectOwner({ ownerId: id })
  sendNoContent(res)
}

export async function promoteProduct(req: Request, res: Response): Promise<void> {
  if (req.user === undefined) throw new UnauthorizedError()
  const { id } = getValidated(req).params as ProductIdParam
  const body = req.body as PromoteProductBody
  const product = await promoteProductAdmin(id, body.promotedUntil)
  sendData(res, { product })
}

export async function unpromoteProduct(req: Request, res: Response): Promise<void> {
  if (req.user === undefined) throw new UnauthorizedError()
  const { id } = getValidated(req).params as ProductIdParam
  const product = await unpromoteProductAdmin(id)
  sendData(res, { product })
}
