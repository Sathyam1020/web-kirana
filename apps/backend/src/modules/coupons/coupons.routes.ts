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
 * Customer preview. Mounted under /v1/coupons. Requires CUSTOMER auth so
 * per-user limits are enforceable. Defensive catch-all keeps the public
 * router read-only-ish (only POST /preview is allowed).
 */
export const couponsPublicRouter: Router = Router()

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
