import type { NextFunction, Request, Response } from "express"
import { rateLimit } from "express-rate-limit"
import { ErrorCode } from "@workspace/shared/error-codes"
import { env } from "../config/env.js"
import type { ErrorEnvelope } from "../lib/response.js"

const noopLimiter = (_req: Request, _res: Response, next: NextFunction): void => next()

const isTest = env.NODE_ENV === "test"

/**
 * Global per-IP limiter wired into the Express pipeline. Tight per-route
 * limiters (auth, orders) are added in Phase 3 / Phase 7 alongside the
 * routes they protect — keep this one liberal so legit clients aren't
 * surprised.
 *
 * In NODE_ENV=test the limiter is a noop because test suites burst
 * thousands of requests from the same IP and would otherwise lock
 * themselves out.
 */
export const globalRateLimiter = isTest
  ? noopLimiter
  : rateLimit({
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
