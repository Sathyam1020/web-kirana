import type { Server as HttpServer } from "node:http"
import { Server as IOServer } from "socket.io"
import { env } from "../config/env.js"
import { events } from "../lib/events.js"
import { logger } from "../lib/logger.js"
import { redeemTicket } from "./tickets.js"

/**
 * Socket.IO real-time layer (Phase 9).
 *
 * Auth: a one-time ticket (see ./tickets.ts) passed in the handshake `auth`
 * payload. The ticket already encodes which rooms the connection may join, so
 * the connect path does zero DB work and a client can never join a room it
 * wasn't granted.
 *
 * Rooms:
 *   user:<userId>    — a customer's own order updates (and owner-personal later)
 *   store:<storeId>  — every order belonging to a store (owner inbox)
 *
 * The bus → socket bridge subscribes to the same domain events the orders
 * service already emits, so services/controllers don't change.
 */
export function initRealtime(httpServer: HttpServer): IOServer {
  const io = new IOServer(httpServer, {
    // The socket connects DIRECTLY to the API origin (cross-origin from the
    // app subdomains), unlike REST which is proxied same-origin via the Next
    // rewrite — so the handshake needs the same origin allowlist as the REST
    // CORS layer. Credentials aren't needed: auth rides in the ticket, not a
    // cookie.
    cors: { origin: env.CORS_ALLOWED_ORIGINS, credentials: false },
  })

  io.use((socket, next) => {
    const token =
      typeof socket.handshake.auth.token === "string" ? socket.handshake.auth.token : ""
    const rooms = token.length > 0 ? redeemTicket(token) : null
    if (rooms === null) {
      next(new Error("unauthorized"))
      return
    }
    socket.data.rooms = rooms
    next()
  })

  io.on("connection", (socket) => {
    const rooms = (socket.data.rooms as string[] | undefined) ?? []
    for (const room of rooms) void socket.join(room)
    logger.debug({ socketId: socket.id, rooms }, "realtime: client connected")
  })

  bridgeEvents(io)

  return io
}

function bridgeEvents(io: IOServer): void {
  events.on("order.placed", (e) => {
    const payload = { orderId: e.orderId, storeId: e.storeId, totalPaise: e.totalPaise }
    io.to(`store:${e.storeId}`).emit("order.placed", payload)
    io.to(`user:${e.customerId}`).emit("order.placed", payload)
  })

  events.on("order.status_changed", (e) => {
    // Minimal payload — consumers only need orderId to invalidate their query;
    // we don't echo customerId over the wire (the owner's browser doesn't use
    // it, and the customer already knows it's theirs).
    const payload = {
      orderId: e.orderId,
      storeId: e.storeId,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      actorType: e.actorType,
    }
    io.to(`store:${e.storeId}`).emit("order.status_changed", payload)
    io.to(`user:${e.customerId}`).emit("order.status_changed", payload)
  })
}
