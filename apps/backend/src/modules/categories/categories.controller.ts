import type { Request, Response } from "express"
import { UnauthorizedError } from "../../lib/errors.js"
import { sendCreated, sendData } from "../../lib/response.js"
import { getValidated } from "../../lib/validated.js"
import * as service from "./categories.service.js"
import type {
  CategoryIdParam,
  CreateCategoryBody,
  ListCategoriesQuery,
  UpdateCategoryBody,
} from "./categories.schemas.js"

// Public ---------------------------------------------------------------

export async function list(req: Request, res: Response): Promise<void> {
  const query = (getValidated(req).query ?? {}) as ListCategoriesQuery
  const categories = await service.listCategories(query)
  sendData(res, { categories })
}

// Admin ----------------------------------------------------------------

export async function adminCreate(req: Request, res: Response): Promise<void> {
  if (req.user === undefined) throw new UnauthorizedError()
  const body = req.body as CreateCategoryBody
  const category = await service.createCategory(body, req.user.id)
  sendCreated(res, { category })
}

export async function adminUpdate(req: Request, res: Response): Promise<void> {
  if (req.user === undefined) throw new UnauthorizedError()
  const { id } = getValidated(req).params as CategoryIdParam
  const body = req.body as UpdateCategoryBody
  const category = await service.updateCategory(id, body, req.user.id)
  sendData(res, { category })
}
