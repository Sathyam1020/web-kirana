"use client"

import { motion } from "motion/react"
import { useEffect } from "react"
import { playSuccessChime } from "@/lib/sound"

/**
 * Blinkit-style order-placed celebration: a full-screen green wash, a tick that
 * draws itself, and a soft synthesized chime — then it hands off to the order
 * page. Replaces a plain success toast on checkout. The chime plays through the
 * audio context primed on the place-order tap (see lib/sound.ts), so it isn't
 * silenced by the browser autoplay policy.
 */

const HOLD_MS = 2500

export function OrderSuccessCelebration({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    playSuccessChime()
    const timer = setTimeout(onDone, HOLD_MS)
    return () => clearTimeout(timer)
  }, [onDone])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#16a34a] text-white px-6 text-center"
      role="status"
      aria-live="polite"
    >
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.05 }}
        className="rounded-full bg-white/15 p-7"
      >
        <svg width="96" height="96" viewBox="0 0 52 52" className="block">
          <motion.circle
            cx="26"
            cy="26"
            r="24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeOpacity="0.45"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
          />
          <motion.path
            d="M15 27 l7 7 l15 -16"
            fill="none"
            stroke="white"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.3, duration: 0.4, ease: "easeOut" }}
          />
        </svg>
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-6 text-2xl font-semibold"
      >
        Order placed!
      </motion.p>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="mt-1 text-white/85"
      >
        Taking you to your order…
      </motion.p>
    </motion.div>
  )
}
