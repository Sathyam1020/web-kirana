"use client"

/**
 * Soft fade-through between routes — wraps {children} with motion's
 * AnimatePresence keyed on pathname so each new screen fades in while
 * the old one fades out.
 *
 * Kept short (≈140ms) so navigation never feels held back; if a screen
 * has its own intra-page enter animations they own their first frame
 * and this layer just smooths the transition between sibling routes.
 *
 * Reduced-motion honored via DP-0 preset → effectively instant.
 */

import { AnimatePresence, motion } from "motion/react"
import { usePathname } from "next/navigation"

import { tweens, useMotionPreset } from "@workspace/ui/lib/motion"

export function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/"
  const fade = useMotionPreset(tweens.fast)
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={fade}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
