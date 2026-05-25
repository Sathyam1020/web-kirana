import type { Request } from "express"

/**
 * Reads `req.validated` and asserts it is present. Surfaces "validate()
 * wasn't mounted" misconfigurations as a clear 500-with-message instead of
 * a destructure TypeError on `req.validated?.params`.
 *
 * Use this in every controller that consumes parsed query / params (req.body
 * mutation makes the helper unnecessary for body-only handlers — but using
 * it everywhere is fine too).
 */
export function getValidated(req: Request): NonNullable<Request["validated"]> {
  if (req.validated === undefined) {
    throw new Error(
      "validate() middleware was not mounted before this handler — fix the router",
    )
  }
  return req.validated
}
