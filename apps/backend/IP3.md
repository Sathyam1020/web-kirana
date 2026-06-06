# IP-3 — Geo UX with Google Maps

> Replace every raw lat/long input with address autocomplete. Reverse-
> geocode the customer's GPS so the location pill reads "near MG Road,
> Bengaluru" instead of "around 13.045, 77.752". First IP that integrates
> a paid external API — billing + key handling matter here.

---

## Why now

Today the customer location pill says "around 13.045, 77.752". The owner
onboarding asks for lat/long as a number pair. The customer address book
also takes raw coordinates. None of it survives any kind of usability bar
— customers can't read a coordinate, owners type wrong values, and there's
no human-readable address surfaced anywhere.

Variants (IP-2) are about catalog fidelity. Geo is about commerce ergonomics:
"deliver to my mom in Mumbai" is impossible without addressable locations.

---

## Locked decisions

### Vendor

- **Google Maps Platform** — best Indian coverage + best autocomplete
  ranking. Free tier (~28k geocodes + ~28k autocompletes / month + $200
  monthly credit) easily covers MVP-scale traffic; beyond that ~$5 per
  1000 calls. Already approved per the IMPROVEMENTS.md locked decisions.

### APIs to enable

- **Places API (New)** — `Autocomplete (New)` + `Place Details (New)`.
- **Geocoding API** — reverse lookup (`{lat, lng} → human address`).
- **Maps JavaScript API** — only when we ship the optional draggable
  map-pin refinement (deferred from this phase unless it's free to add).

### Key handling

- **Single public key** named `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
- **Restrict by HTTP referrer** to:
  - `https://customer.online-kirana.app/*`
  - `https://owner.online-kirana.app/*`
  - `http://customer.localhost:3000/*` + `http://owner.localhost:3000/*` for dev
- **API quota** capped low (5k autocomplete + 5k geocode / day) so a
  leaked key can't run up the bill.
- Stored in 1Password (canonical) + each Vercel project's env. The admin
  app doesn't get the key (admin never picks an address).
- Document in `apps/backend/README.md` how to rotate.

### Component shape

- **Shared `<AddressAutocomplete>`** lives in `packages/ui` so the
  customer add-address flow + owner store onboarding consume the same
  primitive. Same vibe as our existing shared `ImageUpload` /
  `BottomSheet`.
- Component contract is **`onSelect: (resolved: ResolvedAddress) => void`**
  where `ResolvedAddress` is `{ placeId, label, line1, city, pincode, lat, lng }`.
- It does **not** persist anything. Caller decides what to do with the
  result (POST to `/v1/addresses`, fill an onboarding form, etc.).

### Reverse-geocode

- Customer's current GPS → `"near MG Road, Bengaluru"`. The label is the
  *short* Google-formatted address; the structured pieces (`locality`,
  `sublocality`, `route`) drive whether we show "near X" or just "X".
- **Cached in localStorage** keyed by a coarse-rounded GPS (3 decimal
  places ≈ 100m grid) for 24h. Saves 95% of the Geocoding API spend.
- On cache miss → fetch + render the label. On API error → fall back to
  the existing coordinate display (no UI break).

### Customer location pill

- Reads from the new reverse-geocode hook.
- Tap on the pill opens the existing deliver-to picker (built later in
  IP-4). For IP-3 the tap behavior is unchanged.

### Owner store onboarding

- Address auto-complete is THE input. Lat/long becomes computed from
  the selected place, not a user-typed value.
- Existing `addressLine + city + pincode` form fields are pre-filled
  from the place details + remain editable (the owner often wants to
  refine "above Sharma sweets" etc.).

### Customer addresses

- Same component. Tied to `POST /v1/addresses` (existing endpoint, no
  backend changes for IP-3).
- "Home / Work / Other" label stays as a separate input next to the
  autocomplete.

### Bias

- Autocomplete biases to **(a)** the user's current GPS when known, else
  **(b)** India country bias. No global search — the marketplace is
  India-only.

---

## Backend — code touchpoints

**This is a frontend-heavy phase.** Backend changes are minimal:

### `apps/backend/src/lib/env.ts`
- No new env required — backend never talks to Google directly. The
  Maps key lives only on the frontends.

### `apps/backend/src/modules/addresses/addresses.schemas.ts`
- Optional: accept a `placeId?: string` on `createAddressBody` so we
  persist Google's place ID alongside lat/lng. Cheap to add; lets us
  re-resolve / dedupe later. Defer if it adds friction.

### `apps/backend/src/modules/stores/stores.schemas.ts`
- Same — optionally store `placeId` for the owner's store location.
  Defer.

**Net: zero required backend changes for IP-3.0.** The backend already
accepts lat/lng on every endpoint we need; the frontend just *computes*
those values from autocomplete instead of asking the user to type them.

---

## Frontend — shared primitive

### `packages/ui/src/lib/google-maps-loader.ts` (new)
- Singleton script loader. Lazy-injects the Google Maps JS API tag
  exactly once per page, regardless of how many `<AddressAutocomplete>`
  instances mount.
- Awaits `window.google.maps.places` before resolving its promise.
- Reads the key from `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` at call time.
- Throws a typed error if the key is missing (dev signal — never crashes
  prod silently).

### `packages/ui/src/components/address-autocomplete.tsx` (new)
- Wraps Google's **new Places Autocomplete (PlaceAutocompleteElement /
  AutocompleteSuggestion API)** rather than the deprecated dropdown.
- Renders our own input + suggestion list so the visual matches the
  design system. (Google's default UI is hideous and ignores tokens.)
- Bias: takes optional `currentLocation: { lat, lng } | null` prop +
  defaults to India country bias when absent.
- `onSelect` is the only commit point — selecting a suggestion fetches
  Place Details (one extra API call), parses the address components into
  the structured shape, then calls back.
- Loading + error states match the rest of the app's primitives.

### `packages/ui/src/lib/reverse-geocode.ts` (new)
- `reverseGeocode({ lat, lng }): Promise<ReverseResult | null>`.
- Uses the JS Geocoding service (cheaper than the REST endpoint because
  it rides the already-loaded Maps script). Falls back to the REST
  endpoint if the JS path isn't initialized.
- Returns `{ label: "MG Road, Bengaluru", components: {...} }`.
- Caches by coarse coords (3-decimal grid) in localStorage for 24h.
- Returns null on any error so callers don't have to try/catch.

---

## Frontend — call sites

### Customer

1. **`apps/customer/components/location-pill.tsx`** — Replace the
   coordinate-string label with the reverse-geocoded label. The hook
   `useLocationLabel(coords)` wraps `reverseGeocode` + cache + loading
   state. Falls back to "Set location" when no coords yet, or to the raw
   coords if the geocode call fails.

2. **`apps/customer/lib/location.ts`** — Already exposes the GPS coords.
   Add a `useResolvedLocation()` hook that combines coords + reverse
   geocode result.

3. **`apps/customer/app/(authed)/account/addresses/page.tsx`** — In the
   "Add new address" dialog, replace the existing latitude/longitude
   inputs with `<AddressAutocomplete>` (auto-fills `line1`, `city`,
   `pincode`, lat, lng all from one selection). Edit-address dialog
   gets the same treatment.

4. **`apps/customer/components/home-header.tsx`** — Wherever the
   location is shown, swap the label-rendering for the resolved one.

### Owner

5. **`apps/owner/app/onboarding/page.tsx`** — Replace the lat/lng
   numeric inputs with `<AddressAutocomplete>`. The selected place's
   `addressLine + city + pincode` pre-fill the existing form fields
   (still editable). The lat/lng values come from the place result.

6. **`apps/owner/app/(authed)/settings/page.tsx`** — Eventually add a
   "Change pinned location" affordance for stores already onboarded.
   Deferred to a follow-up; IP-3 ships the onboarding flow + customer
   pieces only.

---

## Tests

### Unit
- `reverse-geocode.ts` — mock the Google JS namespace, assert cache hit
  / miss / 24h expiry behavior. Pure logic, no live API.
- `address-autocomplete.tsx` — render-with-no-suggestions, simulate
  selection of a mocked suggestion, assert `onSelect` gets the expected
  shape. Use msw or a hand-rolled `window.google` stub.

### Manual
- End-to-end: load customer home → pill shows the human label.
- Open Add Address dialog → autocomplete suggestions appear → pick one →
  form fields pre-fill correctly → POST /v1/addresses succeeds.
- Throttle the Maps script (DevTools) and verify the input degrades
  gracefully — owner can still type the address by hand if Google is
  down or the key is missing.

### Cost smoke test
- After the staging deploy, watch the Google Cloud Console quota panel
  for 24h. If autocomplete spend tracks above our cached projection (≤500
  calls / 100 active customers / day), tighten the debounce + bias.

---

## Rollout

### Setup chunk (before any code)
1. Create the GCP project + enable the three APIs.
2. Create the API key + restrict it + cap the quota.
3. Add the key to customer + owner Vercel envs.
4. Add the key to 1Password.

### PR 1 — Shared primitive + customer pieces
- `google-maps-loader.ts` + `reverse-geocode.ts` + `<AddressAutocomplete>`.
- Customer location pill swap + Add Address dialog swap.
- Manual + unit tests green. Deploy to customer Vercel.

### PR 2 — Owner pieces
- Owner onboarding lat/lng → autocomplete.
- Deferred follow-up: owner Settings "Change pinned location".
- Deploy to owner Vercel.

### PR 3 — Docs + key rotation runbook
- `apps/backend/README.md` documents the env + how to rotate.
- Quick GCP-console screenshot in the runbook for the key restrictions
  page.

### Reversibility
- If the autocomplete misbehaves (suggestions wrong, key revoked), the
  components fall back to plain text inputs for `line1 / city / pincode`
  + the existing GPS coords. **No data path breaks** — placeId is purely
  additive metadata. Reverting is just a revert of the customer / owner
  diff.

---

## Deferred

- **Full-screen draggable map** for owner store pinning. The
  autocomplete + manual-edit fields cover MVP onboarding. Pin-on-card
  refinement lands in a follow-up.
- **placeId persistence** on Address + Store. Useful for analytics /
  dedupe but not load-bearing for the IP-3 UX.
- **"Change pinned location" on owner Settings.** Same autocomplete
  component, different mount point.
- **Per-customer search history** in the autocomplete (recently-picked
  places). Google supports it but the dedupe + storage is non-trivial.
- **Multi-language place names.** India autocomplete returns English by
  default; Hindi / Kannada / etc. is a "next phase" decision.

---

## Time + risk

- **Estimate: 4–5 working days.**
  - Day 1: GCP setup + script loader + reverse-geocode hook.
  - Day 2: `<AddressAutocomplete>` primitive + storybook-like manual page.
  - Day 3: Customer location pill + Add Address swap.
  - Day 4: Owner onboarding swap + docs.
  - Day 5: Manual QA + cost smoke test + rollback plan rehearsal.

- **Risk: MEDIUM.** No DB migration, no backend contract change. The
  risk is operational:
  - **Key leak**: mitigated by HTTP referrer restrictions + low daily
    quotas.
  - **Cost surprise**: mitigated by the 24h reverse-geocode cache + low
    daily quotas (which throw 429 long before they bankrupt us).
  - **Google rate-limits us mid-shop**: the component falls back to plain
    text inputs; the customer can still place orders.

---

## What this unlocks

- **IP-4 (Deliver-to picker — "Mom in Mumbai")** plugs straight into
  `<AddressAutocomplete>` for the "Add new address" flow inside the
  picker. IP-4 is mostly UX wiring on top of IP-3 primitives.
- **Future map-based store pinning** uses the same script loader.
- **Future restaurant-style "stores near you on the map"** view, if it
  ever lands, reuses the loaded Maps JS API instance.
