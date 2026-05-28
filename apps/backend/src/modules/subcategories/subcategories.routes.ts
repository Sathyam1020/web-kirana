import { Router } from "express"
import { requireOwnStore } from "../../middleware/require-own-store.js"
import { validate } from "../../middleware/validate.js"
import * as controller from "./subcategories.controller.js"
import {
  createSubcategoryBodySchema,
  listSubcategoriesQuerySchema,
  setSubcategoryAvailabilityBodySchema,
  subcategoryIdParamSchema,
  updateSubcategoryBodySchema,
} from "./subcategories.schemas.js"

/**
 * Mounted under /v1/stores/me/subcategories by storesRouter. The parent
 * supplies requireAuth + requireRole(OWNER); this router adds
 * requireOwnStore so every handler can trust req.ownStore.
 *
 * Endpoints:
 *   POST   /                         — create under an admin Category
 *   GET    /        ?categoryId=     — list this store's subs (cascading picker on FE)
 *   PATCH  /:id                      — rename + reorder
 *   DELETE /:id                      — empty-only (409 if products still attached)
 *   PATCH  /:id/availability         — bulk kill-switch
 */
export const subcategoriesOwnerRouter: Router = Router()
subcategoriesOwnerRouter.use(requireOwnStore)

subcategoriesOwnerRouter.post(
  "/",
  validate({ body: createSubcategoryBodySchema }),
  controller.ownerCreate,
)
subcategoriesOwnerRouter.get(
  "/",
  validate({ query: listSubcategoriesQuerySchema }),
  controller.ownerList,
)
subcategoriesOwnerRouter.patch(
  "/:id",
  validate({ params: subcategoryIdParamSchema, body: updateSubcategoryBodySchema }),
  controller.ownerUpdate,
)
subcategoriesOwnerRouter.delete(
  "/:id",
  validate({ params: subcategoryIdParamSchema }),
  controller.ownerDelete,
)
subcategoriesOwnerRouter.patch(
  "/:id/availability",
  validate({
    params: subcategoryIdParamSchema,
    body: setSubcategoryAvailabilityBodySchema,
  }),
  controller.ownerSetAvailability,
)
