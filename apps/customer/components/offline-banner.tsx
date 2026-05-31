"use client"

/**
 * Top sticky banner shown when the browser reports offline. Slides in
 * from above, auto-dismisses when connectivity returns.
 *
 * Listens to the `online` / `offline` window events and re-checks
 * `navigator.onLine` on mount in case the page loaded already offline.
 * Honors reduced motion via the DP-0 preset — instant snap-in instead
 * of slide for users who opted out.
 *
 * Mounted once globally above the customer app's content (root layout).
 * Sits at the very top, above the sticky header (z-50). Keeps a small
 * line of breathing room so subsequent sticky headers don't visually
 * collide; the header still owns its own positioning.
 */

import { WifiOff } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useState } from "react"

import { cn } from "@workspace/ui/lib/utils"
import { tweens, useMotionPreset } from "@workspace/ui/lib/motion"

export function OfflineBanner() {
  const [offline, setOffline] = useState(false)
  const slide = useMotionPreset(tweens.route)

  useEffect(() => {
    function check() {
      setOffline(
        typeof navigator !== "undefined" ? navigator.onLine === false : false,
      )
    }
    check()
    window.addEventListener("online", check)
    window.addEventListener("offline", check)
    return () => {
      window.removeEventListener("online", check)
      window.removeEventListener("offline", check)
    }
  }, [])

  return (
    <AnimatePresence>
      {offline ? (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ y: -32, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -32, opacity: 0 }}
          transition={slide}
          className={cn(
            // Above the sticky header (z-30) but below modals/sheets (z-50).
            "fixed inset-x-0 top-0 z-40",
            // Token-themed warning so it's noticeable but not alarming.
            "bg-warning-soft border-b border-warning/30 backdrop-blur-md",
            "px-4 py-2",
          )}
        >
          <div className="max-w-md mx-auto flex items-center gap-2 text-warning-foreground">
            <WifiOff className="size-4 shrink-0" aria-hidden />
            <p className="text-xs font-semibold leading-tight flex-1">
              You&rsquo;re offline. Some actions may queue until you&rsquo;re
              back online.
            </p>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
