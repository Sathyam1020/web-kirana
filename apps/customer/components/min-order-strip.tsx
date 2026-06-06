"use client"

/**
 * Sticky strip under the home header that surfaces ONE of two commerce
 * nudges in priority order:
 *
 *   1. Min order — "Add ₹X more to place this order" while subtotal is
 *      below Store.minOrderPaise. Backend will reject placement with
 *      MIN_ORDER_NOT_MET if the customer ignores this and tries anyway,
 *      so the strip is a courtesy, not a gate.
 *
 *   2. Free delivery — "Add ₹X for free delivery" once min order is met
 *      (or unset) and subtotal < Store.freeDeliveryThresholdPaise.
 *      Threshold = 0 means the store doesn't offer a free tier; the strip
 *      stays silent in that case.
 *
 * Hidden entirely when the cart is empty, scoped to another store, or
 * neither nudge applies. Both states share one progress bar that fills
 * against the currently-relevant target.
 *
 * IP-1 extended this from a single min-order strip to the two-stage flow
 * above — the free-delivery upsell only appears once the min is cleared,
 * so the customer sees one clear ask at a time.
 */

import { AnimatePresence, motion } from "motion/react"
import { Check, Truck } from "lucide-react"

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
  /** IP-1 — free-above-threshold target (0 = no free tier offered). */
  freeDeliveryThresholdPaise: number
}

type Stage =
  | { kind: "min-order"; remaining: number; pct: number; metMinimum: false }
  | { kind: "min-order-met"; metMinimum: true }
  | { kind: "free-delivery"; remaining: number; pct: number; metThreshold: false }
  | { kind: "hidden" }

function computeStage(
  subtotal: number,
  minOrderPaise: number,
  freeDeliveryThresholdPaise: number,
): Stage {
  if (minOrderPaise > 0 && subtotal < minOrderPaise) {
    const remaining = minOrderPaise - subtotal
    return {
      kind: "min-order",
      remaining,
      pct: Math.min(100, Math.round((subtotal / minOrderPaise) * 100)),
      metMinimum: false,
    }
  }
  if (freeDeliveryThresholdPaise > 0 && subtotal < freeDeliveryThresholdPaise) {
    const remaining = freeDeliveryThresholdPaise - subtotal
    return {
      kind: "free-delivery",
      remaining,
      pct: Math.min(100, Math.round((subtotal / freeDeliveryThresholdPaise) * 100)),
      metThreshold: false,
    }
  }
  // Min is met AND (no free tier OR free tier already crossed). One quiet
  // success beat in the min-order case; otherwise nothing to nudge.
  if (minOrderPaise > 0) return { kind: "min-order-met", metMinimum: true }
  return { kind: "hidden" }
}

export function MinOrderStrip({
  storeId,
  minOrderPaise,
  freeDeliveryThresholdPaise,
}: MinOrderStripProps) {
  const cart = useCart()
  const cartItems = cart.totalItems()
  const cartStoreId = cart.storeId
  const subtotal = cart.subtotalPaise()
  const fill = useMotionPreset(tweens.route)

  // Gate before computing — cart empty / scoped to another store hides
  // unconditionally regardless of store config.
  const scopedHere = cartItems > 0 && cartStoreId === storeId
  const stage = scopedHere
    ? computeStage(subtotal, minOrderPaise, freeDeliveryThresholdPaise)
    : { kind: "hidden" as const }

  const shouldShow = stage.kind !== "hidden"

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
          <StripBody stage={stage} fill={fill} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function StripBody({
  stage,
  fill,
}: {
  stage: Exclude<Stage, { kind: "hidden" }>
  fill: ReturnType<typeof useMotionPreset>
}) {
  // Three visual treatments, all using the same skeleton + progress bar
  // so the transition between them is just a content swap, never a
  // height jump.
  const isMinOrder = stage.kind === "min-order"
  const isMinMet = stage.kind === "min-order-met"
  const isFreeDelivery = stage.kind === "free-delivery"

  const surface = isMinOrder
    ? "bg-warning-soft border-warning/30"
    : isFreeDelivery
      ? "bg-success-soft border-success/30"
      : "bg-success-soft border-success/30"

  const textTone = isMinOrder
    ? "text-warning-foreground"
    : "text-success"

  const barTone = isMinOrder
    ? "bg-primary"
    : isFreeDelivery
      ? "bg-success"
      : "bg-success"

  return (
    <div role="status" aria-live="polite" className={cn("px-4 py-2 border-b", surface)}>
      <div className="max-w-md mx-auto">
        <p
          className={cn(
            "text-[12px] font-semibold leading-tight flex items-center gap-1.5",
            textTone,
          )}
        >
          {isMinOrder ? (
            <>
              Add{" "}
              <span className="tabular-nums">
                {formatPriceFromPaise(stage.remaining)}
              </span>{" "}
              more to place this order
            </>
          ) : isFreeDelivery ? (
            <>
              <Truck className="size-3.5" strokeWidth={2.5} aria-hidden />
              Add{" "}
              <span className="tabular-nums">
                {formatPriceFromPaise(stage.remaining)}
              </span>{" "}
              for free delivery
            </>
          ) : (
            <>
              <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
              You&rsquo;re good — minimum order reached
            </>
          )}
        </p>
        {/* Progress bar only when there's an active target to fill against;
            the "minimum reached" success beat doesn't need one. */}
        {(isMinOrder || isFreeDelivery) && (
          <div
            aria-hidden
            className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-card/60"
          >
            <motion.div
              initial={false}
              animate={{ width: `${stage.pct}%` }}
              transition={fill}
              className={cn("h-full rounded-full", barTone)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
