import type { Request, Response } from "express"
import { rateLimit } from "express-rate-limit"
import { ErrorCode } from "@workspace/shared/error-codes"
import type { ErrorEnvelope } from "../lib/response.js"

/**
 * Global per-IP limiter wired into the Express pipeline. Tight per-route
 * limiters (auth, orders) are added in Phase 3 / Phase 7 alongside the
 * routes they protect — keep this one liberal so legit clients aren't
 * surprised.
 */
export const globalRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      error: {
        code: ErrorCode.RATE_LIMITED,
        message: "Too many requests — slow down and try again shortly",
      },
    } satisfies ErrorEnvelope)
  },
})
