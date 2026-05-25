import type { NextFunction, Request, Response } from "express"
import { prisma } from "../db/prisma.js"
import { StoreNotCreatedError, UnauthorizedError } from "../lib/errors.js"

declare module "express-serve-static-core" {
  interface Request {
    /**
     * Set by requireOwnStore — the caller's store. Downstream service code
     * uses req.ownStore.id to scope product queries (no IDOR vector since the
     * store id is server-derived, not request-supplied).
     */
    ownStore?: { id: string; ownerId: string }
  }
}

/**
 * Ensures the caller (already auth'd + role-gated to OWNER by the parent
 * router) has actually created their store. Sets `req.ownStore` for
 * downstream service calls. Returns 404 STORE_NOT_CREATED otherwise so the
 * owner PWA can route to onboarding.
 *
 * MUST be mounted AFTER requireAuth + requireRole(OWNER).
 */
export async function requireOwnStore(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (req.user === undefined) {
      throw new UnauthorizedError("requireOwnStore must come after requireAuth")
    }
    const store = await prisma.store.findUnique({
      where: { ownerId: req.user.id },
      select: { id: true, ownerId: true },
    })
    if (store === null) {
      throw new StoreNotCreatedError()
    }
    req.ownStore = store
    next()
  } catch (err) {
    next(err)
  }
}
