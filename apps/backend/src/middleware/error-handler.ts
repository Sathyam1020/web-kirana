import type { ErrorRequestHandler, Request, Response } from "express"
import { ZodError } from "zod"
import { ErrorCode } from "@workspace/shared/error-codes"
import { env } from "../config/env.js"
import { AppError, ValidationError } from "../lib/errors.js"
import type { ErrorEnvelope } from "../lib/response.js"

/**
 * 404 fallback — mounted after all routes so unknown paths get a typed envelope
 * instead of Express's default HTML.
 */
export const notFoundHandler = (_req: Request, res: Response): void => {
  res.status(404).json({
    error: { code: ErrorCode.NOT_FOUND, message: "Route not found" },
  } satisfies ErrorEnvelope)
}

/**
 * Central error handler. Order of mounting (in app.ts) matters: this MUST be
 * the last middleware. Anything thrown or `next(err)`'d ends up here.
 *
 *  - AppError → its statusCode + code + message + details
 *  - ZodError → wrapped as ValidationError (some routes may throw zod directly)
 *  - everything else → 500 INTERNAL, full err logged, message redacted in prod
 */
export const errorHandler: ErrorRequestHandler = (
  err,
  req,
  res,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- next is required by Express signature
  next,
) => {
  // Express's logger attaches `req.log`. Fall back to console only in tests.
  const log = req.log ?? console

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      log.error({ err }, "AppError 5xx")
    } else {
      log.warn({ code: err.code, message: err.message }, "AppError")
    }
    const body: ErrorEnvelope = {
      error: { code: err.code, message: err.message },
    }
    if (err.details !== undefined) body.error.details = err.details
    res.status(err.statusCode).json(body)
    return
  }

  if (err instanceof ZodError) {
    const wrapped = new ValidationError("Validation failed", {
      issues: err.flatten(),
    })
    log.warn({ code: wrapped.code }, "ZodError surfaced from handler")
    res.status(wrapped.statusCode).json({
      error: { code: wrapped.code, message: wrapped.message, details: wrapped.details },
    } satisfies ErrorEnvelope)
    return
  }

  log.error({ err }, "Unhandled error")
  const message =
    env.NODE_ENV === "production" ? "Internal server error" : (err as Error)?.message ?? "Internal server error"
  res.status(500).json({
    error: { code: ErrorCode.INTERNAL, message },
  } satisfies ErrorEnvelope)
}
