import { fromNodeHeaders } from "better-auth/node"
import type { NextFunction, Request, RequestHandler, Response } from "express"
import { Role } from "../generated/prisma/enums.js"
import { auth } from "../lib/auth.js"
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js"

declare module "express-serve-static-core" {
  interface Request {
    /**
     * Set by requireAuth. Always reflects the better-auth session at request
     * time (the cookie cache absorbs the hot-path DB hit).
     */
    user?: {
      id: string
      role: Role
      isApproved: boolean
    }
    /**
     * The full session row from better-auth. Useful when a handler needs the
     * session id (e.g. to revoke), the IP, or the user-agent.
     */
    session?: {
      id: string
      userId: string
      expiresAt: Date
    }
  }
}

/**
 * Resolves the request's session via better-auth (cookie → DB lookup with a
 * 5-minute in-memory cookie cache per lib/auth.ts session config). Mirrors
 * the existing 401 / 403 contract:
 *   - no cookie / invalid session → 401 UNAUTHORIZED
 *   - session valid but user.isApproved=false → 403 FORBIDDEN
 *     (the pending-approval gate is also enforced in the session.create
 *     hook, but we re-check here so an approval-revocation mid-session
 *     takes effect on the next request.)
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    })
    if (session === null) {
      throw new UnauthorizedError()
    }

    // better-auth attaches additionalFields to session.user at runtime;
    // the type lacks them, so cast through unknown to the shape we know
    // is present from our user.additionalFields config.
    const u = session.user as unknown as {
      id: string
      role: Role
      isApproved: boolean
    }
    if (!u.isApproved) {
      throw new ForbiddenError("Account is pending admin approval")
    }

    req.user = { id: u.id, role: u.role, isApproved: u.isApproved }
    req.session = {
      id: session.session.id,
      userId: session.session.userId,
      expiresAt: session.session.expiresAt,
    }
    next()
  } catch (err) {
    next(err)
  }
}

/**
 * Gate a route by role. Always layer after requireAuth.
 *
 * Note: role gates are coarse. Real ownership checks (this customer's
 * address, this owner's store) belong in the service-layer query — see
 * ensureOwnership.
 */
export function requireRole(...allowed: Role[]): RequestHandler {
  if (allowed.length === 0) throw new Error("requireRole needs at least one role")
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.user === undefined) {
      next(new UnauthorizedError())
      return
    }
    if (!allowed.includes(req.user.role)) {
      next(new ForbiddenError())
      return
    }
    next()
  }
}

/**
 * Service-layer helper: assert that the row a request is acting on belongs
 * to the calling user. The query is responsible for scoping by user id;
 * this helper just throws when nothing came back.
 *
 *   const store = await prisma.store.findFirst({
 *     where: { id: storeId, ownerId: req.user!.id }
 *   })
 *   ensureOwnership(store, "Store")
 *   // store is now non-null
 */
export function ensureOwnership<T>(
  value: T | null,
  resourceName = "Resource",
): asserts value is T {
  if (value === null || value === undefined) {
    throw new ForbiddenError(`${resourceName} not found or not owned by caller`)
  }
}
