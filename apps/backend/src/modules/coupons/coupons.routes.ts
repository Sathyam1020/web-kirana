import { Router } from "express"
import { Role } from "../../generated/prisma/enums.js"
import { NotFoundError } from "../../lib/errors.js"
import { requireAuth, requireRole } from "../../middleware/auth.js"
import { requireOwnStore } from "../../middleware/require-own-store.js"
import { validate } from "../../middleware/validate.js"
import * as controller from "./coupons.controller.js"
import {
  adminCreateCouponBodySchema,
  couponIdParamSchema,
  listActiveCouponsQuerySchema,
  listCouponsQuerySchema,
  ownerCreateCouponBodySchema,
  previewCouponBodySchema,
  updateCouponBodySchema,
} from "./coupons.schemas.js"

/**
 * Admin coupon CRUD. Mounted under /v1/admin/coupons. Self-gates with
 * requireAuth + requireRole(ADMIN) so it stays admin-only even if a future
 * PR mounts it differently.
 */
export const couponsAdminRouter: Router = Router()
couponsAdminRouter.use(requireAuth, requireRole(Role.ADMIN))

couponsAdminRouter.post(
  "/",
  validate({ body: adminCreateCouponBodySchema }),
  controller.adminCreate,
)
couponsAdminRouter.get(
  "/",
  validate({ query: listCouponsQuerySchema }),
  controller.adminList,
)
couponsAdminRouter.get(
  "/:id",
  validate({ params: couponIdParamSchema }),
  controller.adminGet,
)
couponsAdminRouter.patch(
  "/:id",
  validate({ params: couponIdParamSchema, body: updateCouponBodySchema }),
  controller.adminUpdate,
)
couponsAdminRouter.delete(
  "/:id",
  validate({ params: couponIdParamSchema }),
  controller.adminSoftDelete,
)

/**
 * Owner coupon CRUD. Mounted under /v1/stores/me/coupons. Requires the
 * caller to be an approved OWNER with an existing store (requireOwnStore).
 */
export const couponsOwnerRouter: Router = Router()
couponsOwnerRouter.use(requireAuth, requireRole(Role.OWNER), requireOwnStore)

couponsOwnerRouter.post(
  "/",
  validate({ body: ownerCreateCouponBodySchema }),
  controller.ownerCreate,
)
couponsOwnerRouter.get(
  "/",
  validate({ query: listCouponsQuerySchema }),
  controller.ownerList,
)
couponsOwnerRouter.get(
  "/:id",
  validate({ params: couponIdParamSchema }),
  controller.ownerGet,
)
couponsOwnerRouter.patch(
  "/:id",
  validate({ params: couponIdParamSchema, body: updateCouponBodySchema }),
  controller.ownerUpdate,
)
couponsOwnerRouter.delete(
  "/:id",
  validate({ params: couponIdParamSchema }),
  controller.ownerSoftDelete,
)

/**
 * Public-ish coupon endpoints. Mounted under /v1/coupons.
 *
 * - GET /active — anonymous; returns active GLOBAL + active STORE coupons
 *   for the home carousel.
 * - POST /preview — CUSTOMER auth; previews a code against a cart.
 *
 * Defensive catch-all keeps anything else 404 so the router can never be
 * accidentally widened by a later refactor.
 */
export const couponsPublicRouter: Router = Router()

couponsPublicRouter.get(
  "/active",
  validate({ query: listActiveCouponsQuerySchema }),
  controller.listActive,
)
couponsPublicRouter.post(
  "/preview",
  requireAuth,
  requireRole(Role.CUSTOMER),
  validate({ body: previewCouponBodySchema }),
  controller.preview,
)
couponsPublicRouter.use((_req, _res, next) => {
  next(new NotFoundError())
})
