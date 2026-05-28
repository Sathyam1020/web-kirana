import type { Request, Response } from "express"
import { UnauthorizedError } from "../../lib/errors.js"
import { sendCreated, sendData, sendNoContent } from "../../lib/response.js"
import { getValidated } from "../../lib/validated.js"
import * as service from "./subcategories.service.js"
import type {
  CreateSubcategoryBody,
  ListSubcategoriesQuery,
  PublicListSubcategoriesParam,
  SetSubcategoryAvailabilityBody,
  SubcategoryIdParam,
  UpdateSubcategoryBody,
} from "./subcategories.schemas.js"

function requireOwnStore(req: Request): { id: string; ownerId: string } {
  if (req.ownStore === undefined) {
    throw new UnauthorizedError("requireOwnStore middleware not mounted")
  }
  return req.ownStore
}

// --- Owner -------------------------------------------------------------

export async function ownerList(req: Request, res: Response): Promise<void> {
  const { id: storeId } = requireOwnStore(req)
  const query = (getValidated(req).query ?? {}) as ListSubcategoriesQuery
  const subcategories = await service.listOwnerSubcategories(storeId, query)
  sendData(res, { subcategories })
}

export async function ownerCreate(req: Request, res: Response): Promise<void> {
  const { id: storeId, ownerId } = requireOwnStore(req)
  const body = req.body as CreateSubcategoryBody
  const subcategory = await service.createOwnerSubcategory(storeId, ownerId, body)
  sendCreated(res, { subcategory })
}

export async function ownerUpdate(req: Request, res: Response): Promise<void> {
  const { id: storeId, ownerId } = requireOwnStore(req)
  const { id } = getValidated(req).params as SubcategoryIdParam
  const body = req.body as UpdateSubcategoryBody
  const subcategory = await service.updateOwnerSubcategory(storeId, ownerId, id, body)
  sendData(res, { subcategory })
}

export async function ownerDelete(req: Request, res: Response): Promise<void> {
  const { id: storeId, ownerId } = requireOwnStore(req)
  const { id } = getValidated(req).params as SubcategoryIdParam
  await service.deleteOwnerSubcategory(storeId, ownerId, id)
  sendNoContent(res)
}

export async function ownerSetAvailability(req: Request, res: Response): Promise<void> {
  const { id: storeId, ownerId } = requireOwnStore(req)
  const { id } = getValidated(req).params as SubcategoryIdParam
  const body = req.body as SetSubcategoryAvailabilityBody
  const subcategory = await service.setOwnerSubcategoryAvailability(
    storeId,
    ownerId,
    id,
    body.isAvailable,
  )
  sendData(res, { subcategory })
}

// --- Public ------------------------------------------------------------

/**
 * GET /v1/stores/:id/categories/:categoryId/subcategories — the left
 * rail of the customer category page.
 */
export async function publicListForStoreCategory(
  req: Request,
  res: Response,
): Promise<void> {
  const { id: storeId, categoryId } = getValidated(req)
    .params as PublicListSubcategoriesParam
  const subcategories = await service.listPublicSubcategoriesForStoreCategory(
    storeId,
    categoryId,
  )
  sendData(res, { subcategories })
}
