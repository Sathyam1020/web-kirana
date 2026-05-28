import { randomBytes } from "node:crypto"

/**
 * One-time, short-lived tickets for the Socket.IO handshake.
 *
 * Why tickets and not the session cookie: the session cookie is host-scoped
 * and first-party on each app's origin (customer.localhost:3000), reached via
 * the Next `/v1/*` rewrite. A socket connecting straight to the API at :4000 is
 * cross-origin, and a host-scoped cookie for origin A is never sent to origin B
 * — so the cookie can't authenticate the socket. Instead the client calls the
 * cookie-authenticated `POST /v1/realtime/ticket` (which DOES go through the
 * rewrite) to mint a ticket, then hands that ticket to the socket handshake.
 *
 * Tickets are single-use (deleted on redeem) and expire fast. The client mints
 * a fresh one before every connection attempt (including reconnects), so
 * one-time semantics don't break reconnection.
 *
 * Storage is in-process. That's correct for the current single-instance
 * deployment; a horizontally-scaled backend would move this to Redis (or swap
 * for a stateless signed token), since a ticket minted on instance A must be
 * redeemable on instance B.
 */

const TTL_MS = 60_000

interface TicketEntry {
  rooms: string[]
  expiresAt: number
}

const tickets = new Map<string, TicketEntry>()

export function issueTicket(rooms: string[]): { ticket: string; ttlMs: number } {
  const ticket = randomBytes(32).toString("hex")
  tickets.set(ticket, { rooms, expiresAt: Date.now() + TTL_MS })
  return { ticket, ttlMs: TTL_MS }
}

/** Redeem a ticket exactly once. Returns the rooms to join, or null if the
 *  ticket is unknown, already used, or expired. */
export function redeemTicket(ticket: string): string[] | null {
  const entry = tickets.get(ticket)
  if (entry === undefined) return null
  tickets.delete(ticket)
  if (entry.expiresAt < Date.now()) return null
  return entry.rooms
}

// Purge expired-but-never-redeemed tickets so the map can't grow unbounded.
// unref() so this timer never keeps the process (or a test run) alive.
const sweep = setInterval(() => {
  const now = Date.now()
  for (const [ticket, entry] of tickets) {
    if (entry.expiresAt < now) tickets.delete(ticket)
  }
}, 30_000)
sweep.unref()
