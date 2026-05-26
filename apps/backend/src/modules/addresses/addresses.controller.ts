import type { Request, Response } from "express"
import { UnauthorizedError } from "../../lib/errors.js"
import { sendCreated, sendData, sendNoContent } from "../../lib/response.js"
import { getValidated } from "../../lib/validated.js"
import * as service from "./addresses.service.js"
import type {
  AddressIdParam,
  CreateAddressBody,
  UpdateAddressBody,
} from "./addresses.schemas.js"

export async function create(req: Request, res: Response): Promise<void> {
  if (req.user === undefined) throw new UnauthorizedError()
  const body = req.body as CreateAddressBody
  const address = await service.createAddress(req.user.id, body)
  sendCreated(res, { address })
}

export async function list(req: Request, res: Response): Promise<void> {
  if (req.user === undefined) throw new UnauthorizedError()
  const items = await service.listAddresses(req.user.id)
  sendData(res, { items })
}

export async function get(req: Request, res: Response): Promise<void> {
  if (req.user === undefined) throw new UnauthorizedError()
  const params = getValidated(req).params as AddressIdParam
  const address = await service.getAddress(req.user.id, params.id)
  sendData(res, { address })
}

export async function update(req: Request, res: Response): Promise<void> {
  if (req.user === undefined) throw new UnauthorizedError()
  const params = getValidated(req).params as AddressIdParam
  const body = req.body as UpdateAddressBody
  const address = await service.updateAddress(req.user.id, params.id, body)
  sendData(res, { address })
}

export async function remove(req: Request, res: Response): Promise<void> {
  if (req.user === undefined) throw new UnauthorizedError()
  const params = getValidated(req).params as AddressIdParam
  await service.deleteAddress(req.user.id, params.id)
  sendNoContent(res)
}

export async function setDefault(req: Request, res: Response): Promise<void> {
  if (req.user === undefined) throw new UnauthorizedError()
  const params = getValidated(req).params as AddressIdParam
  const address = await service.setDefaultAddress(req.user.id, params.id)
  sendData(res, { address })
}
