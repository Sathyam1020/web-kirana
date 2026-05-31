# Design tokens

Source of truth: `packages/ui/src/styles/globals.css`. This doc explains
what each token is for and when to reach for which.

The palette is **Airbnb-inspired** — pure white canvas, near-black ink,
one bold accent (Rausch red), one shadow tier, restrained semantic states.

> **Never hardcode hex.** If a color doesn't fit any token, the gap is a
> design problem to discuss, not a one-off RGB.

## Surfaces

| Token | Use for |
|-------|---------|
| `--background` | Page canvas. The single dominant area color. |
| `--card` | Card backgrounds, popovers, sheets. Same as `--background` in light mode — distinguished by elevation, not tone. |
| `--surface-soft` | Subtle backgrounds: filter chip bg, disabled fields, inline banners. |
| `--surface-strong` | Higher-contrast neutral: circular icon-button bg, search field at rest. |
| `--muted` | Alias of `--surface-soft` for shadcn primitives. |

## Text

| Token | Use for |
|-------|---------|
| `--foreground` | Primary text — headings, button labels, important content. |
| `--body` | Long-form running text — softer than ink, easier on the eye for paragraphs. |
| `--muted-foreground` | Secondary text — sub-titles, metadata, inactive tabs. |
| `--muted-soft` | Tertiary — disabled link text, placeholders. |
| `--card-foreground` | Same as `--foreground`; aliased for shadcn primitives. |

## Brand & action

| Token | Use for |
|-------|---------|
| `--primary` | **Rausch red — the ONE accent.** Primary CTAs, selected nav state, brand mark, toggles when ON. Use scarcely. |
| `--primary-foreground` | Text on Rausch (white). |
| `--primary-active` | Press state. |
| `--primary-disabled` | Pale Rausch for disabled primary CTA. |
| `--secondary` | White fill with ink outline — NOT a colour swap from primary. |

## Semantic states

| Token | Use for |
|-------|---------|
| `--success` / `-foreground` | "Verified" pill, success toasts, delivered checkmark, slot confirmed. |
| `--success-soft` | Banner background for success notices. |
| `--warning` / `-foreground` | "Store closed" banner, "Min order not met" hint, soft caution. |
| `--warning-soft` | Banner background for warnings. |
| `--info` / `-foreground` | "Push notifications blocked" banner, informational nudges. |
| `--info-soft` | Banner background for info notices. |
| `--destructive` / `-hover` / `-foreground` | "Delete address", "Log out", "Cancel order", "Replace cart". Distinct from Rausch (darker, more saturated red-orange). |

**Note:** Rausch is the brand accent; destructive is for irreversible
actions. Never mix — a "Save" button is `primary` (Rausch), a "Delete"
button is `destructive` (oxidized red).

## Sub-brand accents

Scoped to specific surfaces only — don't use as general accents.

| Token | Use for |
|-------|---------|
| `--luxe` | Premium / scheduled-order surfaces. Purple. |
| `--plus` | Loyalty / subscription surfaces. Magenta. |
| `--legal-link` | Links inside legal copy only. |

## Borders

| Token | Use for |
|-------|---------|
| `--border` | Default 1px hairline. Card edges, form fields. |
| `--border-soft` | Long-scroll editorial separators (lighter than default). |
| `--border-strong` | Disabled outline, focus rings, drag handles. |

## Radii

| Token | px | Use for |
|-------|-----|--------|
| `--radius-sm` | 4 | Chips, kbd hints, tight pills. |
| `--radius` | 8 | **Buttons** — system base radius. |
| `--radius-md` | 14 | **Cards** — product cards, store cards. |
| `--radius-lg` | 16 | Modals, reservation cards. |
| `--radius-xl` | 32 | Category strip wrappers, hero cards. |
| `--radius-full` | ∞ | Search bar, avatar, heart icon, badges. |

## Shadows

The system has **one shadow tier** (`--shadow-card`). Don't reach for
custom shadows — use this, or none. All other shadow aliases (`sm`,
`md`, `lg`, `xl`) point to the same definition for shadcn compatibility.

| When | Treatment |
|------|----------|
| At rest, on canvas | No shadow. |
| Hovered / floated card | `shadow-card`. |
| Dropdowns, popovers | `shadow-card`. |
| Sheets, modals | `shadow-card` (the same — sheets distinguish via overlay scrim, not extra elevation). |

## Spacing

| Token | px |
|-------|-----|
| `--space-xxs` | 2 |
| `--space-xs` | 4 |
| `--space-sm` | 8 |
| `--space-md` | 12 |
| `--space-base` | 16 |
| `--space-lg` | 24 |
| `--space-xl` | 32 |
| `--space-xxl` | 48 |
| `--space-section` | 64 |

Use Tailwind's standard spacing utilities (`p-4`, `gap-3`, etc.) — these
tokens exist for `style={{}}` escape hatches only.

## Dark mode

Every token has a dark-mode equivalent in the `.dark` block of
`globals.css`. **Always test new components in both modes** — toggle
with the `ThemeToggle` component or `prefers-color-scheme: dark`.

## When you need a new token

1. Check existing tokens first — most "new" needs map to existing ones.
2. Confirm the gap in PR with a design reviewer.
3. Add to both `:root` and `.dark` blocks (additive only).
4. Update the corresponding `@theme inline` mapping at the top of
   `globals.css` so Tailwind picks it up.
5. Document it in this file.
