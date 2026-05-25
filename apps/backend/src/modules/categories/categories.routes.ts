import { Router } from "express"
import { Role } from "../../generated/prisma/enums.js"
import { NotFoundError } from "../../lib/errors.js"
import { requireAuth, requireRole } from "../../middleware/auth.js"
import { validate } from "../../middleware/validate.js"
import * as controller from "./categories.controller.js"
import {
  categoryIdParamSchema,
  createCategoryBodySchema,
  updateCategoryBodySchema,
} from "./categories.schemas.js"

/** Public list, used by both customer and owner clients. */
export const categoriesPublicRouter: Router = Router()
categoriesPublicRouter.get("/", controller.list)
// Defensive guard against accidental writers being attached to the public
// mount in a future PR. Anything that isn't GET / falls through to a 404
// so it stays read-only by construction.
categoriesPublicRouter.use((_req, _res, next) => {
  next(new NotFoundError())
})

/**
 * Admin-only CRUD. Mounted under /v1/admin/categories. Requires admin auth.
 * No DELETE in Phase 4: the FK is Restrict so any category with products
 * fails to delete anyway — soft-delete pattern can land later if needed.
 */
export const categoriesAdminRouter: Router = Router()
categoriesAdminRouter.use(requireAuth, requireRole(Role.ADMIN))

categoriesAdminRouter.post(
  "/",
  validate({ body: createCategoryBodySchema }),
  controller.adminCreate,
)

categoriesAdminRouter.patch(
  "/:id",
  validate({ params: categoryIdParamSchema, body: updateCategoryBodySchema }),
  controller.adminUpdate,
)
