# Phase 8 — Order lifecycle + customer status tracker

Detailed design (same style as `PHASE7.md`). Phase 7 placed orders and let
both sides view them; Phase 8 makes orders **move** — the owner drives an
order from PLACED to DELIVERED, the customer can cancel while it's still
PLACED, and the customer sees a live delivery-app-style tracker.

> Out of scope (next phase = **Staff**): assigning a delivery person to an
> order, the staff app, and notifications (WhatsApp / web-push). Phase 8 is
> owner-driven status only; the schema's `OrderStatusHistory.actorType`
> already has a `SYSTEM`/future slot for staff.

The `Order` model already carries every field this needs: `status`,
`paymentStatus`, and `acceptedAt / outForDeliveryAt / deliveredAt /
rejectedAt / cancelledAt` + `rejectionReason / cancellationReason`.
`OrderStatusHistory` records each transition; `InvalidTransitionError` (409)
already exists.

---

## State machine

```
              ┌───────────── owner reject (reason) ──────────► REJECTED ✦
              │
  PLACED ─────┼── owner accept ──► ACCEPTED ── owner out-for-delivery ──►
              │                                       OUT_FOR_DELIVERY
              │                                              │
              └── customer cancel ──► CANCELLED ✦            │ owner deliver
                  (only while PLACED)                        ▼
                                                          DELIVERED ✦
✦ = terminal
```

| From | To | Actor | Side effects |
|------|-----|-------|--------------|
| PLACED | ACCEPTED | owner | `acceptedAt` |
| PLACED | REJECTED | owner | `rejectedAt`, `rejectionReason` (required) |
| PLACED | CANCELLED | customer | `cancelledAt`, `cancellationReason` (optional) |
| ACCEPTED | OUT_FOR_DELIVERY | owner | `outForDeliveryAt` |
| OUT_FOR_DELIVERY | DELIVERED | owner | `deliveredAt`, `paymentStatus = COLLECTED` (COD) |

Anything not in this table → `InvalidTransitionError` (409). Customer cancel is
allowed **only** while PLACED — once the owner accepts, cancellation needs the
owner (a later "owner-cancel" can be added; not now).

---

## Endpoints

Owner (under `/v1/stores/me/orders/:id`, already OWNER + requireOwnStore):
```
POST /:id/accept
POST /:id/reject            body: { reason: string (1..300) }
POST /:id/out-for-delivery
POST /:id/deliver
```
Customer:
```
POST /v1/orders/:id/cancel  body: { reason?: string (<=300) }   (only while PLACED)
```
All return `{ order: OrderView }` with the new status.

### Transition implementation (atomic + double-click safe)

Each transition is a small transaction:
1. **Guarded** `order.updateMany({ where: { id, <scope>, status: <expectedFrom> }, data: { status: <to>, <timestamp>, … } })`.
   - `<scope>` = `storeId` (owner) or `customerId` (customer) → no IDOR.
   - `count === 0` → the order is missing/not-owned **or** not in the expected
     state. Disambiguate with one `findFirst({ id, <scope> })`: not found →
     404; found but wrong state → `InvalidTransitionError` (409). This also
     makes a double-tap safe (second tap sees the new state → 409, UI refetches).
2. `orderStatusHistory.create({ fromStatus, toStatus, actorType, actorUserId, reason })`.
3. deliver also sets `paymentStatus = COLLECTED`.
4. emit `order.status_changed` (new domain event) for the future notifications/
   staff consumers. No sending in Phase 8.

A shared `transition(orderId, scope, from, to, patch, actor)` helper keeps the
five endpoints tiny and consistent.

---

## Contract change (additive)

`OrderView` gains the lifecycle fields so the tracker can render timestamps:
```ts
acceptedAt: string | null
outForDeliveryAt: string | null
deliveredAt: string | null
rejectedAt: string | null
cancelledAt: string | null
rejectionReason: string | null
cancellationReason: string | null
```
(`status` + `paymentStatus` are already on `OrderView`.) api-client gains the
transition methods: `api.stores.acceptOrder(id)`, `rejectOrder(id, reason)`,
`markOutForDelivery(id)`, `markDelivered(id)`, and `api.orders.cancel(id, reason?)`.

---

## Frontend

**Customer** (`/orders/[id]`): a vertical **stepper** — Placed → Accepted →
Out for delivery → Delivered — with the timestamp under each completed step
(from the order's `*At` fields). REJECTED / CANCELLED render as a terminal
banner with the reason instead of the stepper. A **Cancel order** button shows
only while `status === "PLACED"`. The page uses
`refetchInterval` (~15s) while the status is non-terminal so it advances live
as the owner acts (real-time push is a later phase). The `/orders` list shows
the current status label.

**Owner** (`/orders/[id]`): contextual action buttons by current status —
PLACED → **Accept** / **Reject** (reason dialog); ACCEPTED → **Out for
delivery**; OUT_FOR_DELIVERY → **Mark delivered**. Each mutates then refetches
(or optimistic). The `/orders` inbox highlights `PLACED` (new) orders and can
filter by status (`?status=` already supported by the read endpoint).

---

## Tests

| # | Case |
|---|------|
| 1 | owner accept: PLACED→ACCEPTED, acceptedAt set, history row |
| 2 | owner reject (with reason): PLACED→REJECTED, reason stored |
| 3 | owner out-for-delivery: ACCEPTED→OUT_FOR_DELIVERY |
| 4 | owner deliver: →DELIVERED + paymentStatus COLLECTED |
| 5 | invalid transition (PLACED→deliver) → 409 |
| 6 | double accept → second is 409 (idempotent-safe) |
| 7 | reject without reason → 400 |
| 8 | customer cancel while PLACED → CANCELLED |
| 9 | customer cancel after ACCEPTED → 409 |
| 10 | owner can't transition another store's order → 404 |
| 11 | customer can't cancel another customer's order → 404 |
| 12 | full happy path PLACED→ACCEPTED→OUT_FOR_DELIVERY→DELIVERED, history has 4 rows |

---

## Decisions (locked)

- Owner drives accept/reject/out-for-delivery/deliver; **customer cancel only
  while PLACED**.
- **DELIVERED sets paymentStatus = COLLECTED** (COD collected at the door).
- Transitions are atomic via guarded `updateMany` + a disambiguating read.
- **No notifications, no staff assignment** in Phase 8 (next: Staff phase).
- Reasons: reject requires one; cancel optional.

## Out of scope → next: **Staff** (formerly "Riders")

Staff self-signup → apply-to-store → owner approval, assigning staff to an
OUT_FOR_DELIVERY order, the staff app, and notifications. Sequenced **after**
Phase 8 because staff assignment hooks into the lifecycle this phase builds.
