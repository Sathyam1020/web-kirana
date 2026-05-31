"use client"

/**
 * Floating "back to top" pill — appears below the sticky home header after
 * the user scrolls past roughly one viewport. Tap → smooth scroll to top.
 *
 * Why up here and not the conventional bottom-right FAB: the user's thumb
 * + gaze are at the TOP of the screen when they want to go back up; a
 * bottom-right button would force them to look down again to reach for
 * "up". Snackbar-style dark pill keeps the affordance high-signal without
 * stealing the visual hierarchy from the page below.
 *
 * Mounted once globally; hidden on auth + checkout + deep order tracking
 * (same gates as the bottom nav — those are single-task screens).
 */

import { ArrowUp } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

import { cn } from "@workspace/ui/lib/utils"
import {
  springs,
  tapScale,
  useMotionPreset,
  useReducedMotion,
} from "@workspace/ui/lib/motion"

const HIDE_ON_PATHS: string[] = ["/login", "/signup", "/cart", "/checkout"]
function isOrderDetail(pathname: string): boolean {
  return /^\/orders\/[^/]+/.test(pathname)
}

export function BackToTop() {
  const pathname = usePathname() ?? ""
  const hiddenScreen =
    HIDE_ON_PATHS.some((p) => pathname.startsWith(p)) || isOrderDetail(pathname)

  const [visible, setVisible] = useState(false)
  const tap = useMotionPreset(springs.tap)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (hiddenScreen) return
    function onScroll() {
      // Show after roughly one viewport scroll — gives enough page below
      // to justify the affordance without flashing it on short content.
      const threshold = window.innerHeight * 0.9
      setVisible(window.scrollY > threshold)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [hiddenScreen])

  const onClick = useCallback(() => {
    window.scrollTo({
      top: 0,
      behavior: reduceMotion ? "auto" : "smooth",
    })
  }, [reduceMotion])

  if (hiddenScreen) return null

  return (
    <AnimatePresence>
      {visible ? (
        <motion.button
          type="button"
          onClick={onClick}
          aria-label="Back to top"
          initial={{ opacity: 0, y: -8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.95 }}
          whileTap={{ scale: tapScale }}
          transition={tap}
          className={cn(
            // Positioned just below the sticky home header. z-40 sits above
            // page content but below modals/sheets (z-50). Centered in the
            // phone-shaped column.
            "fixed left-1/2 -translate-x-1/2 z-40",
            "top-[calc(env(safe-area-inset-top)+7.5rem)]",
            // Snackbar pill — dark foreground surface, light text. Tokens
            // handle the dark-mode flip.
            "inline-flex items-center gap-2 h-10 px-4 rounded-full",
            "bg-foreground text-background shadow-card",
            "text-sm font-semibold",
            "hover:opacity-90 transition-opacity",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          )}
        >
          <ArrowUp className="size-4" strokeWidth={2.5} aria-hidden />
          Back to top
        </motion.button>
      ) : null}
    </AnimatePresence>
  )
}
