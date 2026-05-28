import { Router } from "express"
import { Role } from "../../generated/prisma/enums.js"
import { requireAuth, requireRole } from "../../middleware/auth.js"
import { requireOwnStore } from "../../middleware/require-own-store.js"
import { validate } from "../../middleware/validate.js"
import * as controller from "./uploads.controller.js"
import { adminSignatureBodySchema, ownerSignatureBodySchema } from "./uploads.schemas.js"

/**
 * Owner upload signatures. Mounted at /v1/uploads. requireOwnStore guarantees
 * the folder is scoped to the caller's own store (no IDOR via request body).
 */
export const uploadsRouter: Router = Router()
uploadsRouter.use(requireAuth, requireRole(Role.OWNER), requireOwnStore)
uploadsRouter.post(
  "/signature",
  validate({ body: ownerSignatureBodySchema }),
  controller.ownerSignature,
)

/**
 * Admin upload signatures (category / department icons). Mounted under the
 * adminRouter, which already imposes requireAuth + requireRole(ADMIN).
 */
export const uploadsAdminRouter: Router = Router()
uploadsAdminRouter.post(
  "/signature",
  validate({ body: adminSignatureBodySchema }),
  controller.adminSignature,
)
