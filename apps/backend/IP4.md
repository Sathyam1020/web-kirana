# IP-4 — Deliver-to address picker ("Mom in Mumbai")

> Decouple "where I am" from "where this order goes." Customer in
> Bengaluru orders for Mom in Mumbai → app re-scopes nearby-stores +
> delivery + checkout to the Mumbai address, not the Bengaluru GPS.
>
> First IP that's pure customer UX on top of existing primitives —
> reuses IP-3's `<AddressAutocomplete>` + `<MapPinRefine>` for the
> "add a new address" flow inside the picker. Zero backend changes.

---

## Why now

After IP-3, the customer can save multiple addresses with precise pins.
But the home screen still discovers stores around the customer's *GPS*,
not around the *address they want delivered to*. The "Mom in Mumbai" use
case is broken: Mumbai stores never surface when the customer is
physically in Bengaluru.

The picker is also a foundation for IP-5 (delivery slots) — the slot
sheet needs to know which address it's quoting cutoffs for.

---

## Locked decisions

### Picker placement

- **Top bar pill on the customer home** (`HomeHeader`) — replaces the
  current `DeliverToPill` that just labels the location pill. The new
  pill reads `Deliver to · Home — MG Road ▼` (with a chevron). Tap →
  bottom sheet picker.

- Same pill is **also visible on the store detail page** + the cart +
  checkout. One canonical pill, mounted in `HomeHeader`-style sticky
  surfaces.

### Picker sheet content

A `BottomSheet` with three sections, top-to-bottom:

1. **"Use current location"** card (Navigation icon) — falls back to the
   customer's GPS coords + IP-3's reverse-geocoded label. Single tap →
   selected.
2. **Saved addresses list** — pulled from `/v1/addresses`. Each row:
   label ("Home", "Mom's house") + line1 + city/pincode. The currently-
   selected one has a green check + outlined border.
3. **"Add new address"** card at the bottom — opens the existing Add
   Address dialog (which we already redesigned in IP-3). On save, the
   new address auto-selects in the picker.

### State

- New Zustand slice `apps/customer/lib/delivery-context.ts`:
  - `selectedAddressId: string | null` (null = "use current GPS")
  - `selectedCoords: {lat, lng, label} | null` (denormalized for
    immediate UI use without a round-trip)
  - Persisted in localStorage under `kirana.delivery-context`.
- A `useDeliveryContext()` hook returns `{coords, label, isGPS,
  selectedAddressId, select, useCurrentLocation, refresh}`.

### Read sites that switch from GPS to picker

| File | Today reads from | After IP-4 reads from |
|---|---|---|
| `app/stores/page.tsx` (`/v1/stores/nearby`) | `useUserLocation` | `useDeliveryContext` |
| `app/stores/[id]/page.tsx` (store detail) | `useUserLocation` for distance | `useDeliveryContext` |
| `app/(authed)/checkout/page.tsx` | first address in `/v1/addresses` | `useDeliveryContext` (picker's selection becomes the default delivery address) |

GPS is still the default *fallback* when there are no saved addresses or
the user explicitly picks "Use current location."

### Switching invalidates queries

- Switching the picker calls `queryClient.invalidateQueries(["stores", "nearby"])`
  + clears any stale store-detail caches that depend on coords.
- Cart contents survive the switch (they're scoped to a store, not a
  delivery context), but if the cart's store doesn't deliver to the new
  address, the existing `OUT_OF_SERVICE_AREA` error at placement
  surfaces naturally.

### Sign-in gate

- Logged-out customers see the picker too, but only "Use current
  location" is available. The saved-addresses list shows a sign-in
  prompt. "Add new address" routes to login first.

---

## Backend touchpoints

**None.** The existing `/v1/addresses` GET endpoint already returns the
list. The existing `/v1/stores/nearby` already takes lat/lng. The
existing `/v1/orders` placement already takes an `addressId`. We're
just changing which UI value flows into those parameters.

---

## Frontend touchpoints

### New
- `apps/customer/lib/delivery-context.ts` — the Zustand slice + hook
- `apps/customer/components/deliver-to-picker.tsx` — bottom sheet picker
- `apps/customer/components/deliver-to-trigger.tsx` — the pill button
  that opens the picker (replaces the current `DeliverToPill`'s tap-
  to-request-location behavior with tap-to-open-picker)

### Touched
- `apps/customer/components/home-header.tsx` — mount the new trigger
  instead of the simple location pill
- `apps/customer/components/customer-bottom-bar.tsx` — when the cart has
  items but the user's still browsing, the pill stays visible there too
  if useful (low-priority polish; defer if scope creep)
- `apps/customer/app/stores/page.tsx` — read coords from
  `useDeliveryContext` instead of `useUserLocation` for the nearby query
- `apps/customer/app/stores/[id]/page.tsx` — same
- `apps/customer/app/(authed)/checkout/page.tsx` — pre-select the
  picker's address as the delivery target; user can still override
- `apps/customer/app/(authed)/account/addresses/page.tsx` — on add/edit,
  if the picker is currently using GPS, prompt to set the new address
  as the selected one ("Deliver future orders here?")

---

## UX flow

### First-time customer (no saved addresses)
1. Open home → picker pill says `Deliver to · Current location` (or
   `Pin your location` if GPS denied)
2. Tap the pill → sheet opens with "Use current location" auto-selected
   + an empty "No saved addresses yet" line + "Add new address" CTA
3. Customer taps "Add new address" → existing IP-3 dialog opens
4. Saves an address → sheet refreshes, new address auto-selected
5. Sheet closes → home re-queries `/v1/stores/nearby` with the new
   coords

### Returning customer with multiple addresses
1. Open home → picker pill says `Deliver to · Home — MG Road` (last
   selected, restored from localStorage)
2. Tap pill → sheet shows Home (checked), Office, Mom's house +
   Use current location + Add new
3. Pick "Mom's house" → sheet closes, home immediately re-queries +
   shows Mumbai stores

### Cart-mid-flow switch (edge case)
1. Customer adds items from a Bengaluru store
2. Switches the deliver-to picker to a Mumbai address
3. Cart pill stays visible (items are store-scoped, not picker-scoped)
4. Customer hits checkout → backend rejects with `OUT_OF_SERVICE_AREA`
   because the Bengaluru store doesn't deliver to the Mumbai address
5. The existing IP-1 error handler surfaces the toast + bounces to /cart

---

## Tests

### Manual
- Switch the picker, verify `/v1/stores/nearby` re-fires (DevTools
  Network)
- Restart the app, verify the last-selected address is restored from
  localStorage
- Sign out + reopen — verify GPS-only mode without saved-address UI
- Empty saved-addresses state — verify "Add new address" works inline

### Unit
- `delivery-context.ts` slice: `select`, `useCurrentLocation`, hydration
  from localStorage (with a stale `selectedAddressId` that no longer
  exists server-side → falls back to GPS)

### Regression
- Existing cart + checkout flow still places orders correctly
- Existing `/v1/stores/nearby` cache invalidation doesn't double-fire

---

## Rollout

### PR 1 — Picker primitive + state + home wire-in
- `delivery-context.ts` + `deliver-to-picker.tsx` + `deliver-to-trigger.tsx`
- `home-header.tsx` swap
- `app/stores/page.tsx` consumes context
- Manual + unit tests green. Deploy.

### PR 2 — Store detail + checkout consumers
- `app/stores/[id]/page.tsx` distance + ETA reads context coords
- `app/(authed)/checkout/page.tsx` pre-selects the picker's address
- `app/(authed)/account/addresses/page.tsx` post-add prompt

### PR 3 — Docs + PROGRESS.md row

### Reversibility
- All changes are additive. If the picker misbehaves, the
  `useDeliveryContext` hook can fall back to `useUserLocation`
  internally — surface stays unchanged.

---

## Deferred

- **Per-address ETA in the picker** ("Mom's house · 25 min away vs
  Office · 12 min away"). Needs a /v1/stores/nearby call per address;
  too expensive for MVP. Could land as a follow-up if customers ask.
- **Map preview in the picker** showing each saved address as a pin.
  Adds another `<MapPinRefine>`-shaped component; low ROI for MVP.
- **Renaming the saved address inline from the picker** ("Office" →
  "Bengaluru office"). Quick polish, deferrable.
- **"Use this for future orders" remember toggle** — for now we
  always remember; the user can override by re-picking.

---

## Time + risk

- **Estimate: 2–3 working days.**
  - Day 1: Zustand slice + picker sheet + trigger pill + home wire-in
  - Day 2: Store detail + checkout consumers + edge-case toggles
  - Day 3: Manual QA + edge cases (logged-out, no addresses, stale
    selected-id, cross-region switch)

- **Risk: LOW.** No DB, no backend contract, no migration. Reuses
  IP-3 primitives. Failure mode is "picker doesn't work, falls back to
  GPS" — which is exactly the pre-IP-4 behavior.

---

## What this unlocks

- **IP-5 (delivery slots)**: the slot sheet's `Store + Address` ETA
  computation needs to know which address the customer is targeting.
  `useDeliveryContext` is the answer.
- **Per-store-delivers-to-this-address indicator**: when a saved address
  is outside every nearby store's radius, surface a "No stores deliver
  to this address" empty state instead of "No stores nearby."
- **Address-level analytics**: which addresses get the most orders;
  detectable downstream after IP-4 because the picker writes to a
  consistent slice.
