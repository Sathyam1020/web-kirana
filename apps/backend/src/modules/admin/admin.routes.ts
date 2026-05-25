import { Router } from "express"
import { Role } from "../../generated/prisma/enums.js"
import { requireAuth, requireRole } from "../../middleware/auth.js"
import { validate } from "../../middleware/validate.js"
import * as controller from "./admin.controller.js"
import { userIdParamSchema } from "./admin.schemas.js"

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
