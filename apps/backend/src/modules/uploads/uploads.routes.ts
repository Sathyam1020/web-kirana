import { Router } from "express"
import { Role } from "../../generated/prisma/enums.js"
import { requireAuth, requireRole } from "../../middleware/auth.js"
import { validate } from "../../middleware/validate.js"
import * as controller from "./uploads.controller.js"
import { adminSignatureBodySchema, ownerSignatureBodySchema } from "./uploads.schemas.js"

/**
 * Owner upload signatures. Mounted at /v1/uploads. The folder is derived from
 * the authenticated owner's user id (server-side → no IDOR), NOT the store id
 * — so a store image can be uploaded DURING onboarding, before the store row
 * exists. A store is 1:1 with its owner, so the per-owner namespace is stable.
 */
export const uploadsRouter: Router = Router()
uploadsRouter.use(requireAuth, requireRole(Role.OWNER))
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
