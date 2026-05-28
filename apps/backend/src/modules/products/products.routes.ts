import { Router } from "express"
import { requireOwnStore } from "../../middleware/require-own-store.js"
import { validate } from "../../middleware/validate.js"
import * as controller from "./products.controller.js"
import {
  createProductBodySchema,
  featureProductBodySchema,
  listProductsQuerySchema,
  moveProductBodySchema,
  productIdParamSchema,
  updateProductBodySchema,
} from "./products.schemas.js"

/**
 * Mounted under /v1/stores/me/products by storesRouter. The parent router
 * supplies requireAuth + requireRole(OWNER); this one adds requireOwnStore
 * so every handler can trust req.ownStore.
 */
export const productsRouter: Router = Router()

productsRouter.use(requireOwnStore)

productsRouter.post(
  "/",
  validate({ body: createProductBodySchema }),
  controller.create,
)

productsRouter.get(
  "/",
  validate({ query: listProductsQuerySchema }),
  controller.list,
)

productsRouter.get(
  "/:id",
  validate({ params: productIdParamSchema }),
  controller.get,
)

productsRouter.patch(
  "/:id",
  validate({ params: productIdParamSchema, body: updateProductBodySchema }),
  controller.update,
)

productsRouter.delete(
  "/:id",
  validate({ params: productIdParamSchema }),
  controller.softDelete,
)

productsRouter.post(
  "/:id/restore",
  validate({ params: productIdParamSchema }),
  controller.restore,
)

// Featured (owner-only, scoped to caller's store)
productsRouter.post(
  "/:id/feature",
  validate({ params: productIdParamSchema, body: featureProductBodySchema }),
  controller.feature,
)
productsRouter.delete(
  "/:id/feature",
  validate({ params: productIdParamSchema }),
  controller.unfeature,
)

// Phase 6.6 — move a product to a different subcategory (within this store).
productsRouter.post(
  "/:id/move",
  validate({ params: productIdParamSchema, body: moveProductBodySchema }),
  controller.move,
)
