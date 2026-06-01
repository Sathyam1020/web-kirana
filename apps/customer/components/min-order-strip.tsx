"use client"

/**
 * Thin sticky strip that shows "Add ₹X more to place this order" with an
 * animated progress bar when the cart subtotal is below the primary
 * store's minimum-order threshold.
 *
 * Behavior:
 *   - Cart empty                  → renders nothing.
 *   - Cart store != current store → renders nothing (the cart-switch
 *                                   dialog will handle conflict).
 *   - minOrderPaise == 0          → renders nothing.
 *   - subtotal < minOrder         → "Add ₹X more" + progress fill.
 *   - subtotal >= minOrder        → quiet success state for ~1.6s before
 *                                   the parent removes it on the next
 *                                   render (we just keep showing while
 *                                   the strip is mounted).
 *
 * Mounted under the home header so it stays in view while scrolling.
 */

import { AnimatePresence, motion } from "motion/react"
import { Check } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"
import { tweens, useMotionPreset } from "@workspace/ui/lib/motion"
import { useCart } from "@/lib/cart"
import { formatPriceFromPaise } from "@/lib/format"

interface MinOrderStripProps {
  /** Current primary-store id; the strip only shows when the cart is
   *  scoped to this store. */
  storeId: string
  /** Store's minimum-order paise threshold (0 = no minimum). */
  minOrderPaise: number
}

export function MinOrderStrip({ storeId, minOrderPaise }: MinOrderStripProps) {
  const cart = useCart()
  const cartItems = cart.totalItems()
  const cartStoreId = cart.storeId
  const subtotal = cart.subtotalPaise()
  const fill = useMotionPreset(tweens.route)

  const shouldShow =
    minOrderPaise > 0 &&
    cartItems > 0 &&
    cartStoreId === storeId

  const remaining = Math.max(0, minOrderPaise - subtotal)
  const metMinimum = remaining === 0
  const pct = Math.min(100, Math.round((subtotal / minOrderPaise) * 100))

  return (
    <AnimatePresence initial={false}>
      {shouldShow ? (
        <motion.div
          key="strip"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={fill}
          className="overflow-hidden"
        >
          <div
            role="status"
            aria-live="polite"
            className={cn(
              "px-4 py-2 border-b",
              metMinimum
                ? "bg-success-soft border-success/30"
                : "bg-warning-soft border-warning/30",
            )}
          >
            <div className="max-w-md mx-auto">
              <p
                className={cn(
                  "text-[12px] font-semibold leading-tight flex items-center gap-1.5",
                  metMinimum ? "text-success" : "text-warning-foreground",
                )}
              >
                {metMinimum ? (
                  <>
                    <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
                    You&rsquo;re good — minimum order reached
                  </>
                ) : (
                  <>
                    Add{" "}
                    <span className="tabular-nums">
                      {formatPriceFromPaise(remaining)}
                    </span>{" "}
                    more to place this order
                  </>
                )}
              </p>
              <div
                aria-hidden
                className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-card/60"
              >
                <motion.div
                  initial={false}
                  animate={{ width: `${pct}%` }}
                  transition={fill}
                  className={cn(
                    "h-full rounded-full",
                    metMinimum ? "bg-success" : "bg-primary",
                  )}
                />
              </div>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
