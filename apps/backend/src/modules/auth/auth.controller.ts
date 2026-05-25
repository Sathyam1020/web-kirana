import type { CookieOptions, Request, Response } from "express"
import { env } from "../../config/env.js"
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  csrfMatches,
  generateCsrfToken,
} from "../../lib/csrf.js"
import { ForbiddenError, UnauthorizedError } from "../../lib/errors.js"
import { sendData, sendNoContent } from "../../lib/response.js"
import * as authService from "./auth.service.js"
import type { AuthTokens, AuthClientView } from "./auth.service.js"
import type { LoginBody, SignupBody } from "./auth.schemas.js"

const REFRESH_COOKIE_NAME = "kirana_rt"
const REFRESH_COOKIE_PATH = "/v1/auth"

function refreshCookieOptions(expiresAt: Date): CookieOptions {
  // SameSite=None requires Secure; only set None in production where the API
  // is HTTPS and the customer / owner PWAs are on different origins.
  const inProd = env.NODE_ENV === "production"
  const opts: CookieOptions = {
    httpOnly: true,
    secure: inProd,
    sameSite: inProd ? "none" : "lax",
    path: REFRESH_COOKIE_PATH,
    expires: expiresAt,
  }
  if (env.AUTH_COOKIE_DOMAIN !== undefined) {
    opts.domain = env.AUTH_COOKIE_DOMAIN
  }
  return opts
}

function csrfCookieOptions(expiresAt: Date): CookieOptions {
  // Same scope as the refresh cookie, but readable by client JS so the client
  // can echo it in the X-Csrf-Token header. This is intentional — the cookie
  // and the header value originate from the same browser context; an attacker
  // on a different origin can't read either.
  const inProd = env.NODE_ENV === "production"
  const opts: CookieOptions = {
    httpOnly: false,
    secure: inProd,
    sameSite: inProd ? "none" : "lax",
    path: REFRESH_COOKIE_PATH,
    expires: expiresAt,
  }
  if (env.AUTH_COOKIE_DOMAIN !== undefined) {
    opts.domain = env.AUTH_COOKIE_DOMAIN
  }
  return opts
}

interface SetCookiesResult {
  csrfToken: string
}

function setAuthCookies(res: Response, tokens: AuthTokens): SetCookiesResult {
  res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, refreshCookieOptions(tokens.refreshTokenExpiresAt))
  const csrfToken = generateCsrfToken()
  res.cookie(CSRF_COOKIE_NAME, csrfToken, csrfCookieOptions(tokens.refreshTokenExpiresAt))
  return { csrfToken }
}

function clearAuthCookies(res: Response): void {
  const sharedOpts = { path: REFRESH_COOKIE_PATH, domain: env.AUTH_COOKIE_DOMAIN }
  res.clearCookie(REFRESH_COOKIE_NAME, sharedOpts)
  res.clearCookie(CSRF_COOKIE_NAME, sharedOpts)
}

function requireCsrfMatch(req: Request): void {
  const header = req.get(CSRF_HEADER_NAME)
  const cookie = req.cookies?.[CSRF_COOKIE_NAME] as string | undefined
  if (!csrfMatches(header, cookie)) {
    throw new ForbiddenError("CSRF token missing or invalid")
  }
}

function reqContext(req: Request): { userAgent?: string; ip?: string } {
  const ua = req.get("user-agent")
  return {
    userAgent: ua === undefined ? undefined : ua.slice(0, 256),
    ip: req.ip,
  }
}

interface AuthResponseBody {
  user: AuthClientView
  accessToken: string
  expiresInSeconds: number
  csrfToken: string
}

function authResponse(
  user: AuthClientView,
  tokens: AuthTokens,
  csrfToken: string,
): AuthResponseBody {
  return {
    user,
    accessToken: tokens.accessToken,
    expiresInSeconds: env.JWT_ACCESS_TTL_SECONDS,
    csrfToken,
  }
}

export async function signup(req: Request, res: Response): Promise<void> {
  const body = req.body as SignupBody
  const result = await authService.signup(body, reqContext(req))

  if (result.tokens === null) {
    // Owner signup — pending approval. Don't set a cookie, don't issue tokens.
    sendData(res, { user: result.user, pendingApproval: true }, 201)
    return
  }

  const { csrfToken } = setAuthCookies(res, result.tokens)
  sendData(res, authResponse(result.user, result.tokens, csrfToken), 201)
}

export async function login(req: Request, res: Response): Promise<void> {
  const body = req.body as LoginBody
  const result = await authService.login(body, reqContext(req))
  const { csrfToken } = setAuthCookies(res, result.tokens)
  sendData(res, authResponse(result.user, result.tokens, csrfToken))
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const cookie = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined
  if (typeof cookie !== "string" || cookie.length === 0) {
    throw new UnauthorizedError("Refresh token is missing")
  }
  requireCsrfMatch(req)
  const result = await authService.refresh(cookie, reqContext(req))
  const { csrfToken } = setAuthCookies(res, result.tokens)
  sendData(res, authResponse(result.user, result.tokens, csrfToken))
}

export async function logout(req: Request, res: Response): Promise<void> {
  const cookie = (req.cookies?.[REFRESH_COOKIE_NAME] ?? null) as string | null
  if (cookie !== null) {
    // Logout still needs CSRF protection so an attacker can't force-revoke a
    // victim's session family from a cross-origin forge. If there's no
    // refresh cookie at all (already logged out client), skip the gate.
    requireCsrfMatch(req)
  }
  await authService.logout(cookie)
  clearAuthCookies(res)
  sendNoContent(res)
}

export async function me(req: Request, res: Response): Promise<void> {
  if (req.user === undefined) throw new UnauthorizedError()
  const user = await authService.me(req.user.id)
  sendData(res, { user })
}
