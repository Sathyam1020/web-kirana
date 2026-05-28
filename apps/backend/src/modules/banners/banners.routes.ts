import { Router } from "express"
import { requireOwnStore } from "../../middleware/require-own-store.js"
import { validate } from "../../middleware/validate.js"
import * as controller from "./banners.controller.js"
import {
  bannerIdParamSchema,
  createBannerBodySchema,
  setActiveBannerBodySchema,
} from "./banners.schemas.js"

/**
 * Owner banner management. Mounted under /v1/stores/me/banners — the parent
 * storesRouter already applies requireAuth + requireRole(OWNER); this router
 * adds requireOwnStore so every handler has req.ownStore.
 *
 * PATCH /active is declared before /:id (different methods anyway, but it
 * keeps intent clear): set the active banner, or pass bannerId=null to hide.
 */
export const bannersOwnerRouter: Router = Router()
bannersOwnerRouter.use(requireOwnStore)

bannersOwnerRouter.get("/", controller.list)
bannersOwnerRouter.post(
  "/",
  validate({ body: createBannerBodySchema }),
  controller.create,
)
bannersOwnerRouter.patch(
  "/active",
  validate({ body: setActiveBannerBodySchema }),
  controller.setActive,
)
bannersOwnerRouter.delete(
  "/:id",
  validate({ params: bannerIdParamSchema }),
  controller.remove,
)
