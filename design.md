# Kirana Design System

> Source of truth for visual tokens. Edit this file FIRST when the system
> changes, then update `packages/ui/src/styles/globals.css` to match.

## 1. Brand essence

Generous, photography-led, marketplace-confident. The product is a
neighbourhood-kirana marketplace — visually it should feel **trustworthy
like Airbnb**, not folksy and not corporate-cold. The base canvas is
**pure white**, headlines and body sit in **near-black ink**, and a
**single voltage of brand red** carries every primary CTA, the search
orb, the save/heart state, and inline brand links.

The system is intentionally restrained:

- One accent colour, used scarcely (most surfaces are 90% white + ink).
- One type family across display, body, navigation, and microcopy.
- One shadow tier across the whole system — depth comes from
  photography, white-on-white surface separation, and rounded corners,
  not from layered shadows.
- Soft shape language — buttons are 8px, cards ~14px, search bars and
  save buttons are fully circular / pill-shaped. Essentially no hard
  corner anywhere except the body grid itself.

Three colours do the heavy lifting:

- **Rausch red** — the single brand accent. Primary CTAs, the search
  orb, the heart save state, inline brand links, the wordmark.
- **Pure white** — the page floor for every public surface. Customer and
  owner apps are light-mode by default; the rider app keeps a dark mode
  for outdoor legibility.
- **Ink near-black** — text, icons, the star-rating numbers. Never pure
  black.

Everything else is a small neutral scale around those three.

## 2. Colour palette

All tokens are stored as oklch so contrast tunes perceptually; the hex
values from the source spec are kept in the right-hand column as a
sanity reference (oklch is the source of truth for runtime).

### Light mode

| Token                          | oklch                     | Hex source | Notes                                                |
|--------------------------------|---------------------------|------------|------------------------------------------------------|
| `--background`                 | `oklch(1 0 0)`            | `#ffffff`  | Page canvas — every public surface                   |
| `--foreground`                 | `oklch(0.24 0 0)`         | `#222222`  | Ink — headlines, body, primary nav, star numbers     |
| `--card`                       | `oklch(1 0 0)`            | `#ffffff`  | Card surface — same as canvas                        |
| `--card-foreground`            | `oklch(0.24 0 0)`         | `#222222`  |                                                      |
| `--popover`                    | `oklch(1 0 0)`            | `#ffffff`  | Account menu, language picker, date picker          |
| `--popover-foreground`         | `oklch(0.24 0 0)`         | `#222222`  |                                                      |
| `--primary`                    | `oklch(0.65 0.24 18)`     | `#ff385c`  | **Rausch** — every primary CTA, search orb, heart    |
| `--primary-foreground`         | `oklch(1 0 0)`            | `#ffffff`  | White text on Rausch                                 |
| `--primary-active`             | `oklch(0.55 0.25 18)`     | `#e00b41`  | Press / pointer-down state                           |
| `--primary-disabled`           | `oklch(0.91 0.06 18)`     | `#ffd1da`  | Pale Rausch tint for disabled CTA                    |
| `--secondary`                  | `oklch(1 0 0)`            | `#ffffff`  | Secondary CTA = white fill with ink outline          |
| `--secondary-foreground`       | `oklch(0.24 0 0)`         | `#222222`  |                                                      |
| `--surface-soft`               | `oklch(0.97 0 0)`         | `#f7f7f7`  | Disabled fields, sub-nav hover, filter band         |
| `--surface-strong`             | `oklch(0.95 0 0)`         | `#f2f2f2`  | Circular icon-button surfaces                       |
| `--muted`                      | `oklch(0.97 0 0)`         | `#f7f7f7`  | Alias of surface-soft for shadcn                    |
| `--muted-foreground`           | `oklch(0.52 0 0)`         | `#6a6a6a`  | Sub-titles, inactive tabs, "View all" links          |
| `--body`                       | `oklch(0.36 0 0)`         | `#3f3f3f`  | Long-form running text inside reviews/amenities      |
| `--muted-soft`                 | `oklch(0.65 0 0)`         | `#929292`  | Disabled link text — used sparingly                  |
| `--accent`                     | `oklch(0.97 0 0)`         | `#f7f7f7`  | Selected list item background                        |
| `--accent-foreground`          | `oklch(0.24 0 0)`         | `#222222`  |                                                      |
| `--destructive`                | `oklch(0.51 0.20 30)`     | `#c13515`  | Inline form-validation error text                    |
| `--destructive-hover`          | `oklch(0.46 0.21 30)`     | `#b32505`  | Darkens on link hover                                |
| `--destructive-foreground`     | `oklch(1 0 0)`            | `#ffffff`  |                                                      |
| `--border`                     | `oklch(0.88 0 0)`         | `#dddddd`  | Hairline — search bar dividers, card 1px borders     |
| `--border-soft`                | `oklch(0.92 0 0)`         | `#ebebeb`  | Long-scroll editorial body separators                |
| `--border-strong`              | `oklch(0.79 0 0)`         | `#c1c1c1`  | Disabled outline buttons, focused input outline      |
| `--input`                      | `oklch(0.88 0 0)`         | `#dddddd`  | Input border at rest                                 |
| `--input-focus`                | `oklch(0.24 0 0)`         | `#222222`  | Input border on focus (ink, 2px)                     |
| `--ring`                       | `oklch(0.24 0 0)`         | `#222222`  | Focus ring — ink, not Rausch                         |
| `--legal-link`                 | `oklch(0.65 0.18 260)`    | `#428bff`  | Inline links inside legal sub-band only              |
| `--scrim`                      | `oklch(0 0 0 / 50%)`      | `#000000`  | Modal backdrop — black at 50% opacity                |
| `--chart-1`                    | `oklch(0.65 0.24 18)`     | `#ff385c`  | Rausch                                               |
| `--chart-2`                    | `oklch(0.42 0.18 0)`      | `#92174d`  | Plus magenta                                         |
| `--chart-3`                    | `oklch(0.31 0.18 305)`    | `#460479`  | Luxe purple                                          |
| `--chart-4`                    | `oklch(0.52 0 0)`         | `#6a6a6a`  | Muted neutral                                        |
| `--chart-5`                    | `oklch(0.79 0 0)`         | `#c1c1c1`  | Border-strong neutral                                |
| `--sidebar`                    | `oklch(1 0 0)`            | `#ffffff`  | Sidebar matches canvas                               |
| `--sidebar-foreground`         | `oklch(0.24 0 0)`         | `#222222`  |                                                      |
| `--sidebar-primary`            | `oklch(0.65 0.24 18)`     | `#ff385c`  | Active sidebar item — Rausch                         |
| `--sidebar-primary-foreground` | `oklch(1 0 0)`            | `#ffffff`  |                                                      |
| `--sidebar-accent`             | `oklch(0.97 0 0)`         | `#f7f7f7`  | Hover sidebar item                                   |
| `--sidebar-accent-foreground`  | `oklch(0.24 0 0)`         | `#222222`  |                                                      |
| `--sidebar-border`             | `oklch(0.88 0 0)`         | `#dddddd`  |                                                      |
| `--sidebar-ring`               | `oklch(0.24 0 0)`         | `#222222`  |                                                      |

### Sub-brand accents (scoped, not mainline)

| Token        | oklch                  | Hex source | Scope                                          |
|--------------|------------------------|------------|------------------------------------------------|
| `--luxe`     | `oklch(0.31 0.18 305)` | `#460479`  | Reserved for any "Luxe / premium" sub-product  |
| `--plus`     | `oklch(0.42 0.18 0)`   | `#92174d`  | Reserved for any "Plus / featured" sub-product |

These never appear in mainline marketing or the default app chrome.
They live only inside a sub-branded surface (e.g. a premium-tier
landing page).

### Dark mode (rider app + optional `prefers-color-scheme`)

Airbnb has no dark mode on the public web, but we keep one for the
rider app's outdoor sun-legibility requirement. The dark palette flips
canvas/ink and preserves Rausch — slightly more saturated to hold its
voltage against the near-black surface.

| Token                          | oklch                     | Notes                                          |
|--------------------------------|---------------------------|------------------------------------------------|
| `--background`                 | `oklch(0.17 0 0)`         | Near-black canvas                              |
| `--foreground`                 | `oklch(0.97 0 0)`         | Off-white ink                                  |
| `--card`                       | `oklch(0.22 0 0)`         | Card sits one step above canvas                |
| `--card-foreground`            | `oklch(0.97 0 0)`         |                                                |
| `--popover`                    | `oklch(0.22 0 0)`         |                                                |
| `--popover-foreground`         | `oklch(0.97 0 0)`         |                                                |
| `--primary`                    | `oklch(0.68 0.25 18)`     | Slightly more saturated Rausch                 |
| `--primary-foreground`         | `oklch(1 0 0)`            |                                                |
| `--primary-active`             | `oklch(0.58 0.26 18)`     |                                                |
| `--primary-disabled`           | `oklch(0.35 0.10 18)`     | Dimmed Rausch tint on dark                     |
| `--secondary`                  | `oklch(0.22 0 0)`         | Card-equivalent fill, white text + ink outline|
| `--secondary-foreground`       | `oklch(0.97 0 0)`         |                                                |
| `--surface-soft`               | `oklch(0.25 0 0)`         |                                                |
| `--surface-strong`             | `oklch(0.30 0 0)`         |                                                |
| `--muted`                      | `oklch(0.25 0 0)`         |                                                |
| `--muted-foreground`           | `oklch(0.70 0 0)`         |                                                |
| `--body`                       | `oklch(0.85 0 0)`         |                                                |
| `--muted-soft`                 | `oklch(0.50 0 0)`         |                                                |
| `--accent`                     | `oklch(0.25 0 0)`         |                                                |
| `--accent-foreground`          | `oklch(0.97 0 0)`         |                                                |
| `--destructive`                | `oklch(0.65 0.22 30)`     |                                                |
| `--destructive-hover`          | `oklch(0.58 0.23 30)`     |                                                |
| `--destructive-foreground`     | `oklch(1 0 0)`            |                                                |
| `--border`                     | `oklch(1 0 0 / 12%)`      | Translucent hairline                           |
| `--border-soft`                | `oklch(1 0 0 / 8%)`       |                                                |
| `--border-strong`              | `oklch(1 0 0 / 22%)`      |                                                |
| `--input`                      | `oklch(1 0 0 / 14%)`      |                                                |
| `--input-focus`                | `oklch(0.97 0 0)`         |                                                |
| `--ring`                       | `oklch(0.97 0 0)`         | Focus ring flips to off-white on dark          |
| `--legal-link`                 | `oklch(0.72 0.16 260)`    |                                                |
| `--scrim`                      | `oklch(0 0 0 / 60%)`      |                                                |
| `--sidebar`                    | `oklch(0.20 0 0)`         |                                                |
| `--sidebar-foreground`         | `oklch(0.97 0 0)`         |                                                |
| `--sidebar-primary`            | `oklch(0.68 0.25 18)`     |                                                |
| `--sidebar-primary-foreground` | `oklch(1 0 0)`            |                                                |
| `--sidebar-accent`             | `oklch(0.25 0 0)`         |                                                |
| `--sidebar-accent-foreground`  | `oklch(0.97 0 0)`         |                                                |
| `--sidebar-border`             | `oklch(1 0 0 / 12%)`      |                                                |
| `--sidebar-ring`               | `oklch(0.97 0 0)`         |                                                |

### Usage rules

- **Rausch (`--primary`)** is the ONLY action colour. Used scarcely —
  most pages are 90% white + ink with one or two Rausch moments. Every
  "Place order", "Continue", "Reserve" CTA is Rausch.
- **No secondary brand colour** in mainline. Luxe and Plus tokens are
  scoped to sub-branded surfaces only.
- **Star-rating numbers are ink**, never yellow/gold. This is a
  deliberate brand choice — yellow stars feel cheap in a trust context.
- **Focus rings are ink**, not Rausch. Border thickens to 2px ink on
  input focus; no glow, no halo.
- **Destructive** is reserved for confirmations and inline error text
  only. Never the resting state of an icon button.

## 3. Typography

### Font stack

```
Display + Body + UI + Mono fallback   →   Cereal VF (when licensed)
Open-source substitute                →   Inter Variable
Historic fallback                     →   Circular, system-ui, -apple-system
Tabular numbers                       →   Inter with `font-feature-settings: "tnum"`
```

CSS variables:

```
--font-sans:    "Inter Variable", "Cereal VF", Circular, -apple-system,
                system-ui, Roboto, "Helvetica Neue", sans-serif
--font-display: var(--font-sans)            /* same family at heavier weight */
--font-mono:    "Geist Mono", ui-monospace, "SF Mono", monospace
```

The system runs **one type family** for display, body, navigation,
captions, microcopy. There is no separate display family — display
weight comes from weight/size, not a different font.

Cereal sits at modest weights — display headlines render at **22–28px
in weight 500–600**, not the heavy 700+ weights enterprise systems
lean on. The single typographically loud moment in the whole system is
the **rating display at 64px / 700** on listing pages. That is the
only place type alone carries hierarchy; everywhere else, photography
and white-on-white surface separation do the work.

If Cereal is unavailable, **Inter Variable** is the closest substitute;
adjust display line-height down by ~2% to match Cereal's slightly
tighter cap height.

### Scale

| Token                       | Size | Weight | Line height | Tracking  | Use                                                |
|-----------------------------|------|--------|-------------|-----------|----------------------------------------------------|
| `text-rating-display`       | 64px | 700    | 1.1         | -1px      | Listing detail rating ("4.81") — single loud moment|
| `text-display-xl`           | 28px | 700    | 1.43        | 0         | Homepage h1                                        |
| `text-display-lg`           | 22px | 500    | 1.18        | -0.44px   | Listing detail h1                                  |
| `text-display-md`           | 21px | 700    | 1.43        | 0         | Section heads ("What this place offers")           |
| `text-display-sm`           | 20px | 600    | 1.20        | -0.18px   | Sub-section titles                                 |
| `text-title-md`             | 16px | 600    | 1.25        | 0         | City link / category block titles                  |
| `text-title-sm`             | 16px | 500    | 1.25        | 0         | Footer column heads                                |
| `text-body-md`              | 16px | 400    | 1.5         | 0         | Default running text                               |
| `text-body-sm`              | 14px | 400    | 1.43        | 0         | Card meta lines, dates, prices, distance           |
| `text-caption`              | 14px | 500    | 1.29        | 0         | Search-field segment labels ("Where", "When")      |
| `text-caption-sm`           | 13px | 400    | 1.23        | 0         | Footer legal line                                  |
| `text-badge`                | 11px | 600    | 1.18        | 0         | "Guest favourite" / "Free delivery" floating badge |
| `text-micro-label`          | 12px | 700    | 1.33        | 0         | Card amenity micro-labels                          |
| `text-uppercase-tag`        |  8px | 700    | 1.25        | 0.32px    | "NEW" badge on product nav tabs (uppercase)        |
| `text-button-md`            | 16px | 500    | 1.25        | 0         | Primary CTA button labels                          |
| `text-button-sm`            | 14px | 500    | 1.29        | 0         | Pill button labels                                 |
| `text-link`                 | 14px | 400    | 1.43        | 0         | Inline body links                                  |
| `text-nav-link`             | 16px | 600    | 1.25        | 0         | Top product-nav labels                             |

Numbers in prices, distances, order IDs, and timestamps stay in
`--font-sans` with `font-feature-settings: "tnum"` enabled — Inter's
tabular variants line up cleanly without forcing a monospace family.
`--font-mono` is reserved for one-off code-like surfaces (debug
panels, server logs in the admin app).

## 4. Radius scale

The shape language is soft, but **subtler than the previous mint
system**. Most surfaces sit on an 8px button radius and 14px card
radius; nothing reaches the old 28–42px hero-card rounds.

```
--radius:      0.5rem    (8px)   ← base — buttons, inputs, badges
--radius-sm:   0.25rem   (4px)   — chips, kbd tags, tight pills
--radius-md:   0.875rem  (14px)  — property / product cards
--radius-lg:   1rem      (16px)  — reservation card, modals
--radius-xl:   2rem      (32px)  — category strip wrappers
--radius-full: 9999px            — search bar, search orb, heart, badges
```

The signature shapes:

- **Buttons → 8px** (`--radius`)
- **Cards → 14px** (`--radius-md`) with photo corner-clipping
- **Search bar → fully pill** (`--radius-full`)
- **Search orb / heart / "NEW" badge → circle** (`--radius-full`)
- **Category strip wrappers → 32px** (`--radius-xl`)

## 5. Shadow

The system has **one shadow tier** plus the flat baseline. Depth comes
from photography, surface separation, and rounded corners — not from
stacked elevation.

```
/* Flat — 95% of surfaces (body, hero, footer, editorial bands) */
--shadow-none: none;

/* The single shadow tier — card hover, search bar at rest, dropdowns */
--shadow-card:
    rgba(0, 0, 0, 0.02) 0 0 0 1px,
    rgba(0, 0, 0, 0.04) 0 2px 6px 0,
    rgba(0, 0, 0, 0.1)  0 4px 8px 0;

/* Alias for shadcn compatibility */
--shadow-sm: var(--shadow-card);
--shadow:    var(--shadow-card);
--shadow-md: var(--shadow-card);
--shadow-lg: var(--shadow-card);
--shadow-xl: var(--shadow-card);
```

- Property cards on hover → `--shadow-card`
- Search bar at rest → `--shadow-card`
- Account menu / language picker / date picker → `--shadow-card`
- Modal backdrop → `--scrim` (black 50%)

Dark mode reduces shadow opacity by half so the surface separation
reads more from card surface contrast than from drop shadow.

## 6. Layout

### Spacing

Base unit is 4px with a 2px micro-step:

```
--space-xxs:     2px
--space-xs:      4px
--space-sm:      8px
--space-md:     12px
--space-base:   16px
--space-lg:     24px
--space-xl:     32px
--space-xxl:    48px
--space-section: 64px
```

- **Section padding (vertical):** `--space-section` (64px) — generous
  but tighter than typical SaaS marketing (80–96px), because marketplace
  pages want higher card density per scroll.
- **Card internal padding:** `--space-lg` (24px) for host/reservation
  cards; `--space-base` (16px) for property-card meta; `--space-sm`
  (8px) for caption / date-row gutters.
- **Gutters:** `--space-base` (16px) between cards in grid layouts;
  `--space-lg` (24px) inside footer columns; `--space-xs` (4px) on
  dense category-strip dividers.

### Grid & container

- **Max content width:** 1280px on homepage and editorial pages.
- **Listing detail:** 1080px, 2-column with photo/amenity body left
  (~64%) and sticky reservation card right (~32%).
- **City / store link grid:** 6 columns desktop → 2–3 tablet → 1 mobile.
- **Footer:** 3-column desktop, 1-column mobile.

### Whitespace philosophy

Open hero, dense marketplace below. Editorial bands get 64px of
vertical breathing room; card grids compress to 16px between cards.
The contrast is intentional — the page reads as "spacious at the fold,
dense in the catalogue."

## 7. Component conventions

### 7.1 Buttons

| Variant                  | Surface          | Text             | Radius | Notes                                           |
|--------------------------|------------------|------------------|--------|-------------------------------------------------|
| `button-primary`         | `--primary`      | `--primary-fg`   | 8px    | h=48px, px=24, weight 500, the default CTA      |
| `button-primary-active`  | `--primary-active`| `--primary-fg`  | 8px    | Press / pointer-down                            |
| `button-primary-disabled`| `--primary-disabled`| `--primary-fg`| 8px   | Cursor not-allowed, no spinner                  |
| `button-secondary`       | `--background`   | `--foreground`   | 8px    | 1px ink outline, inverse CTA over Rausch        |
| `button-tertiary-text`   | none             | `--foreground`   | 0      | Underlined on hover — "Show more" links          |
| `button-pill-rausch`     | `--primary`      | `--primary-fg`   | full   | h=40px, px=20, label 14/500 — featured cells   |
| `button-icon-circle`     | `--surface-strong`| `--foreground`  | full   | 40×40, ghost icon button (back arrows, toolbar) |

Touch target minimum **44×44px**. Primary CTAs on mobile go full-width
inside their content container; on desktop they sit at natural width.

No transform-on-hover, no shadow-change-on-hover. The button reacts
only by switching to its `-active` background colour on press.

### 7.2 Search surface

- **`search-bar-pill`** — global search. White fill, fully pill, 64px
  height, hairline 1px border + `--shadow-card`. Internally divided by
  vertical hairlines into Where / When / Who segments. Each segment
  shows an uppercase caption label above a placeholder line.
- **`search-orb`** — circular Rausch orb terminating the right edge,
  48×48px, fully rounded, white magnifying-glass icon centred. The
  hottest single colour moment on the page.

### 7.3 Top navigation

- **`top-nav`** — white, 80px height, 1px bottom hairline. Wordmark
  flush left, product tabs centred, account utilities flush right.
- **`product-tab-active`** — ink label in `text-nav-link`, 32px
  hand-illustrated icon, 2px ink underline beneath the icon-label pair.
- **`product-tab-inactive`** — muted label, illustrated icon, no
  underline.
- **`new-tag`** — tiny rounded-full pill on the icon's top-right,
  carrying uppercase "NEW" in `text-uppercase-tag` (8px / 700,
  tracking 0.32px).

### 7.4 Cards

- **`product-card`** (kirana adaptation of the property card) — 1:1
  aspect photo with 14px corner clipping, image carousel dots overlay,
  "Bestseller" / "Free delivery" floating badge top-left, heart icon
  top-right (`button-icon-circle` outlined → Rausch-filled when saved).
  Beneath the image: 4–5 lines of meta — title (`text-title-md`),
  store / distance (`text-body-sm` muted), and price right-aligned.
- **`store-card`** — taller-aspect (4:5) variant for store discovery.
  Same 14px clipping, "NEW" badge top-left, heart top-right.
- **`guest-favourite-badge`** — white rounded-full pill at 11px / 600,
  `--shadow-card` for elevation against the photo.

### 7.5 Detail page

- **`rating-display-card`** — the signature moment. 64px / 700 rating
  number flanked left and right by tiny laurel-wreath SVG ornaments.
  Beneath: "Guest favourite" tagline + row of ink stat columns.
- **`amenity-row`** — 1-column list of icon + ink label rows in
  `text-body-md`, 12px row padding, no inter-row border; closed by a
  1px hairline divider above and below the section.
- **`reviews-card`** — 2-column grid of review excerpts.
- **`host-card` / `store-card-detail`** — white card with 14px
  rounding and 24px padding holding avatar, name, badge, response-rate
  stat, and a `button-secondary` "Contact store".
- **`reservation-card` / `order-summary-card`** — sticky right-rail
  card. White, 14px rounded, 1px hairline border, `--shadow-card`,
  24px padding. Holds nightly/order price in `text-display-md` ink,
  date or slot selector, quantity stepper, full-width "Reserve" /
  "Place order" primary CTA, fee breakdown stack in `text-body-sm`.

### 7.6 Date picker

- **`date-picker-day`** — 40×40px circular cell, day number in
  `text-body-sm`, transparent fill, ink text at rest.
- **`date-picker-day-selected`** — ink fill, white text, fully circular.
  Range states between two selected days carry a `--surface-soft`
  lozenge background that connects them.

### 7.7 Forms

- **`text-input`** — white surface, 1px `--border` outline, 8px
  radius, h=56px, padding 14×12. Stacked label above in `text-caption`
  muted, placeholder in `text-body-md` muted. **On focus, the border
  thickens to 2px ink** and the colour flips to `--input-focus`. No
  glow, no ring, no halo.
- **Error state:** border + helper text switch to `--destructive`;
  inline error sits beneath the input in `text-body-sm`.
- **Compound inputs** (country selector + phone number): nest a
  `--surface-soft` chip on the left separated by a 1px hairline.
  Chevron uses lucide-react's `ChevronsUpDown`.

### 7.8 Footer

- **`footer-light`** — white surface (no contrast against the page —
  Airbnb has no contrast footer), padding 48×80. Three columns of link
  blocks (Support / Selling / Online Kirana) separated by 24px gutters.
  Column heads in `text-title-sm` ink; rows in `text-body-sm` ink.
- **`legal-band`** — bottom strip carrying copyright, language picker
  (globe + "English (IN)" link), currency picker, social icons. All
  text muted at `text-caption-sm`.

### 7.9 Toasts (sonner)

- White card surface, 14px rounded, `--shadow-card`.
- Success: leading Rausch dot. Error: leading destructive dot. Info:
  leading muted-foreground dot. Never coloured fills — the dot is
  enough.

## 8. Responsive behaviour

| Name    | Width        | Key changes                                                                  |
|---------|--------------|------------------------------------------------------------------------------|
| Mobile  | < 744px      | Top nav → logo + hamburger; product tabs hide behind a sheet; search bar collapses to single tappable pill; cards stack 1-up; grids drop to 1-column; reservation card → sticky bottom bar with "Place order" + price summary. |
| Tablet  | 744–1128px   | Top nav keeps product tabs; search bar narrows; cards 2-up; grids 2–3 column; reservation card stays sticky right-rail at narrower width. |
| Desktop | 1128–1440px  | Full top nav with three product tabs centred; search bar at full pill width with all 3 segments visible; cards 4-up; grids 6-column; listing detail 2-column with reservation rail. |
| Wide    | > 1440px     | Content width caps at 1440px on listing/search pages and ~1280px on editorial; gutters absorb the rest. |

### Touch targets

- Primary CTAs at minimum 48×48px (above WCAG AAA).
- Search orb 48×48px circular — the most-tapped element on the page.
- Heart save button 32×32px circular — borderline for AAA but
  compensated by 12px padding inside the photo card.
- Date-picker day cells 40×40px circular.

### Collapsing strategy

- Top product tabs collapse into a hamburger sheet below 744px.
- Search bar's 3 segments collapse into a single-tap entry that opens
  a full-screen search overlay on mobile.
- Grids drop column counts cleanly at each breakpoint — never reflow
  rows; always reduce columns.

## 9. Motion

Animation is functional, never decorative.

- **No transform on button hover** (system default — Airbnb doesn't
  scale buttons on hover). Press state is the colour flip to
  `--primary-active`, not a scale.
- **Card hover** lifts the `--shadow-card` from absent to present
  (200ms ease-out). On mobile, hover is replaced by an instant tap
  feedback opacity dim to 0.9.
- **Modals / sheets:** 220ms in, 180ms out, ease
  `cubic-bezier(0.16, 1, 0.3, 1)`. Backdrop = `--scrim`.
- **Page transitions:** NONE in customer / owner / admin / rider apps.
- **Skeleton loaders:** subtle shimmer at 1.4s linear infinite, using
  `--surface-soft` with a `--surface-strong` moving gradient.

Respect `prefers-reduced-motion: reduce` — all transitions go to 0ms
under that media query.

## 10. Imagery & iconography

- **Icons:** lucide-react, 1.5px stroke, default 20px on body, 24px on
  buttons, 16px in dense table rows, 32px on top-nav product tabs.
- **Flags / countries:** Twemoji or a flag-icons SVG set, rendered in
  a `--radius-sm` 24×24 frame so corners don't poke through.
- **Product / store photos:** aspect-square, 14px corner-clipped,
  `object-cover` with a `--surface-soft` placeholder fill during load.
- **Illustrations** (empty states, splash): white background, ink
  primary stroke, **Rausch only on the focal element** (a single
  heart, a single search orb). No purple, no gradient.

## 11. Light vs dark

- All three consumer-facing apps (customer / owner / admin) default to
  **light** — matching the no-dark-mode-on-the-public-web stance.
- The **rider app** defaults to **dark** mode (outdoor sun legibility).
- Marketing / landing pages respect `prefers-color-scheme` if the user
  has set one.
- Theme toggle stored in `localStorage` key `kirana-theme` ∈
  `{ "light", "dark", "system" }`. `next-themes` handles the wiring.

## 12. What changed from the previous system

Mint + purple + cream → Rausch + ink + white (Airbnb model):

| Concept                | Was (mint)                            | Now (Rausch)                                     |
|------------------------|---------------------------------------|--------------------------------------------------|
| Primary action colour  | Mint `oklch(0.82 0.09 165)`           | **Rausch** `#ff385c` / `oklch(0.65 0.24 18)`     |
| Display accent         | Purple `oklch(0.40 0.22 295)`         | **Removed from mainline** (scoped to Luxe/Plus)  |
| Page surface           | Pure white with warm-cream sub-surfaces| **Pure white** + cool greys (`#f7f7f7`, `#f2f2f2`)|
| Text colour            | Cool grey `oklch(0.18 0.005 250)`     | **Ink** `#222222` (warm-neutral, never pure black)|
| Body font              | Plus Jakarta Sans                     | **Cereal VF → Inter Variable** fallback          |
| Display font           | Bricolage Grotesque                   | **Same family** — display weight is 500–700 of body|
| Numeric font           | Geist Mono                            | **Same family with `tnum`** — mono reserved for code|
| Base radius            | 16px button                           | **8px button**, 14px card, full pill for search  |
| Shadow tiers           | 5 tiers (sm → xl)                     | **1 tier** — the system has one shadow definition|
| Focus ring             | Saturated mint                        | **Ink** — border thickens to 2px, no glow        |
| Star-rating colour     | Yellow (default)                      | **Ink** — deliberate, yellow stars feel cheap    |
| Footer surface         | Sidebar warm-paper                    | **White** — matches canvas (no contrast footer)  |

The change is intentional — the brand is shifting from "calm,
fintech-adjacent neighbourhood marketplace" to "trust-led photography
marketplace at Airbnb scale." Restraint is the point: one accent
colour, one type family, one shadow tier, generous whitespace at the
fold, dense card grids below.

## 13. Implementation pointers

- CSS variables live in `packages/ui/src/styles/globals.css`. Every
  app imports it via `import "@workspace/ui/globals.css"` in its root
  layout.
- Fonts are loaded via `next/font/google` in each app's `app/layout.tsx`
  — `Inter` (variable) for everything; `Geist_Mono` only if a debug or
  code surface needs it. The `--font-sans` / `--font-mono` CSS variables
  are bound on `<html>` from each app.
- shadcn primitives in `packages/ui` automatically inherit the new
  tokens because they reference `var(--primary)` etc. Components that
  hard-coded mint or purple values need to be updated to reference the
  tokens.
- Dark mode is enabled via `class="dark"` on `<html>` (handled by
  `next-themes`).
- Tabular numbers in prices and IDs: add `font-feature-settings: "tnum"`
  to the relevant element rather than swapping to `--font-mono`.
