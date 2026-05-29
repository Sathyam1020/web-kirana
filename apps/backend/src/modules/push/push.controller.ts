import type { Request, Response } from "express"
import { prisma } from "../../db/prisma.js"
import { ForbiddenError, UnauthorizedError } from "../../lib/errors.js"
import { sendNoContent } from "../../lib/response.js"
import type { SubscribeBody, UnsubscribeBody } from "./push.schemas.js"

/**
 * Register (or refresh) a Web Push subscription for the authenticated user.
 * Keyed on the unique endpoint, so a re-subscribe from the same browser updates
 * in place (and re-binds it to the current user if it changed hands).
 */
export async function subscribe(req: Request, res: Response): Promise<void> {
  if (req.user === undefined) throw new UnauthorizedError()
  const body = req.body as SubscribeBody
  // Endpoints are globally unique. Refuse to rebind one already owned by a
  // different user rather than silently reassigning it (defense-in-depth —
  // endpoints are unguessable, but never let one user take over another's row).
  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint: body.endpoint },
    select: { userId: true },
  })
  if (existing !== null && existing.userId !== req.user.id) {
    throw new ForbiddenError()
  }
  await prisma.pushSubscription.upsert({
    where: { endpoint: body.endpoint },
    create: {
      userId: req.user.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: body.userAgent ?? null,
    },
    update: {
      userId: req.user.id,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: body.userAgent ?? null,
      lastSeenAt: new Date(),
    },
  })
  sendNoContent(res)
}

/** Remove a subscription (on opt-out). Scoped to the caller so a user can only
 *  delete their own. */
export async function unsubscribe(req: Request, res: Response): Promise<void> {
  if (req.user === undefined) throw new UnauthorizedError()
  const body = req.body as UnsubscribeBody
  await prisma.pushSubscription.deleteMany({
    where: { endpoint: body.endpoint, userId: req.user.id },
  })
  sendNoContent(res)
}
