import type { NextFunction, Request, RequestHandler, Response } from "express"
import { prisma } from "../db/prisma.js"
import { Role } from "../generated/prisma/enums.js"
import { ForbiddenError, UnauthorizedError } from "../lib/errors.js"
import { verifyAccessToken } from "../lib/jwt.js"

declare module "express-serve-static-core" {
  interface Request {
    /** Set by requireAuth. Always reflects the current DB row at request time. */
    user?: {
      id: string
      role: Role
      isApproved: boolean
    }
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization
  if (typeof header !== "string") return null
  const [scheme, value] = header.split(" ", 2)
  if (scheme !== "Bearer" || value === undefined || value.length === 0) return null
  return value
}

/**
 * Verifies the access token and re-reads the user from the DB. Re-reading is
 * the cost we pay for revocation-on-role-change and post-issue suspensions
 * — the role/approval claims in the JWT are not trusted for authorization
 * decisions.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = extractBearerToken(req)
    if (token === null) throw new UnauthorizedError()

    let claims: Awaited<ReturnType<typeof verifyAccessToken>>
    try {
      claims = await verifyAccessToken(token)
    } catch {
      throw new UnauthorizedError("Invalid or expired token")
    }

    const user = await prisma.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, role: true, isApproved: true },
    })
    if (user === null) throw new UnauthorizedError("Token subject no longer exists")
    if (!user.isApproved) {
      throw new ForbiddenError("Account is pending admin approval")
    }

    req.user = { id: user.id, role: user.role, isApproved: user.isApproved }
    next()
  } catch (err) {
    next(err)
  }
}

/**
 * Gate a route by role. Always layer after requireAuth.
 *
 * Note: role gates are coarse. Real ownership checks (this customer's address,
 * this owner's store) belong in the service-layer query — see ensureOwnership.
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
 * Service-layer helper: assert that the row a request is acting on belongs to
 * the calling user. The query is responsible for scoping by user id; this
 * helper just throws when nothing came back.
 *
 * Usage:
 *   const store = await prisma.store.findFirst({
 *     where: { id: storeId, ownerId: req.user!.id }
 *   })
 *   ensureOwnership(store, "Store")
 *   // store is now non-null
 */
export function ensureOwnership<T>(value: T | null, resourceName = "Resource"): asserts value is T {
  if (value === null || value === undefined) {
    throw new ForbiddenError(`${resourceName} not found or not owned by caller`)
  }
}
