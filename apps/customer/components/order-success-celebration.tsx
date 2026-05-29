"use client"

import { motion } from "motion/react"
import { useEffect } from "react"

/**
 * Blinkit-style order-placed celebration: a full-screen green wash, a tick that
 * draws itself, and a soft synthesized chime — then it hands off to the order
 * page. Replaces a plain success toast on checkout.
 */

const HOLD_MS = 2500

/** A gentle 3-note ascending chime via Web Audio — no asset, respects mute. */
function playChime(): void {
  try {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (Ctor === undefined) return
    const ctx = new Ctor()
    const now = ctx.currentTime
    const notes = [523.25, 659.25, 783.99] // C5, E5, G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.frequency.value = freq
      const start = now + i * 0.12
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.18, start + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.55)
    })
    setTimeout(() => void ctx.close().catch(() => undefined), 1500)
  } catch {
    // Audio is best-effort; the visual carries the moment.
  }
}

export function OrderSuccessCelebration({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    playChime()
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
