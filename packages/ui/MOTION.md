# Motion conventions

Single source of truth for animations in the kirana app. Every new
component reaches into `@workspace/ui/lib/motion` — never picks its own
spring values or easing curves.

## Why centralized

- One place to retune the system feel.
- One canonical curve so siblings (cart pill, sheet, route) match.
- Reduced motion handled uniformly (one hook, no scattered `if` blocks).

## Presets

Pick by intent — springs feel "alive" (taps, drags, layout shifts);
tweens feel "scripted" (route changes, fade-ins, deliberate sequences).

| Preset | Type | Use for |
|--------|------|---------|
| `springs.tap`    | spring   | button presses, chip selects, quantity steppers |
| `springs.sheet`  | spring   | bottom sheets, modal entries, drawers |
| `springs.layout` | spring   | cart pill morph, shared-element transitions |
| `tweens.route`   | tween    | route changes, page-level fades — system default |
| `tweens.fast`    | tween    | image fade-in, icon morphs, toasts |
| `tweens.slow`    | tween    | empty-state illustrations, hero reveals |

## Usage

```tsx
import { motion } from "motion/react"
import { springs, tapScale, useMotionPreset } from "@workspace/ui/lib/motion"

function MyButton() {
  const t = useMotionPreset(springs.tap)
  return (
    <motion.button
      whileTap={{ scale: tapScale }}
      transition={t}
    />
  )
}
```

`useMotionPreset` returns the original transition when motion is allowed
or `{ duration: 0 }` when the user has reduced motion on — so you never
write a `useReducedMotion` branch yourself.

## Principles

These rules are non-negotiable. They protect grocery-shopping speed,
which is the product's reason for existing.

1. **Animations must never block input.** A tap registers at tap-down, not
   after the previous animation finishes. Optimistic state leads; motion
   decorates.
2. **No layout shift mid-animation.** Skeletons must match content
   dimensions exactly. Quantity steppers reserve width for 2-digit counts.
   Buttons in `loading` state preserve label width (label fades to 0
   opacity; spinner overlays absolutely).
3. **Honor `prefers-reduced-motion`.** Always route through
   `useMotionPreset`. Springs become instant; only opacity/color flashes
   remain.
4. **Use the presets, not raw values.** If a preset doesn't fit, raise the
   gap in PR — don't introduce a fourth spring tuning.
5. **Springs for organic motion, tweens for scripted.** A button press is
   organic; a route fade is scripted. Mixing them is what makes apps feel
   amateur.
6. **No decorative-only animation.** Every animation must do at least one
   of: confirm feedback, preserve continuity, reduce uncertainty, improve
   perceived speed. If it does none, delete it.

## Naming

When a component animates, prefix the prop:

- `whileTap` / `whileHover` — from `motion/react`.
- `initial` / `animate` / `exit` — from `motion/react`.
- `transition` — always `useMotionPreset(...)`.
- `layout` / `layoutId` — for shared-element + auto-animated layout shifts.

## What this doc does NOT cover

- Page-level route transitions (lands in DP-5 when the `<AnimatePresence>`
  wrapper goes around the route layout).
- Haptics — Capacitor-only, lands post-IP-7.
- View Transitions API shared-element transitions — Chrome-only today;
  added behind a feature flag in DP-5 once Safari ships support.
