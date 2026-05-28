import { Router } from "express"
import { Role } from "../../generated/prisma/enums.js"
import { requireAuth, requireRole } from "../../middleware/auth.js"
import { requireOwnStore } from "../../middleware/require-own-store.js"
import { validate } from "../../middleware/validate.js"
import * as controller from "./orders.controller.js"
import {
  cancelOrderBodySchema,
  listOrdersQuerySchema,
  orderIdParamSchema,
  ownerListOrdersQuerySchema,
  placeOrderBodySchema,
  rejectOrderBodySchema,
} from "./orders.schemas.js"

/**
 * Customer orders. Mounted at /v1/orders. Placement requires an
 * Idempotency-Key header (enforced in the controller).
 */
export const ordersRouter: Router = Router()
ordersRouter.use(requireAuth, requireRole(Role.CUSTOMER))

ordersRouter.post(
  "/",
  validate({ body: placeOrderBodySchema }),
  controller.place,
)
ordersRouter.get("/", validate({ query: listOrdersQuerySchema }), controller.listMine)
ordersRouter.get("/:id", validate({ params: orderIdParamSchema }), controller.getMine)
// Phase 8 — customer can cancel only while the order is still PLACED.
ordersRouter.post(
  "/:id/cancel",
  validate({ params: orderIdParamSchema, body: cancelOrderBodySchema }),
  controller.cancel,
)

/**
 * Owner-side order inbox. Mounted under /v1/stores/me/orders — the parent
 * storesRouter already applies requireAuth + requireRole(OWNER); this adds
 * requireOwnStore. Read-only in Phase 7 (lifecycle transitions are Phase 8).
 */
export const ordersOwnerRouter: Router = Router()
ordersOwnerRouter.use(requireOwnStore)
ordersOwnerRouter.get(
  "/",
  validate({ query: ownerListOrdersQuerySchema }),
  controller.listStore,
)
ordersOwnerRouter.get(
  "/:id",
  validate({ params: orderIdParamSchema }),
  controller.getStore,
)

// Phase 8 — owner-driven lifecycle transitions.
ordersOwnerRouter.post(
  "/:id/accept",
  validate({ params: orderIdParamSchema }),
  controller.accept,
)
ordersOwnerRouter.post(
  "/:id/reject",
  validate({ params: orderIdParamSchema, body: rejectOrderBodySchema }),
  controller.reject,
)
ordersOwnerRouter.post(
  "/:id/out-for-delivery",
  validate({ params: orderIdParamSchema }),
  controller.outForDelivery,
)
ordersOwnerRouter.post(
  "/:id/deliver",
  validate({ params: orderIdParamSchema }),
  controller.deliver,
)
