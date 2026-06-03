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

export class ServiceUnavailableError extends AppError {
  constructor(message = "Service temporarily unavailable") {
    super(503, ErrorCode.SERVICE_UNAVAILABLE, message)
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
 * Phase 6: per-customer address-book cap reached. Hard ceiling of 20 keeps
 * enumeration and rendering cost bounded for the customer PWA address book.
 */
export class MaxAddressesReachedError extends AppError {
  constructor(message = "You already have the maximum number of saved addresses") {
    super(409, ErrorCode.MAX_ADDRESSES_REACHED, message)
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

/**
 * IP-1: cart subtotal is below the store's configured minimum order amount.
 * `details` carries `{ requiredPaise, actualPaise }` so the client can render
 * "Add ₹X more to place this order" without recomputing from store state.
 * 400 (not 409) — this isn't a race or a conflict, it's a request that
 * doesn't satisfy the precondition.
 */
export class MinOrderNotMetError extends AppError {
  constructor(requiredPaise: number, actualPaise: number) {
    super(
      400,
      ErrorCode.MIN_ORDER_NOT_MET,
      "Cart subtotal is below the store's minimum order amount",
      { requiredPaise, actualPaise },
    )
  }
}

/**
 * IP-2 — create/update product with zero variants. Every product MUST own
 * at least one variant; the owner UI defaults to a "Default" placeholder
 * but the schema can't enforce ≥1 (Prisma doesn't model that). Service
 * raises this if the array is empty or absent.
 */
export class ProductMissingVariantsError extends AppError {
  constructor(message = "A product must have at least one variant") {
    super(400, ErrorCode.PRODUCT_MISSING_VARIANTS, message)
  }
}

/**
 * IP-2 — create/update product with 0 or 2+ `isDefault=true` variants.
 * Exactly one must be the default; the service falls back to "mark the
 * first one default" if zero are sent, so this fires for the 2+ case.
 */
export class MultipleDefaultVariantsError extends AppError {
  constructor(message = "Exactly one variant must be marked default") {
    super(409, ErrorCode.MULTIPLE_DEFAULT_VARIANTS, message)
  }
}

/**
 * IP-2 — cart item that carries neither `variantId` nor `productId`.
 * The transitional placement schema accepts either, but at least one is
 * required. Rejecting at the schema layer keeps the service simple.
 */
export class NoVariantSelectedError extends AppError {
  constructor(message = "Cart item is missing variantId (or legacy productId)") {
    super(400, ErrorCode.NO_VARIANT_SELECTED, message)
  }
}

/**
 * IP-2 — variant SKU clashes with another variant in the same store.
 * `details` carries the conflicting `sku` + the existing variant's id so
 * the owner UI can surface "already used by …".
 */
export class SkuConflictError extends AppError {
  constructor(sku: string, conflictingVariantId: string) {
    super(
      409,
      ErrorCode.SKU_CONFLICT,
      `SKU "${sku}" is already used by another variant in this store`,
      { sku, conflictingVariantId },
    )
  }
}
