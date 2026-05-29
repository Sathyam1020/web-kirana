import { Router } from "express"
import { requireAuth } from "../../middleware/auth.js"
import { validate } from "../../middleware/validate.js"
import * as controller from "./push.controller.js"
import { subscribeBodySchema, unsubscribeBodySchema } from "./push.schemas.js"

/**
 * Phase 10 — Web Push subscriptions. Mounted at /v1/push. Any authenticated
 * user (customer or owner) registers their browser's push endpoint here; the
 * notification dispatcher fans order events out to these.
 */
export const pushRouter: Router = Router()

pushRouter.use(requireAuth)
pushRouter.post("/subscribe", validate({ body: subscribeBodySchema }), controller.subscribe)
pushRouter.delete("/subscribe", validate({ body: unsubscribeBodySchema }), controller.unsubscribe)
