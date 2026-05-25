import { Router } from "express"
import { Role } from "../../generated/prisma/enums.js"
import { requireAuth, requireRole } from "../../middleware/auth.js"
import { validate } from "../../middleware/validate.js"
import { productsRouter } from "../products/products.routes.js"
import * as controller from "./stores.controller.js"
import {
  createStoreBodySchema,
  openToggleBodySchema,
  updateStoreBodySchema,
} from "./stores.schemas.js"

/**
 * Owner-side store routes. All endpoints under /v1/stores/me require an
 * approved OWNER. requireAuth handles approval (rejects with 403 if not
 * approved). Public discovery routes live in Phase 5 (mounted separately).
 */
export const storesRouter: Router = Router()

storesRouter.use(requireAuth, requireRole(Role.OWNER))

storesRouter.post(
  "/me",
  validate({ body: createStoreBodySchema }),
  controller.createOwnStore,
)
storesRouter.get("/me", controller.getOwnStore)
storesRouter.patch(
  "/me",
  validate({ body: updateStoreBodySchema }),
  controller.updateOwnStore,
)
storesRouter.patch(
  "/me/open",
  validate({ body: openToggleBodySchema }),
  controller.toggleOpen,
)

// Products live under the same /me/ scope so they share auth + the
// requireOwnStore middleware. productsRouter applies requireOwnStore
// internally.
storesRouter.use("/me/products", productsRouter)
