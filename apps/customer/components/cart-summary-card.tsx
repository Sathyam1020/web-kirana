"use client"

/**
 * Cart / checkout bill breakdown card. Rows for subtotal, optional
 * discount (with coupon code badge), delivery fee, total. Smooth numerical
 * transitions via motion's `layout` on the row when the discount row
 * enters/exits.
 *
 * Stays render-pure: callers compute paise figures + applied coupon code
 * outside. No internal coupon-apply logic — the cart and checkout pages
 * own that flow.
 */

import { AnimatePresence, motion } from "motion/react"
import { Tag } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"
import { tweens, useMotionPreset } from "@workspace/ui/lib/motion"
import { formatPriceFromPaise } from "@/lib/format"

interface CartSummaryCardProps {
  subtotalPaise: number
  /** Delivery fee at order time. Set to null/undefined to render "Free". */
  deliveryFeePaise?: number | null
  discountPaise?: number
  /** Code label rendered alongside the discount row, e.g. "WELCOME50". */
  couponCode?: string | null
  /** Visible at the bottom — defaults to "To pay (COD)". */
  totalLabel?: string
  className?: string
}

export function CartSummaryCard({
  subtotalPaise,
  deliveryFeePaise = 0,
  discountPaise = 0,
  couponCode,
  totalLabel = "To pay (COD)",
  className,
}: CartSummaryCardProps) {
  const fee = deliveryFeePaise ?? 0
  const total = subtotalPaise - discountPaise + fee
  const rowFade = useMotionPreset(tweens.fast)

  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border border-border bg-card p-4 space-y-2 text-sm",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-foreground">Item total</span>
        <span className="tabular-nums">{formatPriceFromPaise(subtotalPaise)}</span>
      </div>

      <AnimatePresence initial={false}>
        {discountPaise > 0 ? (
          <motion.div
            key="discount"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={rowFade}
            className="overflow-hidden"
          >
            <div className="flex items-center justify-between text-success">
              <span className="inline-flex items-center gap-1.5">
                <Tag className="size-3.5" aria-hidden />
                Discount
                {couponCode ? (
                  <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-success/10 text-[10px] font-bold tabular-nums">
                    {couponCode}
                  </span>
                ) : null}
              </span>
              <span className="tabular-nums">
                − {formatPriceFromPaise(discountPaise)}
              </span>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="flex items-center justify-between">
        <span className="text-foreground">Delivery fee</span>
        <span className="tabular-nums">
          {fee > 0 ? formatPriceFromPaise(fee) : "Free"}
        </span>
      </div>

      <div className="flex items-center justify-between pt-2 mt-1 border-t border-border-soft">
        <span className="font-semibold text-foreground">{totalLabel}</span>
        <motion.span
          key={total}
          initial={{ opacity: 0.6, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={rowFade}
          className="tabular-nums font-bold text-base"
        >
          {formatPriceFromPaise(total)}
        </motion.span>
      </div>
    </div>
  )
}
