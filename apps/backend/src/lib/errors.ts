import { ErrorCode } from "@workspace/shared/error-codes"

/**
 * Base class for every expected error in the system. Anything thrown that's
 * not an AppError is treated as a 500 INTERNAL by the central error handler.
 *
 * `details` is rendered as-is in the response envelope, so never put PII or
 * secrets in it.
 */
export class AppError extends Error {
  public readonly statusCode: number
  public readonly code: ErrorCode
  public readonly details?: unknown

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    details?: unknown,
  ) {
    super(message)
    this.name = new.target.name
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

// --- Generic ------------------------------------------------------------

export class ValidationError extends AppError {
  constructor(message = "Validation failed", details?: unknown) {
    super(400, ErrorCode.VALIDATION_ERROR, message, details)
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(401, ErrorCode.UNAUTHORIZED, message)
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this resource") {
    super(403, ErrorCode.FORBIDDEN, message)
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(404, ErrorCode.NOT_FOUND, message)
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict", details?: unknown) {
    super(409, ErrorCode.CONFLICT, message, details)
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests") {
    super(429, ErrorCode.RATE_LIMITED, message)
  }
}

// --- Domain (filled out as later phases need them) ----------------------

export class StoreClosedError extends AppError {
  constructor(message = "Store is closed") {
    super(409, ErrorCode.STORE_CLOSED, message)
  }
}

/**
 * Phase 4: owner is authed + role-gated but hasn't created their store yet.
 * 404 + STORE_NOT_CREATED is the signal for the owner PWA to route to its
 * onboarding screen.
 */
export class StoreNotCreatedError extends AppError {
  constructor(message = "Create a store before performing this action") {
    super(404, ErrorCode.STORE_NOT_CREATED, message)
  }
}

export class OutOfServiceAreaError extends AppError {
  constructor(message = "Delivery location is outside the store's service area") {
    super(409, ErrorCode.OUT_OF_SERVICE_AREA, message)
  }
}

/**
 * Phase 7: stale price / unavailable product / store-closed at order placement.
 * `details` carries the corrected cart so the client can re-confirm.
 */
export class CartChangedError extends AppError {
  constructor(message = "Cart contents changed since you last reviewed", details?: unknown) {
    super(409, ErrorCode.CART_CHANGED, message, details)
  }
}

/**
 * Phase 8: optimistic-locked status UPDATE matched zero rows — the order has
 * moved on, this transition is no longer valid.
 */
export class InvalidTransitionError extends AppError {
  constructor(message = "Order has already moved to a different status") {
    super(409, ErrorCode.INVALID_TRANSITION, message)
  }
}
