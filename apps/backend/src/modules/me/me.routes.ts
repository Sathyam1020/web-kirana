import { Router } from "express"
import { Role } from "../../generated/prisma/enums.js"
import { requireAuth, requireRole } from "../../middleware/auth.js"
import * as controller from "./me.controller.js"

/**
 * Customer-self surface. Mounted at /v1/me. Today only exposes /stats for
 * the account hero — profile + addresses live on their own routes already.
 */
export const meRouter: Router = Router()
meRouter.use(requireAuth, requireRole(Role.CUSTOMER))

meRouter.get("/stats", controller.stats)
