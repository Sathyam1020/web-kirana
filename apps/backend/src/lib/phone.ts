/**
 * Phone normalization for the kirana marketplace.
 *
 * The build prompt's directive: accept every format the customer might type,
 * but ensure the same number resolves to the same DB row.
 *
 * Strategy: strip everything that isn't a digit or a leading `+`. We do not
 * impose a country code or a min/max length beyond a sane sanity check, so
 * "+91 98765 43210", "+91-98765-43210", and "+919876543210" all map to
 * `+919876543210` and "9876543210" stays as "9876543210" (the user just
 * needs to be consistent on whether they include a country code).
 */

const MIN_DIGITS = 6
const MAX_DIGITS = 18

export function normalizePhone(input: string): string {
  if (typeof input !== "string") {
    throw new TypeError("normalizePhone: expected string")
  }
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    throw new Error("Phone number is required")
  }

  // Keep a single leading + (if present) and digits only.
  const hasPlus = trimmed.startsWith("+")
  const digits = trimmed.replace(/\D/g, "")

  if (digits.length < MIN_DIGITS) {
    throw new Error(`Phone number must have at least ${MIN_DIGITS} digits`)
  }
  if (digits.length > MAX_DIGITS) {
    throw new Error(`Phone number cannot have more than ${MAX_DIGITS} digits`)
  }

  return hasPlus ? `+${digits}` : digits
}

/** Lightweight predicate for Zod's `.refine()` — never throws. */
export function isLooksLikePhone(input: string): boolean {
  try {
    normalizePhone(input)
    return true
  } catch {
    return false
  }
}
