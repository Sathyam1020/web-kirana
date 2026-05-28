import type { Request, Response } from "express"
import { prisma } from "../../db/prisma.js"
import { Role } from "../../generated/prisma/enums.js"
import { UnauthorizedError } from "../../lib/errors.js"
import { sendData } from "../../lib/response.js"
import { issueTicket } from "../../realtime/tickets.js"

/**
 * Mint a one-time Socket.IO handshake ticket for the authenticated user. The
 * ticket encodes which rooms this connection may join, resolved here (where the
 * cookie session is available) so the socket connect path stays DB-free and a
 * client can't request arbitrary rooms.
 */
export async function createTicket(req: Request, res: Response): Promise<void> {
  if (req.user === undefined) throw new UnauthorizedError()

  // Every authenticated user gets their personal room (a customer's own order
  // updates live here). Owners additionally get their store's room.
  const rooms = [`user:${req.user.id}`]
  if (req.user.role === Role.OWNER) {
    const store = await prisma.store.findFirst({
      where: { ownerId: req.user.id },
      select: { id: true },
    })
    if (store !== null) rooms.push(`store:${store.id}`)
  }

  const { ticket, ttlMs } = issueTicket(rooms)
  sendData(res, { ticket, ttlMs })
}
