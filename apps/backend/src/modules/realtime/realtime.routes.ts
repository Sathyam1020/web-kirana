import { Router } from "express"
import { requireAuth } from "../../middleware/auth.js"
import { realtimeTicketLimiter } from "../../middleware/rate-limit.js"
import * as controller from "./realtime.controller.js"

/**
 * Phase 9 — Socket.IO handshake tickets. Mounted at /v1/realtime.
 *
 * The socket itself connects directly to the API origin; this cookie-auth
 * endpoint (reached same-origin via the Next rewrite, so the session cookie
 * works) is the only HTTP surface — it hands back a short-lived ticket the
 * handshake then presents. See src/realtime/tickets.ts for the rationale.
 */
export const realtimeRouter: Router = Router()

realtimeRouter.post("/ticket", requireAuth, realtimeTicketLimiter, controller.createTicket)
