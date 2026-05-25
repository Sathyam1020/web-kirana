import type { Response } from "express"
import type { ErrorCode } from "@workspace/shared/error-codes"

/**
 * Canonical response envelopes. Every successful API response is `{ data }`;
 * every error is `{ error: { code, message, details? } }`. The central error
 * handler in middleware/error-handler.ts owns the error path.
 */

export interface SuccessEnvelope<T> {
  data: T
}

export interface ErrorEnvelope {
  error: {
    code: ErrorCode | string
    message: string
    details?: unknown
  }
}

export function sendData<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json({ data } satisfies SuccessEnvelope<T>)
}

export function sendCreated<T>(res: Response, data: T): Response {
  return sendData(res, data, 201)
}

export function sendNoContent(res: Response): Response {
  return res.status(204).end()
}
