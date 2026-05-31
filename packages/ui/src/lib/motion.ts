/**
 * Motion primitives — every animation in the app pulls from here.
 *
 * Why centralized:
 *   - one place to retune the system feel.
 *   - one canonical curve so siblings (cart pill, sheet, route) match.
 *   - reduced-motion handled uniformly (see useMotionPreset).
 *
 * Naming: tween for time-driven, spring for physics-driven. Pick by intent —
 * springs feel "alive" (taps, drags, layout shifts); tweens feel "scripted"
 * (route changes, fade-ins, deliberate sequences).
 */

import { useReducedMotion as useReducedMotionPrimitive } from "motion/react"
import type { Transition } from "motion/react"

/**
 * Spring presets. Tuned for grocery — snappy, never bouncy.
 *
 * - `tap`    – button presses, chip selects (~120–180ms perceived).
 * - `sheet`  – bottom sheets, modal entries (~220–280ms perceived).
 * - `layout` – cart pill morphs, route shared elements (~180–220ms perceived).
 */
export const springs = {
  tap: {
    type: "spring",
    stiffness: 400,
    damping: 30,
    mass: 0.6,
  },
  sheet: {
    type: "spring",
    stiffness: 300,
    damping: 35,
    mass: 1,
  },
  layout: {
    type: "spring",
    stiffness: 350,
    damping: 32,
    mass: 0.8,
  },
} as const satisfies Record<string, Transition>

/**
 * Tween presets. The single `route` curve is the system standard for any
 * non-physics animation — chosen for the slight ease-out that feels native
 * on mobile without dragging.
 */
export const tweens = {
  route: {
    type: "tween",
    duration: 0.22,
    ease: [0.16, 1, 0.3, 1],
  },
  fast: {
    type: "tween",
    duration: 0.12,
    ease: [0.16, 1, 0.3, 1],
  },
  slow: {
    type: "tween",
    duration: 0.42,
    ease: [0.16, 1, 0.3, 1],
  },
} as const satisfies Record<string, Transition>

/**
 * Standard transition for a press scale — `whileTap={{ scale: 0.97 }}` plus
 * this transition gives the canonical tap feel everywhere.
 */
export const tapScale = 0.97

/**
 * Honor prefers-reduced-motion. Returns the original transition when motion
 * is allowed, or an instant transition (duration 0) when it's reduced.
 *
 * Use everywhere a transition is applied — never inline `useReducedMotion`
 * in components, route it through this hook so the behavior is uniform.
 *
 * @example
 *   const t = useMotionPreset(springs.tap)
 *   <motion.button whileTap={{ scale: tapScale }} transition={t} />
 */
export function useMotionPreset<T extends Transition>(
  preset: T,
): T | { duration: 0 } {
  const shouldReduce = useReducedMotionPrimitive()
  if (shouldReduce) return { duration: 0 }
  return preset
}

/**
 * Lower-level escape hatch when a component needs the raw flag (e.g., to
 * skip an entire `<AnimatePresence>` tree).
 */
export { useReducedMotionPrimitive as useReducedMotion }
