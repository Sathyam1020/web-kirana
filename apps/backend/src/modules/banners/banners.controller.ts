import type { Request, Response } from "express"
import { UnauthorizedError } from "../../lib/errors.js"
import { sendCreated, sendData } from "../../lib/response.js"
import { getValidated } from "../../lib/validated.js"
import * as service from "./banners.service.js"
import type {
  BannerIdParam,
  CreateBannerBody,
  SetActiveBannerBody,
} from "./banners.schemas.js"

function ownStoreId(req: Request): string {
  if (req.ownStore === undefined) {
    throw new UnauthorizedError("requireOwnStore must run before banner handlers")
  }
  return req.ownStore.id
}

export async function list(req: Request, res: Response): Promise<void> {
  const banners = await service.listBanners(ownStoreId(req))
  sendData(res, { banners })
}

export async function create(req: Request, res: Response): Promise<void> {
  const body = req.body as CreateBannerBody
  const banner = await service.createBanner(ownStoreId(req), body)
  sendCreated(res, { banner })
}

export async function remove(req: Request, res: Response): Promise<void> {
  const { id } = getValidated(req).params as BannerIdParam
  await service.deleteBanner(ownStoreId(req), id)
  sendData(res, { ok: true })
}

export async function setActive(req: Request, res: Response): Promise<void> {
  const body = req.body as SetActiveBannerBody
  const banners = await service.setActiveBanner(ownStoreId(req), body.bannerId)
  sendData(res, { banners })
}
