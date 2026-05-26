import { Router } from "express"
import { Role } from "../../generated/prisma/enums.js"
import { requireAuth, requireRole } from "../../middleware/auth.js"
import { validate } from "../../middleware/validate.js"
import * as controller from "./addresses.controller.js"
import {
  addressIdParamSchema,
  createAddressBodySchema,
  updateAddressBodySchema,
} from "./addresses.schemas.js"

/**
 * Phase 6 — Customer address book. Mounted at /v1/addresses.
 *
 * Self-gated: every endpoint requires an authenticated CUSTOMER. Owners
 * and admins land here as 403 (their address book is a customer concept).
 *
 * All CRUD scopes via `WHERE id AND customerId` so callers can never read
 * or mutate addresses they don't own — 404 on miss (not 403) to keep ids
 * opaque.
 */
export const addressesRouter: Router = Router()

addressesRouter.use(requireAuth, requireRole(Role.CUSTOMER))

addressesRouter.post(
  "/",
  validate({ body: createAddressBodySchema }),
  controller.create,
)
addressesRouter.get("/", controller.list)
addressesRouter.get(
  "/:id",
  validate({ params: addressIdParamSchema }),
  controller.get,
)
addressesRouter.patch(
  "/:id",
  validate({ params: addressIdParamSchema, body: updateAddressBodySchema }),
  controller.update,
)
addressesRouter.delete(
  "/:id",
  validate({ params: addressIdParamSchema }),
  controller.remove,
)
// Lifecycle endpoint — atomic clear-then-set inside a transaction so we
// never leave the customer with two defaults (the partial unique index
// would 409 anyway, but the explicit endpoint owns the semantics).
addressesRouter.post(
  "/:id/default",
  validate({ params: addressIdParamSchema }),
  controller.setDefault,
)
