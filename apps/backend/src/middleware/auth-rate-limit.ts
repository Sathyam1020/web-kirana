import type { NextFunction, Request, Response } from "express"
import { rateLimit } from "express-rate-limit"
import { ErrorCode } from "@workspace/shared/error-codes"
import { env } from "../config/env.js"
import type { ErrorEnvelope } from "../lib/response.js"

const envelope = (res: Response, message: string): void => {
  res.status(429).json({
    error: { code: ErrorCode.RATE_LIMITED, message },
  } satisfies ErrorEnvelope)
}

const noop = (_req: Request, _res: Response, next: NextFunction): void => next()
const isTest = env.NODE_ENV === "test"

/**
 * Aggressive limits on credential-touching paths to slow brute-force attempts
 * without locking out legit retries on bad network days. Replaced by a noop
 * in NODE_ENV=test (same-IP test bursts would otherwise lock the suite out).
 */
export const loginLimiter = isTest
  ? noop
  : rateLimit({
      windowMs: 60_000,
      limit: 10,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_req: Request, res: Response) =>
        envelope(res, "Too many login attempts. Try again in a minute."),
    })

export const signupLimiter = isTest
  ? noop
  : rateLimit({
      windowMs: 60 * 60_000,
      limit: 10,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_req: Request, res: Response) =>
        envelope(res, "Too many signups from this IP. Try again later."),
    })

export const refreshLimiter = isTest
  ? noop
  : rateLimit({
      windowMs: 60_000,
      limit: 30,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_req: Request, res: Response) =>
        envelope(res, "Too many refresh attempts."),
    })
