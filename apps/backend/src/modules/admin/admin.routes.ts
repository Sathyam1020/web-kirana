import { Router } from "express"
import { Role } from "../../generated/prisma/enums.js"
import { requireAuth, requireRole } from "../../middleware/auth.js"
import { validate } from "../../middleware/validate.js"
import { categoriesAdminRouter } from "../categories/categories.routes.js"
import { couponsAdminRouter } from "../coupons/coupons.routes.js"
import { departmentsAdminRouter } from "../departments/departments.routes.js"
import { uploadsAdminRouter } from "../uploads/uploads.routes.js"
import * as controller from "./admin.controller.js"
import {
  productIdParamSchema,
  promoteProductBodySchema,
  userIdParamSchema,
} from "./admin.schemas.js"

export const adminRouter: Router = Router()

// Every admin route is auth + role-gated. requireRole is layered AFTER
// requireAuth (the global router below uses the same order).
adminRouter.use(requireAuth, requireRole(Role.ADMIN))

adminRouter.get("/users/pending-owners", controller.listPendingOwners)

adminRouter.post(
  "/users/:id/approve",
  validate({ params: userIdParamSchema }),
  controller.approveOwner,
)

adminRouter.post(
  "/users/:id/reject",
  validate({ params: userIdParamSchema }),
  controller.rejectOwner,
)

// Department admin CRUD (Phase 6.6 — L1 taxonomy)
adminRouter.use("/departments", departmentsAdminRouter)

// Category admin endpoints (categoriesAdminRouter already imposes
// requireAuth + requireRole(ADMIN), so the double-gate is harmless and the
// router is reusable if we ever mount it differently).
adminRouter.use("/categories", categoriesAdminRouter)

// Promotion endpoints. Admin can boost any product marketplace-wide.
adminRouter.post(
  "/products/:id/promote",
  validate({ params: productIdParamSchema, body: promoteProductBodySchema }),
  controller.promoteProduct,
)
adminRouter.delete(
  "/products/:id/promote",
  validate({ params: productIdParamSchema }),
  controller.unpromoteProduct,
)

// Coupon (GLOBAL) admin CRUD
adminRouter.use("/coupons", couponsAdminRouter)

// Cloudinary signed-upload signatures for category / department icons
// (Phase 6.7). Already auth + ADMIN-gated by adminRouter above.
adminRouter.use("/uploads", uploadsAdminRouter)
