# IP-1 — Store config trio (fees · hours · radius)

> First Improvements Phase. Lights up commerce primitives the design phase already
> rendered (MinOrderStrip on the customer home, store status pill) but the backend
> didn't fully back. Smallest IP scope by design — ships in 1–2 days, gives owners
> real control, lowest risk before the harder IPs (variants, geo, slots).

---

## Goals

1. **Delivery fees** that owners control: a base fee, with free-above-threshold,
   computed + snapshotted at placement.
2. **Minimum order** enforced at the backend (not just nudged on the cart).
3. **Operating hours** as the source of truth for "is the store open right now,"
   with a manual override for emergencies.
4. **Bigger radius range** (cap goes 15 km → 25 km).
5. Owner Settings UI that surfaces all of it in one place.
6. Customer cart that shows both "Add ₹X for free delivery" and "Add ₹X to meet
   minimum order" nudges, plus a real total that includes fee.

---

## Locked decisions

- **Flat fee + free-above-threshold model only.** No tiers, no per-distance.
  Doc says so already and matches owner mental model.
- **Same hours for every day of the week.** Per-day-of-week hours is parked.
  Owners can use `manualClosed=true` for closures (festival, illness).
- **Hours are wall-clock IST strings (`"HH:MM"`).** Stored as text, not minutes-
  past-midnight, because pickers + display + admin debugging all read better
  that way. The cron does the comparison in IST.
- **Auto-open/close runs every 15 min**, IST-aware. A 1–14 min lag between
  hours change and `isOpen` flip is acceptable for kiranas (no order can be
  placed against a closed store anyway because `isOpen` gates `nearby`).
- **Manual override always wins.** `manualClosed=true` forces closed even
  during open-hours.
- **Existing rows default to safe values** — fee 0, threshold 0, min 0,
  hours 07:00–22:00, manualClosed false. Production-safe defaults: a store
  that doesn't touch settings continues to behave like today.
- **Cap on radius bumps from 15 km → 25 km.** Below 500 m still rejected.
- **Backend rejects `MIN_ORDER_NOT_MET`** at placement — single source of
  truth. The cart strip is a nudge, not the enforcer.
- **Delivery fee snapshotted onto Order at placement.** The store can change
  its fee tomorrow; this order's fee stays what the customer agreed to.

---

## Schema

Six additive columns on `Store`, all NOT NULL with safe defaults so backfill
on existing rows is atomic:

```prisma
model Store {
  // ...existing...
  baseDeliveryFeePaise        Int     @default(0)
  freeDeliveryThresholdPaise  Int     @default(0)
  // minOrderPaise — already exists
  openTime                    String  @default("07:00")   // "HH:MM" IST
  closeTime                   String  @default("22:00")   // "HH:MM" IST
  manualClosed                Boolean @default(false)
}
```

### Migration

```sql
ALTER TABLE "Store"
  ADD COLUMN "baseDeliveryFeePaise" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "freeDeliveryThresholdPaise" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "openTime" TEXT NOT NULL DEFAULT '07:00',
  ADD COLUMN "closeTime" TEXT NOT NULL DEFAULT '22:00',
  ADD COLUMN "manualClosed" BOOLEAN NOT NULL DEFAULT false;
```

Generated via `migrate dev --create-only`, hand-strip any spurious PostGIS
`DROP INDEX` lines (the documented gotcha from earlier phases), apply via
`migrate deploy`. No data backfill — defaults match current behaviour.

---

## Backend — code touchpoints

### `apps/backend/prisma/schema.prisma`
Add the 5 new fields.

### `apps/backend/src/modules/stores/stores.schemas.ts`
- `createStoreBody` + `updateStoreBody` gain optional + defaulted fields:
  - `baseDeliveryFeePaise` — `int().min(0).max(50_000)` (₹500 cap)
  - `freeDeliveryThresholdPaise` — `int().min(0).max(2_000_000)` (₹20k cap)
  - `openTime` / `closeTime` — `regex(/^([01]\d|2[0-3]):[0-5]\d$/)` (HH:MM)
  - `manualClosed` — `boolean()`
- Bump `deliveryRadiusMeters` max from `15_000` → `25_000` in both create + update.
- Cross-field rule: when both `openTime` and `closeTime` are provided in the
  same body, reject if equal. (Crossing midnight is allowed — many kiranas
  run 21:00–01:00; the cron handles it.)

### `apps/backend/src/modules/stores/stores.service.ts`
- `STORE_OWNER_SELECT` + `STORE_PUBLIC_SELECT` + `toOwnerView` / `toPublicView`
  pick up the 5 new fields.
- `createStore` + `updateOwnStore` write them through.
- New service fn `autoOpenCloseStores()` — the cron entrypoint:
  - SELECTs every active store with `manualClosed=false`.
  - Computes "is this store inside its open–close window in IST right now?"
    Crossing-midnight aware (`if (open < close) inside = open <= now < close;
    else inside = now >= open || now < close`).
  - For each row whose computed state differs from current `isOpen`, runs the
    SAME guarded `updateMany WHERE id=? AND isOpen=!new` claim pattern the
    lifecycle uses, so it can't race an owner-manual toggle.
  - Emits `store.opened` / `store.closed` via the existing event bus.
- `setOpenStatus` (owner manual toggle) is kept — wires through to set
  `manualClosed = !isOpen` so the next cron tick doesn't immediately undo it.
  Actually we keep `isOpen` as the read-side truth and add `manualClosed` as
  a *suppress-cron* flag — owner Settings exposes both controls separately
  (toggle "Manually closed" + the hours). This matches the doc's emergency-
  override semantics.

### `apps/backend/src/modules/orders/orders.service.ts`
- New helper `computeDeliveryFeePaise(subtotalPaise, store)`:
  - `if subtotal >= threshold && threshold > 0 → 0`
  - `else → baseDeliveryFeePaise`
- New helper `assertMinimumOrderMet(subtotalPaise, store)`:
  - Throws `MIN_ORDER_NOT_MET` (new error code, 400) when subtotal <
    minOrderPaise and minOrderPaise > 0.
- `placeOrder` swaps `const deliveryFeePaise = 0` for the helper call.
- `placeOrder` also calls `assertMinimumOrderMet` after subtotal is computed,
  before the transaction starts.

### `apps/backend/src/lib/errors.ts`
- Add `MinOrderNotMetError` (mirrors existing custom errors, 400 status,
  `code: "MIN_ORDER_NOT_MET"`, payload includes `requiredPaise` + `actualPaise`
  so the client can render an honest message).

### `apps/backend/src/jobs/index.ts`
- Register `auto-store-open-close` on a `*/15 * * * *` schedule wrapped in
  `runGuarded`. Same error-swallowing pattern as the other jobs.

### `packages/shared/src/api-types.ts`
- `StoreOwnerView` gains `baseDeliveryFeePaise`, `freeDeliveryThresholdPaise`,
  `openTime`, `closeTime`, `manualClosed`.
- `StorePublicView` (the customer-facing shape) gains
  `baseDeliveryFeePaise` + `freeDeliveryThresholdPaise` so the customer cart
  can render the "Add ₹X for free delivery" nudge without a second fetch.
  `openTime` / `closeTime` are nice to render on the store page; include
  them. `manualClosed` stays owner-only — customers see `isOpen` only.

### `packages/api-client/src/endpoints.ts`
- `UpdateStoreBody` extends with the 5 fields.
- New `MinOrderNotMetError` response type for the cart to render.

---

## Frontend — code touchpoints

### Owner — `apps/owner/app/(authed)/settings/page.tsx`
Three new control cards, mounted under the existing Store settings card:

1. **Delivery fees & minimum order**
   - `baseDeliveryFeePaise` — paise input rendered as ₹
   - `freeDeliveryThresholdPaise` — paise input rendered as ₹
   - `minOrderPaise` — already there; moved into this card for grouping
   - Live preview line: *"Customer sees: Min order ₹100. ₹30 delivery below
     ₹200, free above."* Generated client-side from the current values.

2. **Operating hours**
   - Two `<input type="time">` controls (browsers render mobile-friendly
     pickers natively; matches the rest of the owner app's pattern).
   - "Manually closed" toggle. When ON, shows a helper line: *"Customers see
     the store as closed regardless of the hours below."*

3. **Delivery radius**
   - Slider 500 m – 25 km (now that the cap is 25k).
   - Already a control in some form; visual polish only here.

All three save via the existing `updateMine` endpoint; one consolidated
"Save changes" button per card with the existing Button `loading` →
`success` morph.

### Customer — `apps/customer/components/min-order-strip.tsx`
Already shows "Add ₹X more to place this order" for min order. Extend to a
**second variant** "Add ₹X more for free delivery" when:
- min order is met (or not set) AND
- subtotal < `freeDeliveryThresholdPaise` AND
- `freeDeliveryThresholdPaise > 0`

Single component, two messages. Same animated progress bar; bar fills against
whichever threshold is currently relevant. When both thresholds met, strip
animates closed (existing exit anim) — quiet success, no celebration.

### Customer — `apps/customer/app/(authed)/cart/page.tsx`
- Bill breakdown row: **Delivery fee** with the computed value (free shown
  as a struck-through fee + "FREE" in success green when threshold met).
- Surface `MIN_ORDER_NOT_MET` from a failed place-order with a toast that
  matches the strip's copy.

### Customer — `apps/customer/components/primary-store-hero.tsx`
The existing "Open / Closed" dot already reads from `store.isOpen`. No
change — but now the value is hours-driven, so the live indicator is real.
Optionally: when closed, add a small "Opens at 07:00" line under the
Closed pill. Trivial copy add.

---

## Cron — `auto-store-open-close`

```
*/15 * * * *  →  autoOpenCloseStores()
```

- Reads every `isActive=true` store with their `openTime`, `closeTime`,
  `manualClosed`, `isOpen`.
- Computes IST window match.
- Flips `isOpen` (guarded `updateMany`) when state differs and
  `manualClosed=false`.
- Emits the existing `store.opened` / `store.closed` events so the rest of
  the system (push notifications to owners on close, etc.) reacts.

**Behavioural edge cases:**
- New store with default 07:00–22:00 and `isActive=false` → cron skips (matches
  current discovery behaviour).
- Owner sets `manualClosed=true` during open hours → cron leaves `isOpen` alone.
- Owner sets `manualClosed=false` outside open hours → next cron tick closes
  the store automatically. UI shows pending state ("Will reopen at …") to
  keep the owner from being surprised.

---

## Tests

Per the established "test-first for commerce changes" rule.

### New test files
- `apps/backend/tests/store-config.test.ts`
  - `updateOwnStore` accepts all 5 new fields; radius cap is now 25k.
  - Cross-field rule: rejects `openTime === closeTime`.
  - Validation rejects malformed `"HH:MM"` strings.

- Append to `apps/backend/tests/orders.test.ts`
  - `placeOrder` applies fee correctly across three configurations:
    threshold=0 (always charge fee), subtotal<threshold (charge),
    subtotal≥threshold (free).
  - `placeOrder` rejects with `MIN_ORDER_NOT_MET` when subtotal below min.
  - Existing happy-path orders unchanged: defaults preserve old behaviour
    (fee=0, no min-order rejection).

- Append to `apps/backend/tests/cron.test.ts`
  - Auto-open-close cron flips a store from closed → open when current IST
    time falls inside its window.
  - Skips when `manualClosed=true`.
  - Handles crossing-midnight (open 21:00, close 01:00) correctly for both
    23:00 (inside) and 02:00 (outside) wall-clock test values.

### Existing tests stay green
The schema additions are defaulted, so existing fixtures continue to load.

---

## Reviewer pass

Per the IMPROVEMENTS doc's per-phase reviewer rule:

- `reviewer-data-integrity` on the migration (additive — confirm no
  destructive lines after the strip).
- `reviewer-authz` on the cron entrypoint + the `updateMine` extension
  (ownership unchanged but worth re-checking after schema add).
- `reviewer-concurrency` on `autoOpenCloseStores` — the guarded updateMany
  pattern needs to be right.

---

## Rollout

1. **PR 1 — Backend + contracts.** Schema, service, cron, error code,
   API types. Tests green against Neon. Reviewer subagents pass. Deploy
   to Railway; the cron is dormant until any store has `manualClosed=false`
   (already the default).
2. **PR 2 — Frontend.** Owner Settings cards, customer strip variant,
   cart bill row, hero "Opens at" line. Deploy each Vercel app.
3. **PR 3 — Docs.** `PROGRESS.md` row + commit-hash backfill of IP1.md.

Pattern matches Phases 7–11 (backend → frontend → docs).

---

## Deferred from this phase

- **Per-day-of-week hours** — owners can use `manualClosed` for one-off
  closures. Full DOW model lands later (IP-5 area or its own phase if owners
  request it).
- **Tiered delivery fees** — same model, would need its own data shape.
  No owner has asked.
- **Showing the delivery fee on `/v1/stores/nearby` cards** — the contract
  carries the data now, but the home page rendering of "₹30 below ₹200,
  free above" on each store card is a polish pass for after IP-1 lands.

---

## What this unlocks for later phases

- **IP-5 (slots)** can extend the hours model with cutoff times rather than
  inventing a new shape — same `openTime`/`closeTime` pattern, just
  per-slot.
- **IP-3 (geo)** will surface "delivers within 5 km" — the bumped 25 km cap
  is wide enough that the autocomplete-driven radius edit stays meaningful.
- **Cart pill / checkout** become trustworthy commerce surfaces — they show
  the real delivery cost, not a placeholder.
