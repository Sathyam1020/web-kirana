"use client"

/**
 * Tiny wrapper that shakes its content laterally for ~280ms when a
 * trigger value changes (typically an error message or invalid flag).
 *
 * Pattern:
 *
 *   const [error, setError] = useState<string | null>(null)
 *   <Shake trigger={error}>
 *     <Input ... />
 *   </Shake>
 *
 * Each time `trigger` changes to a truthy value, the wrapped element
 * shakes once. Reduced-motion users get no shake — same convention as
 * the rest of the app (route through motion's useReducedMotion).
 */

import { motion, useReducedMotion } from "motion/react"
import { useEffect, useRef, useState } from "react"

interface ShakeProps {
  /** Any value that, when changed to truthy, fires one shake animation. */
  trigger: unknown
  children: React.ReactNode
  className?: string
}

export function Shake({ trigger, children, className }: ShakeProps) {
  const reduce = useReducedMotion()
  const [shaking, setShaking] = useState(false)
  const lastTrigger = useRef(trigger)

  useEffect(() => {
    if (lastTrigger.current === trigger) return
    lastTrigger.current = trigger
    if (trigger === undefined || trigger === null || trigger === "") return
    setShaking(true)
    const id = window.setTimeout(() => setShaking(false), 320)
    return () => window.clearTimeout(id)
  }, [trigger])

  if (reduce) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      animate={
        shaking ? { x: [0, -6, 6, -4, 4, -2, 2, 0] } : { x: 0 }
      }
      transition={{ duration: 0.28 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
