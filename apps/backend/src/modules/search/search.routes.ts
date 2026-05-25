import { Router } from "express"
import { NotFoundError } from "../../lib/errors.js"
import { validate } from "../../middleware/validate.js"
import * as controller from "./search.controller.js"
import { searchProductsQuerySchema } from "./search.schemas.js"

/**
 * Public search router. Read-only — defensive catch-all keeps it that way
 * if anyone tries to attach a writer in a future PR (same pattern as the
 * categoriesPublicRouter).
 */
export const searchRouter: Router = Router()

searchRouter.get(
  "/products",
  validate({ query: searchProductsQuerySchema }),
  controller.publicSearch,
)

searchRouter.use((_req, _res, next) => {
  next(new NotFoundError())
})
