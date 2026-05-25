import cors, { type CorsOptions } from "cors"
import { env } from "../config/env.js"
import { ForbiddenError } from "../lib/errors.js"
import { logger } from "../lib/logger.js"

/**
 * Internal error type for CORS rejection. The cors library will call our
 * error handler with the message, which we then convert into a typed 403.
 */
class CorsRejectedError extends ForbiddenError {
  constructor(origin: string) {
    super(`Origin not allowed: ${origin}`)
  }
}

/**
 * CORS allowlist from env. Credentials are enabled because the refresh-token
 * cookie (Phase 3) is sameSite=Lax + httpOnly and the customer / owner PWAs
 * are on different origins from the API.
 *
 * Unmatched origins do NOT receive Access-Control-Allow-Origin and are
 * rejected by the browser; the API still answers 2xx — that's intentional so
 * server-to-server callers (e.g., the WhatsApp webhook) aren't blocked.
 */
const allowlist = new Set(env.CORS_ALLOWED_ORIGINS)

const options: CorsOptions = {
  origin: (origin, callback) => {
    // No-origin requests (curl, server-to-server, mobile) are allowed; CORS
    // only governs browser cross-origin XHR.
    if (origin === undefined || origin === null) return callback(null, true)
    if (allowlist.has(origin)) return callback(null, true)
    logger.warn({ origin }, "CORS: rejecting unknown origin")
    // Hard reject — the cors lib short-circuits the request, the handler
    // never runs, and the error envelope is shaped by our central handler.
    return callback(new CorsRejectedError(origin))
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Authorization",
    "Content-Type",
    "X-Request-Id",
    "Idempotency-Key",
  ],
  exposedHeaders: ["X-Request-Id"],
  maxAge: 600,
}

export const corsMiddleware = cors(options)
