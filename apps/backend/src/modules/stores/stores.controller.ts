import type { Request, Response } from "express"
import { UnauthorizedError } from "../../lib/errors.js"
import { sendCreated, sendData } from "../../lib/response.js"
import * as service from "./stores.service.js"
import type {
  CreateStoreBody,
  OpenToggleBody,
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
