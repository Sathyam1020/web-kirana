"use client"

/**
 * Animated "Add ₹X more for free delivery" progress bar shown on the cart.
 *
 * Three states:
 *   - threshold not set (=0) → nothing renders
 *   - subtotal < threshold → progress fill + "add X more" copy
 *   - subtotal >= threshold → success state with full bar + "You unlocked free delivery"
 *
 * Animation: width transitions on the Rausch fill via motion's `animate` so
 * the bar slides smoothly as the user adds/removes items. Respects reduced
 * motion via the central preset.
 */

import { Check, Truck } from "lucide-react"
import { motion } from "motion/react"

import { cn } from "@workspace/ui/lib/utils"
import { tweens, useMotionPreset } from "@workspace/ui/lib/motion"
import { formatPriceFromPaise } from "@/lib/format"

interface FreeDeliveryProgressProps {
  subtotalPaise: number
  /** Free-delivery threshold; 0 (or undefined) hides this whole component. */
  thresholdPaise: number
  className?: string
}

export function FreeDeliveryProgress({
  subtotalPaise,
  thresholdPaise,
  className,
}: FreeDeliveryProgressProps) {
  const fade = useMotionPreset(tweens.route)

  if (!thresholdPaise || thresholdPaise <= 0) return null

  const unlocked = subtotalPaise >= thresholdPaise
  const pct = Math.min(100, Math.round((subtotalPaise / thresholdPaise) * 100))
  const remaining = Math.max(0, thresholdPaise - subtotalPaise)

  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border px-3 py-2.5",
        unlocked
          ? "bg-success-soft border-success/30"
          : "bg-card border-border",
        className,
      )}
      role="status"
    >
      <div className="flex items-center gap-2">
        {unlocked ? (
          <Check className="size-4 shrink-0 text-success" aria-hidden />
        ) : (
          <Truck className="size-4 shrink-0 text-primary" aria-hidden />
        )}
        <p
          className={cn(
            "text-xs font-medium leading-tight flex-1",
            unlocked ? "text-success" : "text-foreground",
          )}
        >
          {unlocked ? (
            "You’ve unlocked free delivery!"
          ) : (
            <>
              Add{" "}
              <span className="tabular-nums font-bold text-primary">
                {formatPriceFromPaise(remaining)}
              </span>{" "}
              more for free delivery
            </>
          )}
        </p>
      </div>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-soft"
        aria-hidden
      >
        <motion.div
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={fade}
          className={cn(
            "h-full rounded-full",
            unlocked ? "bg-success" : "bg-primary",
          )}
        />
      </div>
    </div>
  )
}
