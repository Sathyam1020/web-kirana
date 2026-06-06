# IP-6 — Permissions onboarding flow

> One-time post-signup screen that asks for **location** + **push
> notifications** upfront, instead of forcing users to discover those
> toggles buried inside Settings.
>
> Zero backend changes. Pure customer/owner UX layer on top of the
> primitives we already shipped in IP-3 (`useUserLocation`,
> `reverseGeocode`) and the existing `useWebPush` notifications hook.

---

## Why now

For the imminent live launch, every retention lever matters. Customers
who never share location see "Where are you?" forever. Customers who
never opt into push miss "Out for delivery" alerts. Owners who never
opt into push miss new-order alerts (which is the worst case — they
lose money). IP-6 makes both *the first thing the user sees* instead
of buried hygiene.

Per your "ship ASAP with minimal features" directive — IP-6 stays
focused on the **two highest-ROI permissions** (location + push) and
defers everything else (in-app tour, feature highlights, etc.) to a
later polish phase.

---

## Locked decisions

### Surface
- **Full-screen bottom sheet** on the customer + owner home, mounted
  in each app's `(authed)` layout (or `app/layout.tsx` for the owner
  if it doesn't have a `(authed)` group).
- Opens automatically on first authed visit. Dismissible — both
  permissions are individually skippable.
- Triggered when `localStorage["kirana.onboarding.completed"]` is
  unset.

### Two cards, two CTAs
Stacked vertically inside the sheet:

1. **"Stay in your delivery zone"** (📍)
   - Subtitle: "We'll show kirana stores delivering to your address."
   - CTA: `Allow location` → calls `requestLocation()` from
     `useUserLocation`.
   - On grant → reverse-geocode + commit to delivery context
     (IP-4 path). Card switches to a green "✓ Done — *Brookefield,
     Bengaluru*" confirmation.
   - On deny → card shows "Skipped — you can enable this anytime in
     Settings."

2. **"Get live order updates"** (🔔)
   - Subtitle: "Know when your order's accepted, out for delivery,
     and delivered."
   - CTA: `Allow notifications` → calls
     `Notification.requestPermission()` then
     `useWebPush.subscribe()`.
   - On grant → green confirmation.
   - On deny → "Skipped" footer state.

3. **"Done" button** at the bottom — always present. Tap closes the
   sheet and writes the `localStorage` flag whether or not permissions
   were granted. Skipping is a valid outcome.

### Owner variant
Same component, different copy:
- Card 1 copy: "Where's your store?" + "We'll center deliveries on
  this point." (the owner already pinned this during signup, so this
  card may be HIDDEN for owners — only show if their store record has
  no lat/lng for some reason).
- Card 2 copy: "Hear new orders the moment they arrive" + "Critical
  for orders that need to be accepted in 5 mins."
- Same skip/Done behavior.

### Don't re-prompt logic
- localStorage flag check happens on every authed mount of the
  home/inbox layout.
- If the user clears site data, they see it again — that's fine, it's
  a useful re-onboarding.
- If they sign out + back in on the same device → don't re-prompt
  (flag persists). If they sign in on a *different* device, they see
  it again — also fine.

---

## Frontend touchpoints

### New
- `apps/customer/components/onboarding-sheet.tsx` — the bottom sheet
  with the two permission cards.
- `apps/customer/lib/onboarding.ts` — tiny hook
  `useOnboarding()` returning `{shouldShow, dismiss}` driven by
  localStorage. Exposes `onboarding.completed` flag write helper.
- `apps/owner/components/onboarding-sheet.tsx` — owner equivalent
  with adjusted copy (or a single shared component in `packages/ui`
  if scope justifies it — leaning toward per-app for the launch
  speed).
- `apps/owner/lib/onboarding.ts` — owner mirror.

### Touched
- `apps/customer/app/(authed)/layout.tsx` — mount the sheet, gated
  by `useOnboarding().shouldShow`.
- `apps/owner/app/(authed)/layout.tsx` (or equivalent root) — same.

### Existing primitives reused (no changes)
- `useUserLocation()` from `apps/customer/lib/location.ts` —
  permission request + geolocation read.
- `reverseGeocode()` from `packages/ui/src/lib/reverse-geocode.ts` —
  coords → label.
- `useDeliveryContext()` from `apps/customer/lib/delivery-context.ts`
  — commits the resolved coords as the default delivery target.
- `useWebPush()` from wherever it currently lives in the customer +
  owner apps — `subscribe()` after permission grant.

---

## UX flow

### First-time customer signup
1. Sign up → land on `/stores`
2. `(authed)/layout.tsx` reads `useOnboarding().shouldShow` → true
3. Sheet slides up after a ~300ms delay (lets the home paint first)
4. Customer taps "Allow location" → native browser prompt → grants
   → coords resolve → reverse-geocode → ctx.useGPS() committed →
   card flips to "✓ Done — Brookefield, Bengaluru"
5. Customer taps "Allow notifications" → native browser prompt →
   grants → useWebPush.subscribe() → "✓ Done" state
6. Customer taps "Done" → sheet closes, localStorage flag written,
   never seen again on this device

### Decline-both path
1. Customer hits "Done" without tapping either card → sheet closes,
   flag written, app still works (no location = "Where are you?"
   empty state on the home; no push = no live order alerts but
   in-app order tracker still works)

### Mixed path
1. Allow location, skip notifications → flag written; can re-enable
   notifications later from Settings (existing toggle)
2. Skip location, allow notifications → same in reverse

---

## Tests

### Manual
- New customer signup → sheet appears, both grants work, flag
  persists across reload
- Existing customer (flag set) → no sheet on reload
- Decline both → app works, no errors, flag persists
- Clear site data → sheet reappears
- Owner signup → owner-flavored copy, both grants work

### Unit
- `useOnboarding` hook: returns true on first call, false after
  `dismiss()`, idempotent

### Manual cross-browser
- Chrome (desktop + Android)
- Safari (iOS) — note Safari quirks around Notification.permission
  on first-tap-to-prompt

---

## Time + risk

- **Estimate: half a working day.** It's a small component + a hook +
  two mounts.
- **Risk: VERY LOW.** Uses primitives we've already shipped. The
  failure mode is "sheet doesn't appear" → user discovers permissions
  the old way (via Settings) → no degradation.

---

## What this unlocks for the launch

- Customers actually get push for "Out for delivery" instead of
  silently missing it → repeat-order rate up
- Owners get push the moment an order arrives → faster acceptances,
  less abandonment
- Location-up-front means the home actually has data to show on
  first visit instead of the "Where are you?" empty state → less
  drop-off

---

## Deferred (not in IP-6)

- **Multi-step product tour** (highlight cart, deliver-to picker,
  etc.). Defer to IP-7 polish.
- **Address pre-fill from city/IP geo guess** for users who deny
  GPS. Defer.
- **Notifications upsell at strategic moments** (e.g., banner after
  first order placed). Defer.
- **Owner WhatsApp opt-in** — already exists in owner settings; not
  in onboarding scope.

---

## Open questions to confirm before I start

1. **Sheet vs full-screen modal?** I'm proposing a bottom sheet
   (consistent with the rest of the customer app). If you'd rather
   it be a full-screen welcome page that the user dismisses, say so
   — that's ~2 hours of extra work.
2. **Owner gets it too?** Default yes per IMPROVEMENTS.md but worth
   confirming for launch scope.
3. **Delay before showing?** Default 300ms after page paint so the
   home isn't slammed by a sheet before the user sees what's
   underneath. Acceptable?
