import { Router } from "express"
import { Role } from "../../generated/prisma/enums.js"
import { NotFoundError } from "../../lib/errors.js"
import { requireAuth, requireRole } from "../../middleware/auth.js"
import { validate } from "../../middleware/validate.js"
import * as controller from "./departments.controller.js"
import {
  createDepartmentBodySchema,
  departmentIdParamSchema,
  listDepartmentsQuerySchema,
  updateDepartmentBodySchema,
} from "./departments.schemas.js"

/**
 * Public department list — used by customer/owner clients to render the
 * Blinkit-style department grid (with nested categories when `?nested=true`).
 */
export const departmentsPublicRouter: Router = Router()

departmentsPublicRouter.get(
  "/",
  validate({ query: listDepartmentsQuerySchema }),
  controller.list,
)
departmentsPublicRouter.use((_req, _res, next) => {
  next(new NotFoundError())
})

/**
 * Admin-only CRUD. Mounted under /v1/admin/departments. No DELETE in
 * Phase 6.6: every Category FKs Restrict to Department, so destroying a
 * dept with active categories would fail anyway — explicit DELETE can
 * land in a future moderation phase.
 */
export const departmentsAdminRouter: Router = Router()
departmentsAdminRouter.use(requireAuth, requireRole(Role.ADMIN))

departmentsAdminRouter.post(
  "/",
  validate({ body: createDepartmentBodySchema }),
  controller.adminCreate,
)
departmentsAdminRouter.patch(
  "/:id",
  validate({ params: departmentIdParamSchema, body: updateDepartmentBodySchema }),
  controller.adminUpdate,
)
