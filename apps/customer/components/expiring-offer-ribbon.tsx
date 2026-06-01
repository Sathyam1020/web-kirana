"use client"

/**
 * Slim above-the-fold urgency ribbon for the soonest-expiring active
 * coupon. Renders only when a coupon expires within the next 48h; stays
 * silent otherwise so it never adds empty-state noise (the full Offers
 * carousel below the fold still lists everything).
 *
 * - Same-day expiry (≤24h) escalates to a warning tint + a soft pulsing
 *   clock so the eye catches it above the fold.
 * - 24–48h uses the calm primary tint.
 * - Tapping copies the code + toast — mirrors the coupon-carousel's
 *   interaction so the gesture is consistent across the home.
 *
 * Honest copy: the label is derived straight from `validUntil`; we never
 * manufacture a deadline the backend didn't give us.
 */

import type { PublicCoupon } from "@workspace/api-client"
import { toast } from "@workspace/ui/components/toaster"
import { Clock } from "lucide-react"
import { motion } from "motion/react"

import { cn } from "@workspace/ui/lib/utils"
import { springs, tapScale, useMotionPreset } from "@workspace/ui/lib/motion"
import { formatPriceFromPaise } from "@/lib/format"

const HOUR_MS = 60 * 60 * 1000
const SOON_MS = 48 * HOUR_MS

interface ExpiringOfferRibbonProps {
  coupons: PublicCoupon[] | undefined
}

export function ExpiringOfferRibbon({ coupons }: ExpiringOfferRibbonProps) {
  const tap = useMotionPreset(springs.tap)

  const soon = pickSoonest(coupons)
  if (soon === null) return null
  const { coupon, sameDay, label } = soon

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(coupon.code)
      toast.success(`Code ${coupon.code} copied`, {
        description: "Paste it at checkout to apply.",
      })
    } catch {
      toast.error("Couldn't copy the code")
    }
  }

  return (
    <motion.button
      type="button"
      onClick={handleCopy}
      whileTap={{ scale: tapScale }}
      transition={tap}
      aria-label={`Copy coupon ${coupon.code} — ${label}`}
      className={cn(
        "w-full inline-flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-left",
        "border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "transition-colors",
        sameDay
          ? "border-warning/30 bg-warning-soft hover:bg-warning-soft/80"
          : "border-primary/20 bg-primary/5 hover:bg-primary/10",
      )}
    >
      <motion.span
        aria-hidden
        animate={sameDay ? { scale: [1, 1.16, 1] } : { scale: 1 }}
        transition={
          sameDay
            ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
            : undefined
        }
        className={cn(
          "inline-flex size-6 shrink-0 items-center justify-center rounded-full",
          sameDay
            ? "bg-warning/15 text-warning-foreground"
            : "bg-primary/10 text-primary",
        )}
      >
        <Clock className="size-3.5" />
      </motion.span>

      <span className="min-w-0 flex-1 truncate text-[12px] font-semibold leading-tight text-foreground">
        <span className="tabular-nums">{coupon.code}</span>
        <span className="mx-1 opacity-40">·</span>
        {headline(coupon)}
        <span className="mx-1 opacity-40">·</span>
        <span
          className={sameDay ? "text-warning-foreground" : "text-primary"}
        >
          {label}
        </span>
      </span>

      <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        Copy
      </span>
    </motion.button>
  )
}

function headline(c: PublicCoupon): string {
  if (c.type === "PERCENT") {
    return c.maxDiscountPaise
      ? `${c.value}% off up to ${formatPriceFromPaise(c.maxDiscountPaise)}`
      : `${c.value}% off`
  }
  return `${formatPriceFromPaise(c.value)} off`
}

/**
 * Pick the coupon expiring soonest within the next 48h. Returns null when
 * nothing is expiring soon (or no coupons carry an expiry), so the ribbon
 * renders nothing.
 */
function pickSoonest(
  coupons: PublicCoupon[] | undefined,
):
  | { coupon: PublicCoupon; sameDay: boolean; label: string }
  | null {
  if (!coupons || coupons.length === 0) return null
  const now = Date.now()

  let best: { coupon: PublicCoupon; ms: number } | null = null
  for (const c of coupons) {
    if (c.validUntil === null) continue
    const t = new Date(c.validUntil).getTime()
    if (Number.isNaN(t)) continue
    const ms = t - now
    if (ms <= 0 || ms > SOON_MS) continue
    if (best === null || ms < best.ms) best = { coupon: c, ms }
  }
  if (best === null) return null

  const hours = best.ms / HOUR_MS
  const sameDay = hours <= 24
  const label = sameDay
    ? `Expires in ${Math.max(1, Math.round(hours))}h`
    : "Expires tomorrow"
  return { coupon: best.coupon, sameDay, label }
}
