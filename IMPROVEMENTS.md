# Kirana — Improvements Plan

Successor planning doc to `apps/backend/PROGRESS.md`. Where PROGRESS tracked
the build of the v1 MVP through Phase 11, this tracks the next round of
improvements after the production deploy.

Each numbered **Improvements Phase (IP-N)** is an independently shippable
chunk with its own PR / commit set / deploy. They are ordered by:

1. Risk (smallest first → biggest after confidence is built).
2. Dependency (later phases assume earlier ones are in place).
3. User-visible impact (each phase should land a feature owners/customers can feel).

> **Validate this plan independently** before approving — paste it into a new
> Claude/ChatGPT session for a sanity check. Look especially at the schema
> migrations (variants is the riskiest) and the cross-feature dependencies.

---

## Context for a fresh reader

- **Product:** kirana marketplace. Three frontends — customer (PWA), owner (PWA),
  admin (web) — calling one backend.
- **Stack:** Turborepo + npm workspaces · Next.js 15 · Express 5 · Prisma 7 ·
  Neon Postgres (PostGIS + pg_trgm) · better-auth (cookie sessions) ·
  Socket.IO (live order updates) · node-cron (auto-cancel + WA retry +
  availability reset) · web-push + WhatsApp Cloud API · Cloudinary.
- **Hosting:** Railway (backend, single instance) + Vercel (3 Next.js apps) +
  Neon (Postgres). Custom domain `backend.sathyam.xyz` for the backend.
- **Read before changing things:** `apps/backend/PROGRESS.md` (build history +
  gotchas), `DEPLOY.md` (runbook), phase docs `PHASE7.md`…`PHASE11.md`
  (per-phase design).

---

## Locked decisions (from product conversation)

- **Geocoding:** Google Maps Platform (Places Autocomplete + Geocoding + Maps
  JS). MVP fits in the free tier (~28k geocodes + ~28k autocompletes / month
  + $200 monthly credit). Plan for ~$5 per 1000 calls beyond.
- **Delivery slots:** same daily slots for every day of the week + an "ASAP"
  option. No per-day-of-week complexity.
- **Delivery fees:** flat fee + free-above-threshold model. No tiered.
- **Notification reliability:** web push stays primary; customer WhatsApp
  added as fallback (already have infra). No SMS for now.
- **Online payments (UPI / Razorpay):** out of scope this round. Revisit
  later as its own improvements phase.
- **Design language:** Blinkit-style polish — bold motion, professional copy,
  consistent spring physics. Customer-facing visual quality bar is "feels
  premium and emotionally warm, never decorative." Mockups designed and
  reviewed for Home, Categories, Orders, Account, and Delivery slots;
  rebuild before functional work resumes.
- **Color palette: USE `packages/ui/src/styles/globals.css` AS-IS.** The
  mockups (in `docs/design/`) were generated with green accents for
  visual storytelling — **do NOT copy those colors**. The real app uses
  the Airbnb-inspired palette already in `globals.css`: Rausch red
  `#ff385c` as the single accent, pure white `#ffffff` canvas, near-black
  `#222222` ink, 8px button radius, 14px card radius, one shadow tier.
  Mockups inform **layout, hierarchy, motion, and interaction**, not color.
- **Motion stack:** `motion/react` everywhere; standard tween curve
  `[0.16, 1, 0.3, 1]`; spring sets (`tap`, `sheet`, `route`) centralized in
  `packages/ui/lib/motion.ts`. `useReducedMotion` honored globally.

---

## Design references (mockups in `docs/design/`)

Reviewed mockups that the Design Phase rebuilds against. **Remember: colors
are illustrative only — implementation uses `globals.css` (Rausch palette).**

| Mockup | File | Covers | Consumed by |
|--------|------|--------|-------------|
| Home / Stores discovery (8 states) | [`docs/design/home.png`](docs/design/home.png) | Default, loading skeleton, new-user empty, no-stores-in-zone, store-closed, OOS card, switch-store warning, choose-a-store sheet, variant selector future | DP-1, DP-2 |
| Categories (7 states) | [`docs/design/categories.png`](docs/design/categories.png) | Cross-store discovery, skeleton, no-stores-in-zone, drilldown all/sub-category, empty category, search within category | DP-2 |
| Orders (8 states) | [`docs/design/orders.png`](docs/design/orders.png) | Default mix, skeleton, new-user empty, live-tracking with map + stepper, cancelled detail, reorder dialog 3 cases, order detail legacy, multiple active orders | DP-3 |
| Account (12 frames) | [`docs/design/account.png`](docs/design/account.png) | Logged-in, edit profile, saved addresses, add-address map, favorite stores, notifications, offers/coupons, help, about, logout dialog, skeletons, not-logged-in | DP-4 |
| Delivery slots integration (9 frames) | [`docs/design/delivery-slots.png`](docs/design/delivery-slots.png) | Home + Store + Cart + Orders with ASAP / scheduled toggle, slot bottom sheet, scheduled tracking, other-stores-with-slots, no-slots-available | DP-1 (toggle), DP-3 (cart + scheduled), IP-1 (min order field), IP-5 (the feature itself) |

The Orders + Account evaluations also flagged fixes that are baked into
the relevant DP-N scopes (cancel-only-on-PLACED, typo fix, hidden email
section, etc.).

---

## Working principles for all phases

- **Additive migrations only**, with backfill scripts where needed. Never
  break existing rows. Variants migration is the most invasive — backfill is
  mandatory and tested locally on a Neon snapshot before prod.
- **Backwards-compatible API surface** where reasonable. If a contract changes,
  use deprecation (mark old fields optional, keep them populated for one phase).
- **One phase = one shippable chunk**: typically three commits — backend +
  contracts, frontend, docs + PROGRESS hash backfill. Established pattern from
  Phases 7–11.
- **Test-first for commerce changes**: anything touching cart / checkout /
  order placement / lifecycle gets new Vitest cases before merge.
- **Production validation per phase**: per-file tests green against Neon +
  `turbo build` clean + a reviewer-* subagent pass on any new server entry
  points (mirrors Phase 7–11 workflow rule).
- **Single-instance constraints preserved**: cron + sockets + ticket store +
  rate-limit memory all stay in-process. The "move to Redis" work is its own
  later phase (after we outgrow one Railway instance).
- **Each phase doc lands as `apps/backend/IP{N}.md`** with the locked decisions,
  schema diffs, and deferred items — mirroring the `PHASE7.md` etc. pattern.

---

## Phase index

### Design phase (DP-0 → DP-5) — customer-facing visual + motion rebuild

| #     | Title                                      | Risk    | Est. time |
|-------|--------------------------------------------|---------|-----------|
| DP0   | Design system + motion foundation          | Low     | 2–3 days  |
| DP1   | Home / Stores discovery redesign           | Medium  | 4–5 days  |
| DP2   | Categories + Store detail redesign         | Medium  | 3–4 days  |
| DP3   | Cart + Checkout + Orders redesign          | Medium  | 4–5 days  |
| DP4   | Account redesign                           | Low     | 2–3 days  |
| DP5   | Motion polish pass (top 5 interactions)    | Low     | 2–3 days  |

**Design phase total: ~17–23 working days (≈3–5 weeks).**

### Functional improvements (IP-1 → IP-7) — built on the new design language

| #     | Title                                      | Risk    | Est. time |
|-------|--------------------------------------------|---------|-----------|
| IP1   | Store config trio (fees + radius + hours)  | Low     | 1–2 days  |
| IP2   | Product variants                           | High    | 4–6 days  |
| IP3   | Geo UX with Google Maps                    | Medium  | 4–5 days  |
| IP4   | Deliver-to address picker ("Mom in Mumbai")| Low     | 2–3 days  |
| IP5   | Delivery time slots                        | Medium  | 3–4 days  |
| IP6   | Permissions onboarding flow                | Low     | 1–2 days  |
| IP7   | Customer WhatsApp + UX polish              | Low     | 2–3 days  |

**Functional phase total: ~17–25 working days (≈3–5 weeks).**

**Grand total: ~34–48 working days (≈7–10 weeks).**

---

## DP-0 — Design system + motion foundation

The foundation every other Design Phase consumes. Motion primitives +
missing component primitives — no end-user-visible screens shipped here.
Lands first so every subsequent phase has the same vocabulary.

> **Note on tokens:** Most design tokens (color, radii, shadows, spacing,
> type) **already exist** in `packages/ui/src/styles/globals.css`
> (Airbnb-inspired: Rausch `#ff385c` primary, pure white canvas, near-black
> ink, 8px button radius, 14px card radius, one shadow tier). DP-0 does
> NOT redefine tokens — it audits + locks them and adds anything missing.

### Scope

- **Token audit pass** on `packages/ui/src/styles/globals.css`:
  - Verify the existing palette covers every state used across mockups
    (success, warning, info — currently only `destructive` exists as a
    semantic state; may need a `success` token for "Verified" pill, etc.).
  - Confirm radii match mockup usage (chips, cards, pills, modals).
  - Confirm dark mode has matching values for any new tokens.
  - **No color changes** to the existing tokens; only additive new ones.
- **Motion primitives** (`packages/ui/src/lib/motion.ts`):
  - `springs.tap` — `{ type: 'spring', stiffness: 400, damping: 30, mass: 0.6 }`
  - `springs.sheet` — `{ type: 'spring', stiffness: 300, damping: 35, mass: 1 }`
  - `springs.route` — `{ type: 'tween', duration: 0.22, ease: [0.16, 1, 0.3, 1] }`
  - `useReducedMotion` re-export from `motion/react` + a `useMotionPreset`
    hook that swaps to instant transitions when reduced motion is on.
- **Button primitive** (`packages/ui/src/components/button.tsx`) — extend
  with the 5 states:
  - `idle` (current)
  - `pressed` (scale-down via `whileTap` + opacity drop)
  - `loading` (spinner replaces label; width preserved to prevent CLS)
  - `success` (checkmark animation; auto-revert to idle after 1.2s)
  - `disabled` (existing)
  - Single API: `<Button state="loading">` or `<Button loading>` ergonomic.
- **Bottom sheet primitive** (`packages/ui/src/components/bottom-sheet.tsx`):
  - Drag-to-dismiss with elastic resistance.
  - Backdrop fade + content spring-up using `springs.sheet`.
  - Reduced-motion fallback: instant.
  - Used by deliver-to picker, cart, address picker, logout confirm, etc.
- **Toast system** (`packages/ui/src/components/toaster.tsx`):
  - Stackable (max 3 visible).
  - Icon slot (success/error/info).
  - Auto-dismiss + swipe dismiss.
  - Reuse existing `sonner` or `radix-toast` if already wired; otherwise
    pick one and standardize.
- **Skeleton primitive** — already exists; confirm shimmer + add the staggered
  appearance helper (`<SkeletonStack delay={0.04} />`).
- **Image primitive** with blur-up placeholder (Next.js `Image` wrapper with
  consistent fade-in behavior).
- **Layout-shift discipline doc** (`packages/ui/MOTION.md`) — codifies:
  - Skeletons must match content dimensions.
  - Quantity steppers reserve width for 2-digit counts.
  - Animations never block input (tap-down registers immediately, animation
    decorates).
  - Honor `prefers-reduced-motion: reduce`.

### Code touchpoints

- `packages/ui/src/lib/motion.ts` (new).
- `packages/ui/src/components/button.tsx` (extend states).
- `packages/ui/src/components/bottom-sheet.tsx` (new).
- `packages/ui/src/components/toaster.tsx` (new or standardize).
- `packages/ui/src/components/image.tsx` (new wrapper).
- `packages/ui/MOTION.md` (new doc).
- `packages/ui/src/styles/tokens.css` (tokens consolidated).

### Tests

- Storybook stories for each button state, sheet open/close, toast stack.
- Manual: toggle "Reduce motion" in OS settings, verify animations switch off.

### Deferred

- Haptics layer — added in Capacitor phase (post-IP-7).
- Shared-element transitions — added in DP-5 once stable on motion/react.

---

## DP-1 — Home / Stores discovery redesign

Rebuild `apps/customer/app/stores/page.tsx` to match the reviewed Home
mockup. This is the entry point; sets the tone for everything else.

**Reference:** [`docs/design/home.png`](docs/design/home.png) (default,
skeleton, new-user empty, no-stores empty, store-closed, OOS card,
switch-store warning, choose-a-store sheet, variant selector preview).
Slot-aware Home variant in [`docs/design/delivery-slots.png`](docs/design/delivery-slots.png) frame A — the "Deliver now / Schedule delivery" toggle
slot is reserved here but **wired in IP-5**, not DP-1.

> **Color override reminder:** the mockup uses green accents; implement
> with the Rausch palette already in `globals.css`. CTAs use
> `var(--primary)` (Rausch), not green. "Free delivery" pills use
> `var(--surface-soft)` neutrals, not green.

### Scope

- **Sticky header** with brand, deliver-to selector (placeholder until IP-4
  ships the real picker), search bar, account icon.
- **Search bar** on focus expands; search icon morphs into back arrow;
  navigates to `/search`.
- **Category grid** — 8 large square tiles (Atta & flour, Snacks, Dairy,
  Vegetables, Cleaning, Personal care, etc.) with brand-warm illustrations.
  Tile tap scales down + transitions into category page (DP-2).
- **Promo carousel** (auto-scroll every 4s, progress dots, rubber-band swipe
  on touch). Sources from existing `featured` flag or new `Promotion` model
  if needed (defer model; for DP-1 hardcode 2-3 promos).
- **Store rails** — horizontal-scrolling rails titled "Nearby kiranas",
  "Open now", "Top rated near you." Each rail uses snap scroll + lazy image
  fade-ins.
- **Store cards** — image, name, rating, distance, ETA, "Open" / "Closed"
  pill. Tap → store page.
- **Floating cart pill** — slides up from bottom-nav area when first item
  added. Count bounces; price crossfades on update. Persists across route
  transitions via `layoutId`.
- **Pull-to-refresh** — disabled for MVP web (recommend in spec); revisit
  for Capacitor.
- **Skeletons** — staggered fade-in matching final layout; no hard swaps.

### Code touchpoints

- `apps/customer/app/stores/page.tsx` — full rewrite.
- `apps/customer/components/category-grid.tsx` (new).
- `apps/customer/components/promo-carousel.tsx` (new).
- `apps/customer/components/store-rail.tsx` (new).
- `apps/customer/components/store-card.tsx` — visual refresh.
- `apps/customer/components/cart-pill.tsx` (new — extracted to a layout-level
  component above route boundaries).
- `apps/customer/app/(authed)/layout.tsx` — mount cart pill at layout.

### Tests

- Manual: tap each interaction, verify motion respects reduced-motion.
- Visual snapshot via screenshot diff (optional, manual for MVP).

### Deferred

- Real promo carousel CMS (admin-managed). Hardcode for DP-1.
- Personalized rails ("Reorder from your stores"). Comes after DP-3.

---

## DP-2 — Categories + Store detail redesign

The two screens a customer hits between "Home" and "Add to cart." Bundled
because they share the same product card + quantity stepper.

**References:**
- [`docs/design/categories.png`](docs/design/categories.png) — all 7
  category states (cross-store discovery, drilldown, sub-category drilled,
  empty, search within).
- [`docs/design/home.png`](docs/design/home.png) frames E (out-of-stock
  card), F (switch-store warning), G (choose-a-store sheet), H (variant
  selector future).
- [`docs/design/delivery-slots.png`](docs/design/delivery-slots.png)
  frame B — store page with slots/cutoff info (slot wiring deferred to
  IP-5; layout slot reserved in DP-2).

> **Color override reminder:** "Free delivery above ₹199" tags and active
> filter chips use Rausch / ink, not green. Quantity stepper `+` / `−`
> use ink on white, not green.

### Scope — Categories page

- **Department drilldown** — tap a Home category tile → vertical list of
  sub-categories or stores carrying that category.
- **Filter chips** — "Open now", "Free delivery", "Under 30 min"; sliding
  active pill animation; auto-scroll to selected chip.
- **Store list** — same store card as Home, but stacked vertical with more
  info (last-ordered timestamp if applicable, popular items pill).
- **Search-within-category** — top input, expand animation, recent searches
  fade-in.
- **Empty state** — illustration fade-in + delayed CTA appearance.

### Scope — Store detail page

- **Sticky category tabs** at top with sliding underline.
- **Product image loading** — blur-up placeholder → sharp fade.
- **Quantity stepper** — `+` button morphs into `[− 1 +]` stepper with
  spring (120–180ms). Optimistic update; cart pill updates simultaneously.
- **Variant chips** (placeholder until IP-2 ships variants — for DP-2 just
  reserve the slot in the design and render "default" if no variants).
- **Out-of-stock state** — greyed out card + "Notify me" button placeholder
  (notify functionality deferred to post-IP-7 polish).
- **Scroll behavior** — header compresses on scroll; sticky search transition.

### Code touchpoints

- `apps/customer/app/categories/page.tsx` — rewrite.
- `apps/customer/app/stores/[id]/page.tsx` — rewrite.
- `apps/customer/components/product-card.tsx` — quantity stepper morph + OOS
  treatment.
- `apps/customer/components/quantity-stepper.tsx` (new, reusable).
- `apps/customer/components/filter-chips.tsx` (new).

### Tests

- Manual: add 3 items rapidly, verify cart pill never drops a tap.
- Manual: verify quantity stepper width doesn't shift between 0/1/10/99.

### Deferred

- Actual variant chips wired to data — needs IP-2.
- Notify-when-back-in-stock — separate post-IP-7 work.

---

## DP-3 — Cart + Checkout + Orders redesign

The "anxiety triangle" — where customers worry whether the order actually
went through. Three screens, bundled because they share the same trust
patterns (progress, transparency, recovery).

**References:**
- [`docs/design/orders.png`](docs/design/orders.png) — all 8 order states
  (default mix, skeleton, new-user empty, live-tracking with map + stepper,
  cancelled detail, reorder dialog 3 cases, order detail legacy, multiple
  active orders).
- [`docs/design/delivery-slots.png`](docs/design/delivery-slots.png)
  frames C (cart/checkout with slot selection radio), D (orders with
  scheduled view), G (scheduled order tracking detail). Slot **wiring**
  lands in IP-5; DP-3 reserves the layout slots only.

> **Color override reminder:** the green "Reorder" / "Track order" / "Place
> order" CTAs in the mockup → use `var(--primary)` (Rausch red). The red
> "Replace cart" / "Cancel order" buttons → use `var(--destructive)`
> (already darker / more saturated than Rausch — distinct from primary).
> Progress stepper active state → ink-filled, not green.

### Scope — Cart

- **Bottom-sheet cart** spring-up from cart pill.
- **Line items** with quantity stepper inline + remove button (visible × +
  swipe gesture for mobile).
- **Free-delivery progress bar** — "Add ₹X more for free delivery"; animated
  fill when crossing thresholds.
- **Subtotal + delivery + total** with smooth number transitions on update.
- **Checkout CTA** — sticky bottom; subtle pulse when active.
- **Empty cart state** — illustration fade-in + cart icon bounce.

### Scope — Checkout

- **Delivery address card** — shows selected address; tap to switch (opens
  address picker bottom sheet — DP-3 stubs; IP-3/IP-4 wire real autocomplete).
- **Order summary card** — items collapsed by default, expandable.
- **Bill breakdown** — item total, delivery fee, discount (if coupon),
  total to pay. Smooth row enter/exit on coupon apply.
- **Coupon input** — collapsible; success animation on valid code.
- **Payment method** — COD only for now; design slot for online payment
  added when that phase lands.
- **Place order CTA** — primary green; loading → success morph (button
  primitive from DP-0).

### Scope — Orders

Rebuild based on the 8-state mockup reviewed earlier. All 8 states:

- **Default** (active + past orders, grouped by month).
- **Loading skeleton.**
- **New-user empty state.**
- **Live-tracking expanded view** with map + vertical progress stepper +
  pulsing live dot.
- **Cancelled/rejected order detail** with empathetic banner + "Reorder
  from another store" CTA.
- **Reorder confirmation dialogs** — 3 cases (empty cart, same store, diff
  store with replace warning).
- **Order detail (single order)** with progress, items, bill, address.
- **Multiple active orders** — stacked active cards + expanded cart pill.

**Critical fix from Orders evaluation:** "Cancel order" button is **only**
shown when `status === PLACED`. Past PLACED, replace with "Need help?
Contact store" link.

### Code touchpoints

- `apps/customer/app/(authed)/cart/page.tsx` — bottom-sheet rewrite.
- `apps/customer/app/(authed)/checkout/page.tsx` — rewrite.
- `apps/customer/app/(authed)/orders/page.tsx` — rewrite with all 8 states.
- `apps/customer/app/(authed)/orders/[id]/page.tsx` — order detail + live
  tracking.
- `apps/customer/components/order-progress.tsx` (new — used in card + detail).
- `apps/customer/components/reorder-dialog.tsx` (new — handles 3 cart cases).
- `apps/customer/components/live-tracking-map.tsx` (placeholder until
  rider GPS streaming lands; static "rider somewhere along route" for now).

### Tests

- Manual: cancel button hides after Accepted status (verify against backend
  status enum).
- Manual: reorder dialog correctly detects empty/same-store/diff-store
  cart state.
- Existing Vitest order tests stay green.

### Deferred

- **Rider visibility** (name, photo, phone) — needs Riders phase (7.5).
- **Order rating prompt** post-delivery — post-IP-7 polish.
- **Animated rider marker on map** — needs real GPS streaming.
- **Confetti on first delivered order** — DP-5 polish if budget allows.

---

## DP-4 — Account redesign

12-frame mockup reviewed; mostly ship-ready. Bundled small but high-value.

**Reference:** [`docs/design/account.png`](docs/design/account.png) — all
12 frames (default logged-in, edit profile, saved addresses, add address
map, favorite stores, notifications settings, offers & coupons, help &
support, about / legal, logout confirmation, loading skeletons, not-logged-in).

> **Color override reminder:** the green "Save changes", "Add new address",
> "Sign in", and "Save address" CTAs → use `var(--primary)` (Rausch).
> Toggles in the ON state → `var(--primary)`. The red "Delete address"
> and "Log out" → `var(--destructive)`. "Verified" badges, success toasts,
> and star icons → if no `--success` token exists yet, DP-0 adds one;
> otherwise use `var(--primary)` as a temporary stand-in for "verified"
> state (matches Airbnb's pattern of using Rausch for verified).

### Scope

- **Profile card** — avatar, name, phone (verified pill), email; tap to
  Edit profile.
- **Stat row** — "12 orders / 3 favorites / ₹3,420 saved" — each tappable;
  saved subtext: "saved with coupons" (start at ₹0 for new users; compute
  from real coupon usage on `Order`).
- **Menu list** — Saved addresses → Favorite stores → **Order history** →
  Offers & coupons → Notifications → Preferences (language + theme stubs)
  → Invite friends (placeholder) → Help & Support → About → Log out.
- **Edit profile screen** — name + email free-edit; phone is **tap-to-
  change** opening re-verify flow, not free-text.
- **Saved addresses** — list + Add new (opens address picker; full Google
  Maps autocomplete lands in IP-3).
- **Favorite stores** — list; empty illustration only shown when list is
  empty (fix from Account evaluation).
- **Notifications settings** — grouped by channel. **Hide Email section
  for MVP** (no email infra yet); add when email lands.
- **Offers & coupons** — fix typo ("Offers & coupons"); "Use now" copies
  code + navigates Home with toast.
- **Help & Support** — search bar wired to static FAQ for MVP; WhatsApp /
  Email escalation real.
- **About** — version, T&C, Privacy, OSS licenses, Share app.  **Hide
  "Rate us on Play Store"** until Capacitor ships.
- **Logout confirmation** + skeletons + not-logged-in state.

### Code touchpoints

- `apps/customer/app/(authed)/account/page.tsx` — rewrite.
- `apps/customer/app/(authed)/account/profile/page.tsx` — new.
- `apps/customer/app/(authed)/account/addresses/page.tsx` — visual refresh
  (real Google Maps wiring deferred to IP-3).
- `apps/customer/app/(authed)/account/favorites/page.tsx` — new.
- `apps/customer/app/(authed)/account/notifications/page.tsx` — new.
- `apps/customer/app/(authed)/account/offers/page.tsx` — new.
- `apps/customer/app/(authed)/account/help/page.tsx` — new.
- `apps/customer/app/(authed)/account/about/page.tsx` — new.
- Backend: `GET /v1/me/stats` (orders count, favorites count, savings sum)
  — new endpoint.

### Tests

- New: `/v1/me/stats` integration test.
- Manual: walk every account sub-route.

### Deferred

- **Referral / Invite friends** flow — design the slot now, build later
  as its own phase. High-value India growth lever.
- **Language picker** (English / Hindi / Kannada) — UI slot only; i18n
  framework is its own phase.

---

## DP-5 — Motion polish pass (top 5 interactions)

After all screens are rebuilt, this is the final coat of polish targeting
the 5 highest-impact interactions identified in the motion spec.

### Scope

1. **Add-to-cart morph** — `+` button → `[− 1 +]` stepper. 120–180ms
   spring. Optimistic; cart pill updates simultaneously. The single most
   important interaction in the app.
2. **Floating cart pill** — count bounce, price crossfade, store-name
   fade-in on first item, subtle pulse after add. Layout-level component
   that survives route transitions.
3. **Active order progress** — pulsing live dot, animated progress
   connector line, ETA text crossfades. The trust crucible.
4. **Bottom-sheet physics** — draggable with elastic resistance, weighted
   spring on dismiss, backdrop fade. Used by cart, deliver-to, address
   picker, logout confirm.
5. **Skeleton-to-content transitions** — staggered fade with no hard swaps
   anywhere in the app. Final pass to catch any remaining hard swaps.

Plus the cross-cutting hygiene:

- **Reduced motion audit** — every spring respects `useReducedMotion`.
- **Layout shift audit** — no element changes size mid-animation.
- **Error animations** — form field shake on validation error, toast
  slide-in for errors, quantity stepper revert on "out of stock" mid-add.
- **Navigation transitions** — slide for forward, fade for back (or
  motion/react `layoutId` for shared-element where useful).
- **Offline banner** — top banner when `navigator.onLine === false`;
  queued action indicators on cards if a mutation is awaiting reconnect.

### Code touchpoints

- Audit pass across all customer components.
- Add `<OfflineBanner />` in layout.
- `apps/customer/components/cart-pill.tsx` — finalize all animations.
- Storybook stories for the top-5 interactions to lock the spec.

### Tests

- Manual: walk every primary flow with reduced motion ON, then OFF.
- Manual: throttle network in DevTools, verify offline banner + queued state.

### Deferred

- **Haptics** — Capacitor phase only.
- **Confetti on first delivered order** — single small canvas-confetti
  invocation gated on `localStorage["everDelivered"]`.
- **View Transitions API** shared-element transitions — Chrome-only today;
  add behind a feature flag when Safari ships support.

---

## IP-1 — Store config trio (+ minimum order)

Three of the smallest improvements, all touching the `Store` model. Bundled
together because the migration + owner-settings UI cover the same area.

**Updated from the delivery-slots mockup review:** add `Store.minOrderPaise`
to the trio. Multiple frames of [`docs/design/delivery-slots.png`](docs/design/delivery-slots.png) display "Min order ₹100" alongside the free-delivery
threshold; the field needs to exist for those labels to populate.

### Scope

- **Delivery fees**
  - Add `Store.baseDeliveryFeePaise: Int @default(0)` and
    `Store.freeDeliveryThresholdPaise: Int @default(0)` and
    `Store.minOrderPaise: Int @default(0)`.
  - At order placement (`orders.service.ts`), compute
    `deliveryFeePaise = (subtotal >= threshold || threshold === 0) ? 0 : baseFee`.
    Snapshot into Order as today.
  - Reject order placement if `subtotal < minOrderPaise` (when set);
    surface `MIN_ORDER_NOT_MET` error code.
  - Customer cart: show "Add ₹X more for free delivery" nudge when subtotal
    < threshold; "Add ₹X more to meet min order" when subtotal < minOrder.
  - Owner Settings: three number inputs + a preview ("Customer sees: min
    order ₹100, ₹30 fee below ₹200, free above").

- **Owner delivery radius update**
  - Backend schema (`stores.schemas.ts`) already allows
    `deliveryRadiusMeters` on update. Bump max from 15_000 → 25_000.
  - Owner Settings: expose a slider/number input (500 m – 25 km) wired to the
    existing `updateMine` endpoint.

- **Store operating hours**
  - Replace pure-toggle `isOpen` with hours. Add
    `Store.openTime: String` (default `"07:00"`) and
    `Store.closeTime: String` (default `"22:00"`) + `Store.manualClosed: Boolean`
    (default `false`).
  - A new cron tick (every 15 min) in `jobs/index.ts` flips `Store.isOpen`
    based on current IST time vs hours, unless `manualClosed=true` (owner
    emergency override always wins).
  - Owner Settings: two time pickers + a "Manually closed" toggle.

### Migration

Additive `ALTER TABLE` with safe defaults:

```sql
ALTER TABLE "Store"
  ADD COLUMN "baseDeliveryFeePaise" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "freeDeliveryThresholdPaise" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "minOrderPaise" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "openTime" TEXT NOT NULL DEFAULT '07:00',
  ADD COLUMN "closeTime" TEXT NOT NULL DEFAULT '22:00',
  ADD COLUMN "manualClosed" BOOLEAN NOT NULL DEFAULT false;
```

Existing rows: defaults preserve current behavior (no fee, no min order,
always open by hours).

### Code touchpoints

- `apps/backend/prisma/schema.prisma` — additive fields.
- `apps/backend/src/modules/stores/stores.schemas.ts` — extend update schema.
- `apps/backend/src/modules/stores/stores.service.ts` — `SELECT`, `toView`,
  `updateOwnStore` handle new fields.
- `apps/backend/src/modules/orders/orders.service.ts` — compute delivery fee
  at placement.
- `apps/backend/src/jobs/index.ts` — new `auto-store-open-close` job.
- `apps/backend/src/modules/stores/stores.service.ts` — new
  `autoOpenCloseStores()` service fn (cron entrypoint).
- `packages/shared/src/api-types.ts` — `StoreOwnerView` adds 5 fields.
- `packages/api-client/src/endpoints.ts` — `UpdateStoreBody` adds 5 fields.
- `apps/owner/app/(authed)/settings/page.tsx` — three new control cards.
- `apps/customer/app/(authed)/cart/page.tsx` — "Add ₹X more" nudge.

### Tests

- New: store auto-open/close cron unit test.
- New: order placement applies delivery fee per threshold rule.
- Updated: existing order tests verify `deliveryFeePaise` field unchanged for
  default store config.

### Deferred from this phase

- Per-day-of-week hours (e.g., Sunday 9am open). Owners can use `manualClosed`.

---

## IP-2 — Product variants

Biggest schema change. Touches cart, checkout, order items, search, and both
owner + customer product UIs. Riskiest phase — backfill must be tested on a
prod-shaped Neon snapshot before applying.

### Scope

New `ProductVariant` model:

```prisma
model ProductVariant {
  id              String   @id @default(cuid())
  productId       String
  product         Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  name            String   // e.g. "500 ml", "1 kg", "Pack of 6"
  unitValue       Decimal  @db.Decimal(10, 2)  // numeric (e.g. 500)
  unit            Unit                          // existing enum (ML, G, KG, etc.)
  pricePaise      Int
  mrpPaise        Int?
  isAvailable     Boolean  @default(true)
  isDefault       Boolean  @default(false)
  sku             String?
  sortOrder       Int      @default(0)

  // snapshot fields for order items reference this variant by id
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([productId, name])
  @@index([productId, isAvailable])
}
```

### Migration + backfill

- Create the `ProductVariant` table.
- Backfill: for every existing `Product`, create one `ProductVariant` row
  with `name = formatUnit(product.unit, product.unitValue)` (or just "Default"),
  copying `pricePaise`, `unit`, `unitValue`, etc.; mark `isDefault = true`.
- Keep `Product.pricePaise / unit / unitValue` for one transitional release
  (deprecated but populated from default variant). Remove in IP-2.5 cleanup
  after the FE is fully migrated.
- `OrderItem` gains optional `variantId` (FK → ProductVariant, SetNull).
  Backfill: leave null for historical orders (they reference snapshot data
  already; variantId is for new orders). New orders MUST populate variantId.

### Code touchpoints

- Schema + migration.
- `apps/backend/src/modules/products/products.service.ts` — read/return
  variants; create/update product accepts an array of variants; one variant
  must be marked default.
- `apps/backend/src/modules/products/products.schemas.ts` — variants array in
  request schemas.
- `apps/backend/src/modules/orders/orders.service.ts` — cart items reference
  `variantId`; pricing reads `variant.pricePaise`; order item snapshot
  records variant name + unit.
- `apps/backend/src/modules/search/search.service.ts` — index variant names
  alongside product name (e.g., search "curd 500ml" hits the variant).
- `packages/shared/src/api-types.ts` — `ProductPublicView` gains `variants`;
  `OrderItemView` gains `variantName`, `variantUnit`.
- `packages/api-client/src/endpoints.ts` — cart payloads switch from
  `{ productId, quantity }` to `{ variantId, quantity }`. Keep `productId`
  optional in request schema for one phase (transitional), reject if both
  set.
- `apps/customer/components/product-card.tsx` — variant chips; selected
  variant drives "Add to cart" target.
- `apps/customer/app/(authed)/cart/page.tsx` — line items show variant name.
- `apps/owner/app/(authed)/products/[id]/page.tsx` and `/products/new` —
  variant editor (rows of name, size, price, MRP, stock toggle).

### Tests

- New: variant CRUD, default-variant invariant (one and only one default),
  variant-aware cart placement, variant-aware coupon application.
- New: backfill script tested on a snapshot.
- Updated: every existing product / order test ports to default variant.

### Deferred

- Variant-level images (currently one image per product).
- Variant-level coupons (coupons currently apply to whole product).

---

## IP-3 — Geo UX with Google Maps

Replace every raw lat/long input with address autocomplete. Reverse-geocode
the customer's GPS for human-readable display.

### Setup (one-time)

- Create a Google Cloud project; enable **Maps JavaScript API**, **Places API
  (New)**, **Geocoding API**.
- Restrict the API key to the frontend Vercel origins.
- Add env: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to customer + owner Vercel
  projects. (Admin doesn't need it.)
- Store the key in 1Password / a real secret manager.

### Scope

- **Shared `<AddressAutocomplete>` component** in `packages/ui`:
  - Input → Google Places Autocomplete dropdown (biased to current GPS / India).
  - On select: returns `{ placeId, label, line1, city, pincode, lat, lng }`.
  - Optional draggable map pin to refine the location (uses Maps JS API).
- **Owner store onboarding** (`apps/owner/.../onboarding/page.tsx`) — replace
  the lat/long inputs with the autocomplete; coords stored from result.
- **Customer addresses** (add/edit) — same component; "Home / Work" label is
  separate input.
- **Customer location pill** — currently `"Around 13.045, 77.752"`. Use
  Geocoding API reverse lookup → `"near MG Road, Bengaluru"`. Cache result in
  localStorage to avoid repeat calls.
- **Owner store settings** — show address as text; "Change pinned location"
  opens the autocomplete + map.

### Code touchpoints

- New shared `packages/ui/src/components/address-autocomplete.tsx`.
- New `packages/ui/src/lib/google-maps-loader.ts` (script loader, singleton).
- `apps/owner/app/onboarding/page.tsx` — replace lat/long input block.
- `apps/customer/app/(authed)/account/addresses/page.tsx` (and create/edit
  routes) — replace lat/long.
- `apps/customer/components/location-pill.tsx` — show reverse-geocoded label.
- `apps/customer/lib/location.ts` — add reverse-geocode helper.

### Tests

- Component-level: autocomplete renders, calling onSelect with mock data
  yields expected shape. No live Maps API calls in CI.

### Deferred

- "Locate me on map" with full-screen draggable map for owner store pinning
  (current spec covers basic pin-on-card; full-screen flow can come later).

---

## IP-4 — Deliver-to address picker ("Mom in Mumbai")

Decouple "where I am" from "where this order goes."

### Scope

- New top-bar selector on customer home + product browsing:
  `Deliver to: Home — MG Road ▼` (Blinkit-style).
- Dropdown lists:
  - All saved addresses (from `/v1/addresses`).
  - "Use current location" (live GPS).
  - "Add new address" (opens autocomplete from IP-3).
- Selected address persisted in Zustand + localStorage
  (`selectedDeliveryAddressId`).
- Discovery query (`/v1/stores/nearby`), store detail page, and checkout all
  derive lat/lng from the **selected address**, not raw GPS.
- Switching the picker re-fetches `/v1/stores/nearby` for that location.
- At checkout, the delivery address defaults to the selected one (changeable).

### Code touchpoints

- New `apps/customer/components/deliver-to-picker.tsx`.
- New Zustand slice `apps/customer/lib/delivery-context.ts`.
- `apps/customer/app/stores/page.tsx` — uses selected-address coords (replaces
  current direct `useUserLocation`).
- `apps/customer/app/stores/[id]/page.tsx` — uses selected-address coords.
- `apps/customer/app/(authed)/checkout/page.tsx` — default to selected
  address; user can still pick another.

### Tests

- Manual: switching addresses re-fetches; ordering for a Mumbai address from
  Bengaluru shows only Mumbai stores.

### Deferred

- Showing distance / ETA per address in the picker (nice-to-have).

---

## IP-5 — Delivery time slots

Owners offer 1–N daily slots; customers can place orders for a future slot.

**Reference:** [`docs/design/delivery-slots.png`](docs/design/delivery-slots.png) — all 9 frames (Home with slots teaser, Store page with slots/cutoff,
Cart/Checkout with slot radio, Orders with scheduled view, slot bottom
sheet, slot bottom sheet (tomorrow), scheduled order tracking, other-
stores-with-slots peek, no-slots-available empty).

### Scope

Schema additions to `Store`:

```prisma
deliverySlots       Json       @default("[]")
                                  // Array<{ start: "07:00", end: "09:00" }>
                                  // — uses ranges, not single times, per mockup
slotCutoffMinutes   Int        @default(60)
allowAsapDelivery   Boolean    @default(true)
```

Additions to `Order`:

```prisma
scheduledFor       DateTime?   // null = ASAP
deliverySlotStart  String?     // "07:00" if scheduled
deliverySlotEnd    String?     // "09:00" if scheduled
```

- **Owner Settings** — slot manager (add/remove time ranges; reorder).
  Toggle for ASAP allowed.
- **Customer Home (frame A)** — "Deliver now / Schedule delivery" hero
  cards above the category grid. "Schedule delivery" opens the slot
  bottom sheet (frames E/F).
- **Customer Store page (frame B)** — under store info card, two compact
  toggles ("Deliver now — 15-25 mins, Cutoff today 10:45 PM" / "Schedule
  delivery — Tomorrow onwards, Cutoff 9:30 PM today").
- **Customer checkout (frame C)** — "Delivery options" section with two
  radio cards:
  - "Deliver now (ASAP)" — only enabled if `allowAsapDelivery=true` AND
    store currently open AND inside today's cutoff.
  - "Schedule delivery" — opens slot bottom sheet (frames E/F).
- **Slot bottom sheet (frames E/F)** — sectioned by Today / Tomorrow;
  each row shows `[start - end]`, cutoff (`Cutoff today 9:30 PM`), and
  delivery fee (uses `Store.baseDeliveryFeePaise` from IP-1, displayed
  per-slot for clarity — fee does NOT vary per slot in MVP).
- **Orders default (frame D)** — scheduled orders show a distinct
  "Scheduled for tomorrow" pill (use `var(--luxe)` purple from
  globals.css, NOT the mockup's purple-blue). Card body shows scheduled
  date + window.
- **Scheduled order tracking (frame G)** — adapted progress stepper:
  `Confirmed → Preparing → Out for delivery → Delivered` (different
  labels from ASAP's `Placed → Accepted → OFD → Delivered`). Backend
  option: add `OrderStatus.CONFIRMED` + `OrderStatus.PREPARING` for
  scheduled orders, OR keep the same enum and let the FE render
  contextual labels when `scheduledFor != null`. **Recommend FE-only
  relabeling** — keeps backend lifecycle simple.
- **Other-stores-with-slots peek (frame H)** — store cards on Home /
  Categories show small chips: "ASAP" + "Tomorrow slots" / "Today
  evening" / "Tomorrow slots". Needs `/v1/stores/nearby` to compute +
  return a `slotAvailability` summary per store (cheap — just check
  cutoffs against current time).
- **No-slots empty state (frame I)** — illustration + "No delivery slots
  available right now" + "Notify me" CTA. Triggered when:
  - Store has `allowAsapDelivery=false` AND
  - All defined slots' cutoffs for today and tomorrow have passed.
- **Auto-cancel cron** (Phase 11) updated: a scheduled order's cutoff
  for auto-cancel is `scheduledFor - cutoffMinutes`, not
  `placedAt + threshold`.
- **Realtime + notifications** unchanged in routing; copy notes
  "scheduled for tomorrow 7-9 AM" in the message body.

### Code touchpoints

- Schema + migration.
- `apps/backend/src/modules/stores/stores.service.ts` — `nearby` returns
  `slotAvailability` summary per store (which slots have non-expired
  cutoffs today/tomorrow).
- `apps/backend/src/modules/orders/orders.service.ts` — placement schema
  accepts `scheduledFor` + `deliverySlotStart` + `deliverySlotEnd`;
  validate slot exists; reject if past cutoff.
- `apps/backend/src/modules/orders/orders.service.ts` —
  `autoCancelStalePlacedOrders` becomes slot-aware.
- `packages/shared/src/api-types.ts` + `packages/api-client/src/endpoints.ts` —
  contract for slot fields + `slotAvailability` on nearby.
- `apps/owner/app/(authed)/settings/page.tsx` — slot manager card with
  start/end range inputs.
- `apps/customer/app/stores/page.tsx` — wire the slot teaser cards on Home
  (frame A) + slot peek chips on store cards (frame H).
- `apps/customer/app/stores/[id]/page.tsx` — store page slot toggles
  (frame B).
- `apps/customer/app/(authed)/checkout/page.tsx` — delivery options
  radios + slot bottom sheet trigger (frame C).
- `apps/customer/components/slot-bottom-sheet.tsx` (new) — frames E/F.
- `apps/customer/app/(authed)/orders/page.tsx` — scheduled order pill +
  card variant (frame D).
- `apps/customer/app/(authed)/orders/[id]/page.tsx` — scheduled tracking
  stepper with relabeled stages (frame G).
- `apps/customer/components/no-slots-empty.tsx` (new) — frame I.

### Tests

- New: slot validation on placement (existing slot range, after cutoff,
  past `scheduledFor`, valid).
- New: scheduled orders not auto-cancelled before slot cutoff.
- New: `nearby` returns correct `slotAvailability` summary per cutoff time.
- Updated: existing order tests assert `scheduledFor=null` for ASAP.

### Deferred

- Per-day-of-week slot variation.
- Slot capacity caps (e.g., max 10 orders per slot) — "No slots available"
  empty state only triggers from cutoffs in MVP, not capacity. When caps
  land, the same empty state covers it.
- Per-slot pricing (some grocers want premium for ASAP). Today fee is
  flat from IP-1; mockup displays it per slot for clarity only.

---

## IP-6 — Permissions onboarding flow

One-time post-signup screen that asks for location + notification permissions
up-front, instead of forcing users to dig into account settings.

### Scope

- New onboarding component used by both customer + owner apps after first
  authed visit:
  - "Allow location" → triggers `navigator.geolocation.getCurrentPosition`;
    on grant, runs the same reverse-geocode used in IP-3.
  - "Allow notifications" → triggers `Notification.requestPermission`;
    on grant, calls the existing `useWebPush.subscribe()`.
  - Both individually skippable.
- Tracked via `localStorage["onboardingDone"] = "true"`.
- Account / Settings still has the existing toggles for re-enabling later.
- Owner version: same flow, copy adjusted ("Get notified when an order arrives").

### Code touchpoints

- New `apps/customer/components/onboarding-overlay.tsx` (and owner equivalent).
- Mounted in `apps/customer/app/(authed)/layout.tsx` (and owner equivalent),
  conditional on `localStorage` flag.

### Tests

- Manual UX validation.

---

## IP-7 — Customer WhatsApp + final UX polish

Closes the notification-reliability gap on the customer side, plus the
out-of-stock and add-to-cart polish.

### Scope

- **Customer-facing WhatsApp templates** (4 new, must be approved in Meta
  Business Manager):
  - `order_accepted_customer`
  - `order_out_for_delivery_customer`
  - `order_delivered_customer`
  - `order_rejected_customer` (with reason variable)
- Extend `apps/backend/src/notifications/dispatch.ts`:
  - `onCustomerFacingStatus(orderId, toStatus)` now also calls
    `sendWhatsAppTemplate` with the appropriate template + customer phone.
- **Out-of-stock UX** (customer listings):
  - Stop filtering `isAvailable=false` from listings.
  - Show greyed-out with "Out of stock" badge.
  - "Add to cart" disabled for those.
- **Add-to-cart polish:**
  - Toast confirmation on add.
  - Floating cart pill (already exists) does a small bounce on add.

### Code touchpoints

- `apps/backend/src/notifications/dispatch.ts` — extend customer flow.
- `apps/customer/components/product-card.tsx` — out-of-stock styling +
  disabled state + add-to-cart animation.
- `apps/customer/components/customer-bottom-bar.tsx` — bounce on cart update.

### Tests

- Updated notifications test: customer-facing status changes write a
  WhatsAppMessageLog entry to the customer's phone.

### Deferred

- Customer notification preferences UI (opt-out of specific channels).
- WhatsApp "Track order" deep-link button (would need a customer app web URL).

---

## Cross-cutting concerns

### Migration safety

- All migrations additive; all new columns have safe defaults.
- IP-2 (variants) is the only one with a true backfill. Plan:
  1. Snapshot Neon DB.
  2. Generate + hand-edit migration (strip spurious DROP INDEX lines, as
     documented in PROGRESS.md gotchas).
  3. Run backfill locally against the snapshot; verify every product has
     exactly one default variant.
  4. Apply to prod via `migrate deploy` during a low-traffic window.
  5. Deploy backend with code that reads/writes via variants.
  6. Monitor `WhatsAppMessageLog` / `PushSubscription` writes for any
     unexpected errors in first 24h.

### Reviewer pass per phase

For phases that add server entry points (IP-5: scheduled-order placement;
IP-7: webhook copy; possibly IP-2: variant CRUD), run:

- `reviewer-data-integrity` on schema changes + bulk writes.
- `reviewer-authz` on any new endpoint.
- `reviewer-security-regression` on any new external integration (Google
  Maps key handling, WhatsApp templates).

### Single-instance constraints (unchanged)

These remain in place; addressing them is its own future phase ("Scale-out
phase 1: Redis + sticky sessions"):

- Cron jobs run once per backend instance.
- Socket.IO ticket store + rooms are per-instance.
- Auth + global rate-limit storage is in-memory.

Continue running **one** Railway instance for backend until that phase lands.

### Documentation updates

Each phase ends with:

- A new `apps/backend/IP{N}.md` design doc (mirrors `PHASE7.md`–`PHASE11.md`).
- A row in `PROGRESS.md` phase tracker (sub-section under "Improvements").
- An update to relevant README sections (env vars, scripts).

---

## What this plan deliberately does NOT include

Listed here so they're tracked but not forgotten:

- **Online payments** (Razorpay / UPI). Will be its own phase later.
- **Native apps via Capacitor** for push reliability + App Store presence.
  Likely after IP-7, as its own track. Unlocks haptics (DP-5 deferred items)
  + true pull-to-refresh + Play Store/App Store distribution.
- **Staff / multi-operator accounts** (the Phase 8.5 design that was parked).
- **Riders / delivery operator** module (Phase 7.5 design locked but not built).
  DP-3 live-tracking depends on it for real rider GPS streaming; until then,
  tracking shows static "rider somewhere along route."
- **Reviews / ratings** — schema has per-store rating field; customer-facing
  rating UI deferred. Adds social proof; design after DP-3 is live.
- **Multi-language (i18n)** — UI slot reserved in DP-4 Account → Preferences;
  framework + translations is its own phase.
- **Recurring orders / subscriptions** (weekly milk, etc.).
- **Search analytics / recommendations**.
- **Admin dashboard analytics** (revenue, store performance).
- **Customer-facing referrals / promotions** — UI slot reserved in DP-4
  Account → Invite friends; logic is its own phase. **High-value India
  growth lever**, recommend after IP-7.
- **Observability** (Sentry, uptime monitor, metrics) — promoted to
  "Operations Phase 1" above; recommended BEFORE DP-1.
- **CI/CD** (GitHub Actions for tests + typecheck on PR) — same; in Ops Phase 1.

---

## Operations Phase 1 — recommended to do BEFORE DP-1 (Home rebuild)

Not a numbered improvements phase, but recommended sequencing: do the
operational basics first so every Design Phase and IP- phase has guard
rails. Originally targeted at IP-2 (variants); moved earlier because the
Design Phase rewrites four major customer screens — regressions are easier
to catch with CI in place.

- **CI on PR** — GitHub Actions running typecheck + lint + the per-file
  backend tests (`auth`, `orders`, `lifecycle`, `realtime`, `notifications`,
  `cron`, `discovery`, `addresses`, `categories`, `products`, `search`,
  `stores`, `coupons`).
- **Sentry / error reporting** wired into backend (pino bridge) + each
  frontend (Next.js Sentry plugin). Free tier covers MVP traffic.
- **UptimeRobot** on `https://backend.sathyam.xyz/health` and each Vercel
  app's root.

Estimated: 1 day total. Saves much more in detected regressions during the
Design Phase rewrites AND during IP-2.

---

## How to validate this plan independently

Open a fresh Claude/ChatGPT session, paste this file, and ask:

1. "Are the schema changes additive and migration-safe?"
2. "Does IP-2 (variants) backfill correctly handle these edge cases:
   - existing pending orders mid-checkout
   - coupons currently applied to products
   - products with `isFeatured=true`?"
3. "Is the sequencing right, or should IP-5 (slots) come before IP-2
   (variants) since slots don't depend on variants?"
4. "Are there hidden coupling points I'm missing (e.g., search depends on
   variant names but search service hasn't been updated)?"
5. "Cost estimate for Google Maps API at a realistic kirana scale (say 500
   active users, 5 orders per day, 3 location switches per session)?"

Then come back with any pushback and we adjust before starting.

---

## Approval checkpoint

Once this plan is validated and you've signed off, the order of execution is:

```
Ops Phase 1 (CI + Sentry + uptime — recommended first)
       ↓
DP-0 (Design system + motion foundation)
       ↓
DP-1 (Home / Stores redesign)
       ↓
DP-2 (Categories + Store detail redesign)
       ↓
DP-3 (Cart + Checkout + Orders redesign)
       ↓
DP-4 (Account redesign)
       ↓
DP-5 (Motion polish — top 5 interactions)
       ↓
IP-1 (Store config trio)
       ↓
IP-2 (Product variants)   ← biggest, highest risk
       ↓
IP-3 (Geo UX)
       ↓
IP-4 (Deliver-to picker)  ← uses IP-3 components
       ↓
IP-5 (Delivery slots)
       ↓
IP-6 (Permissions onboarding — may be partially subsumed by DP-1 onboarding)
       ↓
IP-7 (Customer WhatsApp + UX polish — most polish already in DP-5)
```

Each phase ships independently. You can pause / reorder / skip any of them
after DP-0 without breaking the dependency chain. Hard dependencies:

- **DP-1 → DP-5** all depend on DP-0 (motion + token foundation).
- **IP-4** wants IP-3's autocomplete component (can be hand-rolled if you skip).
- **IP-1, IP-2, IP-5** add fields that the redesigned Settings + Cart + Checkout
  screens render — if those land after the Design Phase, just update the
  rebuilt components in-place.

When ready: **say "start Ops Phase 1"** or **"start DP-0"** (or which phase to
begin with) and I'll start the work, commit by commit, with the per-phase
pattern we used in Phases 7–11.
