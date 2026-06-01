"use client"

/**
 * Live coupon carousel on the customer home — combined admin (GLOBAL) +
 * owner (STORE) coupons for the currently-selected primary store.
 *
 * Data: GET /v1/coupons/active?storeId=primary returns the combined list,
 * already sorted GLOBAL first then by expiring-soonest.
 *
 * Per-card interaction: tap or "Copy" → clipboard copy + toast feedback.
 * No carousel auto-advance — coupons are useful information, not decoration;
 * autoplay risks the user missing one. Customers swipe at their own pace.
 *
 * Empty state: when there are no active offers, falls back to a generic
 * "First order ₹50 off" promo card (visual filler so the section never
 * collapses, but flagged as a fallback so it can't be mistaken for a real
 * coupon).
 */

import type { PublicCoupon } from "@workspace/api-client"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { toast } from "@workspace/ui/components/toaster"
import { Copy, ScrollText, Sparkles, Tag } from "lucide-react"
import { motion } from "motion/react"
import { useState } from "react"

import { NoCouponsIllustration } from "@/components/illustrations"
import { cn } from "@workspace/ui/lib/utils"
import { springs, tapScale, useMotionPreset } from "@workspace/ui/lib/motion"
import { formatPriceFromPaise } from "@/lib/format"

interface CouponCarouselProps {
  storeName: string | undefined
  coupons: PublicCoupon[] | undefined
  isLoading: boolean
  className?: string
}

export function CouponCarousel({
  storeName,
  coupons,
  isLoading,
  className,
}: CouponCarouselProps) {
  if (isLoading) {
    return (
      <section className={cn("space-y-2", className)}>
        <Header />
        <Skeleton className="h-28 w-full rounded-[var(--radius-md)]" />
      </section>
    )
  }

  if (!coupons || coupons.length === 0) {
    return (
      <section className={cn("space-y-2", className)}>
        <Header />
        <div className="flex items-center gap-4 rounded-[var(--radius-md)] border border-border bg-card px-4 py-6">
          <NoCouponsIllustration className="w-20 shrink-0" />
          <div>
            <p className="text-sm font-semibold">No active offers right now</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Check back soon — admin and owner offers show up here when live.
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section
      aria-label="Offers and coupons"
      className={cn("space-y-2", className)}
    >
      <Header />
      <div
        className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollSnapType: "x mandatory" }}
      >
        <div className="flex gap-3">
          {coupons.map((c) => (
            <div
              key={c.id}
              className="w-full shrink-0"
              style={{ scrollSnapAlign: "start" }}
            >
              <CouponCard coupon={c} storeName={storeName} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Header() {
  return (
    <h3 className="flex items-center gap-1.5 text-base font-semibold">
      {/* DP-9: offers section header lives in the savings role (rose),
          not the action role (green). */}
      <Sparkles className="size-4 text-discount" aria-hidden />
      Offers for you
    </h3>
  )
}

function CouponCard({
  coupon,
  storeName,
}: {
  coupon: PublicCoupon
  storeName: string | undefined
}) {
  const tap = useMotionPreset(springs.tap)
  const [copied, setCopied] = useState(false)

  const isGlobal = coupon.scope === "GLOBAL"
  const Icon = isGlobal ? ScrollText : Tag

  const headline = formatHeadline(coupon)
  const subline = formatSubline(coupon, storeName)
  const expiry = formatExpiry(coupon.validUntil)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(coupon.code)
      setCopied(true)
      toast.success(`Code ${coupon.code} copied`, {
        description: "Paste it at checkout to apply.",
      })
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error("Couldn't copy the code")
    }
  }

  return (
    <motion.div
      whileTap={{ scale: 0.995 }}
      transition={tap}
      className={cn(
        // DP-9: coupon cards are SAVINGS surfaces → discount role (rose),
        // not the action role. Card reads as "deal" instantly without
        // competing with the ADD chips in the rail above.
        "overflow-hidden rounded-[var(--radius-md)] border border-discount/15",
        "bg-gradient-to-br from-discount/12 via-discount/6 to-discount/3",
        // Lock to a uniform card height so the rail doesn't lurch when one
        // coupon has a longer subline than another. h-36 fits 2-line subline
        // + expiry + code row comfortably; cards with less content just
        // breathe more.
        "h-36",
      )}
    >
      <div className="flex h-full">
        {/* Left badge column — icon stacked over scope label, dashed cut.
            Slightly stronger tint than the body for the "ticket stub" feel. */}
        <div className="flex w-16 shrink-0 flex-col items-center justify-center gap-1.5 border-r border-dashed border-discount/30 bg-discount/5 py-5">
          <Icon
            className="size-6 text-discount"
            aria-hidden
          />
          <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
            {isGlobal ? "Kirana" : "Store"}
          </span>
        </div>

        {/* Body — flex-1 lets it fill the locked h-36, justify-between
            keeps headline+meta block at top and code+copy row at bottom. */}
        <div className="flex min-w-0 flex-1 flex-col justify-between px-4 py-3.5">
          <div>
            <p className="text-xl leading-tight font-bold text-foreground tabular-nums">
              {headline}
            </p>
            <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
              {subline}
            </p>
            {expiry ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {expiry}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2 pt-2">
            <span className="inline-flex items-center rounded-[var(--radius-sm)] bg-foreground/10 px-2.5 py-1 text-[12px] font-semibold text-foreground tabular-nums">
              {coupon.code}
            </span>
            <motion.button
              type="button"
              onClick={handleCopy}
              whileTap={{ scale: tapScale }}
              transition={tap}
              aria-label={`Copy coupon code ${coupon.code}`}
              className={cn(
                "ml-auto inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold",
                "border transition-colors",
                // DP-9: the Copy button lives inside a discount card, so
                // the resting outline rides the discount role. Copied
                // state stays success so the "you got it" beat reads as
                // confirmation, not another savings cue.
                copied
                  ? "border-success bg-success-soft text-success"
                  : "border-discount bg-card text-discount hover:bg-discount/5"
              )}
            >
              <Copy className="size-3.5" aria-hidden />
              {copied ? "Copied" : "Copy"}
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function formatHeadline(c: PublicCoupon): string {
  if (c.type === "PERCENT") {
    const cap = c.maxDiscountPaise
    return cap
      ? `${c.value}% off up to ${formatPriceFromPaise(cap)}`
      : `${c.value}% off your order`
  }
  return `${formatPriceFromPaise(c.value)} off`
}

function formatSubline(c: PublicCoupon, storeName: string | undefined): string {
  const parts: string[] = []
  if (c.minOrderPaise > 0) {
    parts.push(`Min order ${formatPriceFromPaise(c.minOrderPaise)}`)
  }
  if (c.scope === "STORE" && storeName) {
    parts.push(`Only at ${storeName}`)
  } else if (c.scope === "GLOBAL") {
    parts.push("Valid at every store")
  }
  return parts.join(" · ")
}

function formatExpiry(iso: string | null): string | null {
  if (iso === null) return null
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return null
  const now = Date.now()
  const ms = dt.getTime() - now
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000))
  if (days <= 0) return "Expires today"
  if (days === 1) return "Expires tomorrow"
  if (days <= 7) return `Expires in ${days} days`
  return `Valid till ${dt.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
}
