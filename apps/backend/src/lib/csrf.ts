import { randomBytes, timingSafeEqual } from "node:crypto"

/**
 * Double-submit CSRF token.
 *
 * On every refresh-cookie issuance we also mint a `kirana_csrf` cookie that is
 * NOT httpOnly. The client reads it from the cookie jar and echoes the value
 * in an `X-Csrf-Token` header on `/v1/auth/refresh` and `/v1/auth/logout`.
 * The server compares header to cookie with a constant-time eq.
 *
 * Why this works: the attack model is "browser holds httpOnly refresh cookie
 * after the user authenticated on an allowlisted origin; attacker who can
 * trigger a cross-site POST tries to mint themselves a new token". With
 * SameSite=None the refresh cookie rides on cross-site POSTs, but cross-site
 * JavaScript cannot read the `kirana_csrf` cookie (it's on a different origin)
 * so it can't put the right value in the header.
 *
 * Note: this protects against CSRF, not against XSS on the API's own
 * domain. An attacker who already runs JS on an allowlisted origin can read
 * the CSRF cookie. That's a separate (and harder) attack to defend against;
 * it's why the access token is short-lived and the refresh path is the only
 * one carrying long-lived state.
 */

const TOKEN_BYTES = 32

export const CSRF_COOKIE_NAME = "kirana_csrf"
export const CSRF_HEADER_NAME = "x-csrf-token"

export function generateCsrfToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url")
}

export function csrfMatches(header: string | undefined, cookie: string | undefined): boolean {
  if (typeof header !== "string" || typeof cookie !== "string") return false
  if (header.length === 0 || cookie.length === 0) return false
  if (header.length !== cookie.length) return false
  const headerBuf = Buffer.from(header)
  const cookieBuf = Buffer.from(cookie)
  // Defensive: timingSafeEqual throws on length mismatch; we already checked.
  return timingSafeEqual(headerBuf, cookieBuf)
}
