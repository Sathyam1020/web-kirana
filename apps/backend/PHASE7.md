# Phase 7 — Order placement

Detailed design (same style as `CLEANUP.md`). Schema for orders was laid down
in earlier phases; this phase wires the **placement transaction**, the
**read surfaces** (customer + owner), and the **customer checkout + owner
inbox UIs**.

> Lifecycle transitions (owner accept / reject / out-for-delivery / deliver,
> payment-collected, notifications) are **Phase 8** — explicitly out of scope
> here. Phase 7 ends at: a customer can place an order, and both sides can
> view it. Rider participation is Phase 7.5 (already designed in PROGRESS.md).

---

## Concept

A customer turns their (single-store) cart into an `Order`. Placement must be:

- **Idempotent** — a double-tap / retry creates exactly one order (`Idempotency-Key` header).
- **Re-validated server-side** — client prices/availability are never trusted; everything is re-read inside the transaction.
- **Snapshotted** — store/customer/address/product/price/coupon values are frozen onto the order so later edits don't rewrite history.
- **Transactional** — order + items + status-history + coupon redemption + coupon usage increment all commit together or not at all.

Money stays in **paise** end to end. Item prices use the Phase 6.8
**effective (post-discount) price**; coupons stack on the discounted subtotal.

---

## Endpoint — placement

```
POST /v1/orders
  Auth: CUSTOMER (requireAuth + requireRole(CUSTOMER))
  Header: Idempotency-Key: <uuid>        (REQUIRED — 400 if missing)
  Body:
    {
      addressId: string,                  // must belong to the caller
      cart: [{ productId, quantity }],    // 1..N, qty 1..99; prices NOT sent
      couponCode?: string,
      customerNote?: string,              // <= 500 chars
      paymentMethod?: "COD"               // default + only option
    }
  → 201 { data: { order: OrderView } }
  Replays of the same key+body → 201 with the SAME stored order (no new row).
```

`OrderView` (also the read shape):

```ts
{
  id, status, paymentMethod, paymentStatus,
  itemsSubtotalPaise, discountPaise, deliveryFeePaise, totalPaise,
  store: { id, nameSnapshot, phoneSnapshot },
  delivery: { label, line1, line2, city, pincode, latitude, longitude },
  customerNote,
  couponCode: string | null,
  items: [{ id, productId, nameSnapshot, imageUrlSnapshot, unitPricePaiseSnapshot,
            unitSnapshot, quantity, lineTotalPaise }],
  placedAt, createdAt
}
```

`discountPaise` is read from the `CouponRedemption` (0 when no coupon). There's
no discount column on `Order` — it's derived from the redemption row.

---

## Idempotency (the `IdempotencyKey` model already exists)

scope = `"orders"`. `requestFingerprint = sha256(canonicalJSON(body))`.

1. Require the `Idempotency-Key` header (400 `VALIDATION_ERROR` if absent).
2. **Fast path** — `findUnique({ userId, scope, key })`:
   - present + fingerprint matches + has a stored body → return the stored
     response (the replay; **no** new order).
   - present + fingerprint differs → 409 `CONFLICT` ("key reused with a
     different request").
3. Otherwise run the placement **transaction**, whose first statement is
   `tx.idempotencyKey.create(...)` with the `@@unique([userId, scope, key])`.
   - If that create throws `P2002`, a concurrent request already owns the key
     → abort, re-read the row, return its stored response (or 409 if it's
     somehow still empty/in-flight).
   - On success, the LAST statement of the tx updates that row with
     `responseStatusCode`, `responseBody` (the OrderView), and `orderId`.
   - `expiresAt = now + 24h` (a Phase 11 cron sweeps expired keys; not built here).

The unique constraint is the real concurrency guard; the fast path is just the
common "client retried after it already succeeded" case.

---

## Re-validation (inside the transaction, in order)

All reads use the `tx` client so they see a consistent snapshot.

1. **Address** — `findFirst({ id: addressId, customerId })`; else 404.
2. **Products** — re-read every cart product by id with
   `{ pricePaise, discount*, isActive, isAvailable, storeId, name, imageUrl,
   unit, subcategory: { isAvailable } }`.
   - missing / `!isActive` / `!isAvailable` / subcategory unavailable →
     `CART_CHANGED` (409) with `details.products` listing the offending ids so
     the client can re-sync the cart.
3. **Single store** — all products share one `storeId`; else `MULTI_STORE_CART`
   (400). Capture `storeId`.
4. **Store** — `findFirst({ id, isActive: true })`; `isOpen` must be true →
   else `STORE_CLOSED` (409).
5. **Subtotal** — `itemsSubtotalPaise = Σ effectivePricePaise(p) * qty`
   (Phase 6.8 `lib/pricing`). `lineTotalPaise = effective * qty`.
6. **Min order** — `subtotal >= store.minOrderPaise`; else `CART_CHANGED`
   (409, reason min-order) — surfaced with the threshold.
7. **Service area** — delivery point within `store.deliveryRadiusMeters` of
   `store.location` via raw `ST_DWithin` (GiST index); else
   `OUT_OF_SERVICE_AREA` (409, per the existing error class).
8. **Coupon** (if `couponCode`) — re-run the coupon checks against the
   recomputed subtotal (reuse a shared `evaluateCoupon(tx, …)` extracted from
   the preview service) → `discountPaise`. On any coupon failure →
   `CART_CHANGED`/`CONFLICT` so the client re-previews. Then:
   - `couponRedemption.create({ couponId, userId, orderId, discountAppliedPaise })`
     (the `orderId @unique` blocks double-apply on one order),
   - `coupon.update` incrementing `usageCount`, guarded by `totalUsageLimit`
     (conditional `updateMany` where `usageCount < limit`; 0 rows → coupon just
     got exhausted → `CONFLICT`).

`deliveryFeePaise = 0` for Phase 7 (no per-store fee config yet — documented
decision; add `Store.deliveryFeePaise` later without breaking this).

`totalPaise = itemsSubtotalPaise − discountPaise + deliveryFeePaise`.

---

## Write (inside the same transaction)

- `order.create` with all snapshots:
  `storeNameSnapshot, storePhoneSnapshot, customerNameSnapshot,
  customerPhoneSnapshot, deliveryLabel/Line1/Line2/City/Pincode/Latitude/
  Longitude`, the three money fields, `status=PLACED`, `paymentMethod=COD`,
  `paymentStatus=PENDING`, `customerNote`.
- `orderItem.createMany` — one row per cart line, snapshotting
  `productNameSnapshot, productImageUrlSnapshot, unitPricePaiseSnapshot
  (= effective), unitSnapshot, quantity, lineTotalPaise`. `productId` kept as a
  soft FK (`onDelete: SetNull`).
- `orderStatusHistory.create` — `fromStatus=null, toStatus=PLACED,
  actorType=CUSTOMER, actorUserId=customer.id`.
- coupon redemption + usage increment (above).
- idempotency row update with the response.

Emit a `order.placed` domain event (existing `events` bus) for Phase 8/10
notifications to subscribe to later. No notification sending in Phase 7.

---

## Read surfaces

```
GET /v1/orders                 CUSTOMER — their orders, newest first, paginated
GET /v1/orders/:id             CUSTOMER — own order detail (404 if not theirs)
GET /v1/stores/me/orders       OWNER   — incoming orders for their store
                                         (optional ?status= filter), paginated
GET /v1/stores/me/orders/:id   OWNER   — own-store order detail
```

Both scoped server-side (customerId / store ownerId) — no IDOR. Same
`OrderView` shape; the owner view additionally exposes the customer name/phone
snapshot (already on the order) for fulfilment.

---

## Frontend

**Customer** (`apps/customer`):
- Cart page → checkout: pick a saved address (or prompt to add one), optional
  coupon (uses the existing `/coupons/preview` for the live breakdown),
  "Place order". Generates an `Idempotency-Key` (crypto.randomUUID) once per
  checkout attempt; disables the button while in flight.
- Order confirmation screen + `/orders` list + `/orders/[id]` detail.
- On `CART_CHANGED` → show what changed and bounce back to the cart.

**Owner** (`apps/owner`):
- "Orders" surface (new nav or under dashboard) — incoming list + detail
  (read-only in Phase 7; accept/reject lands in Phase 8).

---

## Tests (the heavy one)

| # | Case |
|---|------|
| 1 | Happy path → 201, order + items + history + total correct (effective prices) |
| 2 | Same Idempotency-Key + body twice → one order, second returns the stored one |
| 3 | Same key, different body → 409 |
| 4 | Missing Idempotency-Key → 400 |
| 5 | Concurrent double-submit (same key) → exactly one order created |
| 6 | Price/availability changed since add-to-cart → 409 CART_CHANGED |
| 7 | Multi-store cart → 400 |
| 8 | Store closed → 409 |
| 9 | Below min order → 409 |
| 10 | Outside delivery radius → 409 OUT_OF_SERVICE_AREA |
| 11 | Coupon applied → redemption row + usageCount++ + discount in total |
| 12 | Coupon exhausted between preview and placement → 409 |
| 13 | Customer reads own orders; cannot read another customer's (404) |
| 14 | Owner reads own-store orders; cannot read another store's (404) |
| 15 | Snapshots survive a post-order product rename / price change |

---

## Decisions (locked)

- **COD only**, `paymentStatus=PENDING` at placement (collected = Phase 8).
- **deliveryFeePaise = 0** (no fee config yet).
- **Single-store carts only** (multi-store = 400; matches coupon preview).
- **Idempotency-Key header is required** (not optional) on placement.
- **Lifecycle transitions, notifications, modify/cancel = Phase 8** (out of scope).

## Out of scope (Phase 8+)

Owner accept/reject/out-for-delivery/deliver state machine
(`InvalidTransitionError` already exists), payment collected, order modify/
cancel, WhatsApp/web-push notifications, rider assignment (Phase 7.5).
