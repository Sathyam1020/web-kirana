// Stable string codes used inside the response error envelope.
// Phase 2 wires AppError subclasses to these; consumers should pattern-match on the code, not the message.

export const ErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL: "INTERNAL",

  // Domain-specific (filled in by later phases).
  STORE_CLOSED: "STORE_CLOSED",
  OUT_OF_SERVICE_AREA: "OUT_OF_SERVICE_AREA",
  CART_CHANGED: "CART_CHANGED",
  INVALID_TRANSITION: "INVALID_TRANSITION",
  IDEMPOTENCY_REPLAY: "IDEMPOTENCY_REPLAY",
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]
