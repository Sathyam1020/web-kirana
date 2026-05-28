import type { Request, Response } from "express"
import { UnauthorizedError } from "../../lib/errors.js"
import { sendCreated, sendData } from "../../lib/response.js"
import { getValidated } from "../../lib/validated.js"
import * as service from "./departments.service.js"
import type {
  CreateDepartmentBody,
  DepartmentIdParam,
  ListDepartmentsQuery,
  UpdateDepartmentBody,
} from "./departments.schemas.js"

// Public ----------------------------------------------------------------

export async function list(req: Request, res: Response): Promise<void> {
  const query = getValidated(req).query as ListDepartmentsQuery
  const departments = await service.listDepartments({ nested: query.nested ?? false })
  sendData(res, { departments })
}

// Admin -----------------------------------------------------------------

export async function adminCreate(req: Request, res: Response): Promise<void> {
  if (req.user === undefined) throw new UnauthorizedError()
  const body = req.body as CreateDepartmentBody
  const department = await service.createDepartment(body, req.user.id)
  sendCreated(res, { department })
}

export async function adminUpdate(req: Request, res: Response): Promise<void> {
  if (req.user === undefined) throw new UnauthorizedError()
  const { id } = getValidated(req).params as DepartmentIdParam
  const body = req.body as UpdateDepartmentBody
  const department = await service.updateDepartment(id, body, req.user.id)
  sendData(res, { department })
}
