# Phase 9 — Socket.IO real-time

Push order events to the right clients so the UI updates live instead of
polling. The customer's order tracker + floating order bar advance in real
time; the owner's inbox / order page get new orders and status changes pushed.

This hooks into infrastructure that was already in place: the orders service
emits `order.placed` (Phase 7) and `order.status_changed` (Phase 8) on the
domain event bus (`src/lib/events.ts`). Phase 9 adds a subscriber that fans
those events out over Socket.IO. **Services and controllers did not change.**

---

## Architecture

```
browser (customer.localhost:3000)                backend (:4000)
  │                                                  │
  │ 1. POST /v1/realtime/ticket  ──(via Next /v1 rewrite, cookie works)──▶ requireAuth
  │                                                  │  → issueTicket(rooms)
  │ ◀───────────────── { ticket, ttlMs } ───────────┘
  │
  │ 2. io(API_ORIGIN, { auth: { token: ticket } })  ──(direct, cross-origin)──▶ io.use()
  │                                                  │  → redeemTicket → join rooms
  │ ◀═══════════ order.placed / order.status_changed (live) ═══════════════════
```

### Why a ticket, not the session cookie
The session cookie is **host-scoped and first-party** on each app's origin
(`customer.localhost:3000`), reached via the Next `/v1/*` rewrite. A socket
connects **directly** to the API at `:4000` (cross-origin) — and a host-scoped
cookie for origin A is never sent to origin B, regardless of SameSite. Next
rewrites also don't reliably proxy WebSocket upgrades. So the cookie can't
authenticate the socket.

Instead: the client calls the cookie-authenticated `POST /v1/realtime/ticket`
(which DOES go through the rewrite), gets a one-time ~60s ticket, and presents
that in the handshake `auth` payload. `src/realtime/tickets.ts`.

### Rooms
- `user:<userId>` — a customer's own order updates (and owner-personal later).
- `store:<storeId>` — every order belonging to a store (owner inbox).

The room set is resolved **server-side** in the ticket endpoint from the
session identity (`user:<req.user.id>`; owners also get `store:<own store>`),
baked into the ticket, and joined verbatim on connect. No room name ever comes
from client input — so a client can't join a room it wasn't granted.

### Event bridge (`src/realtime/index.ts`)
- `order.placed` → `store:<storeId>` + `user:<customerId>`.
- `order.status_changed` → `store:<storeId>` + `user:<customerId>`.

Payloads are minimal (`orderId`, `storeId`, status fields). The FE uses them to
invalidate the relevant React Query keys — the push just triggers a refetch, so
we never hand-merge socket payloads into the cache.

---

## Frontend

- `packages/auth/src/realtime.ts` — `useRealtime({ url, onEvent })`. Connects
  while authenticated; an `auth` **function** mints a fresh one-time ticket
  before every connection attempt, so reconnection works despite single-use
  tickets. Forwards `order.placed` / `order.status_changed` plus a synthetic
  `connected` (so consumers refetch on reconnect to catch up on missed events).
- `apps/{customer,owner}/components/realtime-bridge.tsx` — mounts the hook
  inside the providers (needs both auth + query context) and invalidates the
  app's order query keys (`["orders"]`/`["order",id]` for customer,
  `["owner-orders"]`/`["owner-order",id]` for owner).
- Socket URL: `NEXT_PUBLIC_WS_URL` → the API origin (default
  `http://localhost:4000`). Must be in the backend's `CORS_ALLOWED_ORIGINS`.
- Polling is now the **slow fallback**: the 15s/20s intervals were bumped to
  60s; push drives fast updates, the slow poll + refetch-on-reconnect recover
  if the socket drops.

---

## Security hardening (from the reviewer pass)

- **Per-user rate limit** on `POST /v1/realtime/ticket`
  (`realtimeTicketLimiter`, 30/min keyed on `req.user.id`) — caps ticket-mint
  volume per identity independent of the global per-IP budget, and bounds the
  in-memory ticket map under abuse / reconnect storms. Noop in tests.
- **Prod CORS guard** — `env.ts` superRefine now requires
  `CORS_ALLOWED_ORIGINS` to be set explicitly in production (the localhost
  default must never silently ship and degrade the socket allowlist).
- **Minimal payloads** — `customerId` dropped from the `order.status_changed`
  wire payload (no consumer reads it; reduces blast radius).
- Authz audit: clean (0 findings) — no room-IDOR, no privilege escalation to
  `store:` rooms, no ticket replay/forgery path.

---

## Tests — `tests/realtime.test.ts` (6, all green against Neon)

Boots a live server + io on an ephemeral port and connects real
socket.io-client clients:
- handshake: rejects no-ticket, unknown-ticket, and reused (one-time) ticket.
- `order.placed` reaches the store room **and** the customer.
- `order.status_changed` reaches both sides on accept.
- isolation: customer B never receives customer A's order.

---

## Decisions locked

1. **Ticket auth, not cookie-via-rewrite.** Robust across origins; no reliance
   on WS-upgrade proxying. (User-confirmed.)
2. **Push + slow fallback**, not push-on-top-of-polling. (User-confirmed.)
3. **In-process ticket store.** Correct for the single-instance deployment.
   Documented caveat: move to Redis (or a stateless signed token) before
   horizontal scale — a ticket minted on instance A must redeem on B.
4. Scope is **orders only** for now. Store open/close, stock changes, etc. can
   ride the same bus later without new infra.

---

## Deferred

- **Redis ticket store / adapter** when the backend scales past one instance
  (also enables the `@socket.io/redis-adapter` for cross-instance room fan-out).
- **Staff rooms** — when Staff (8.5/8.6) lands, staff sockets join their store
  room; the bridge already emits there, so it's mostly a ticket-rooms change.
