"use client"

/**
 * Live coupon carousel on the customer home — combined admin (GLOBAL) +
 * owner (STORE) coupons for the currently-selected primary store.
 *
 * Visual model: each coupon is a compact horizontal card — bold offer
 * headline + "Use code: XYZ" subline on the left, a delivery-rider
 * illustration on the right. Whole card is tappable → copies the code
 * to clipboard. No separate Copy button — keeps the card light and the
 * primary action obvious.
 *
 * Multi-coupon rail: snap-scroll with pagination dots underneath
 * tracking the currently-visible card. Single coupon renders inline.
 *
 * Data: GET /v1/coupons/active?storeId=primary returns the combined
 * list, already sorted GLOBAL first then by expiring-soonest.
 */

import type { PublicCoupon } from "@workspace/api-client"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { toast } from "@workspace/ui/components/toaster"
import { Sparkles } from "lucide-react"
import { motion } from "motion/react"
import { useEffect, useRef, useState } from "react"

import {
  DeliveryRiderIllustration,
  NoCouponsIllustration,
} from "@/components/illustrations"
import { cn } from "@workspace/ui/lib/utils"
import { springs, useMotionPreset } from "@workspace/ui/lib/motion"
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
      <section className={cn("space-y-3", className)}>
        <Header />
        <Skeleton className="h-24 w-full rounded-[var(--radius-md)]" />
      </section>
    )
  }

  if (!coupons || coupons.length === 0) {
    return (
      <section className={cn("space-y-3", className)}>
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
      className={cn("space-y-3", className)}
    >
      <Header />
      {coupons.length === 1 ? (
        <CouponCard coupon={coupons[0]!} storeName={storeName} />
      ) : (
        <CouponRail coupons={coupons} storeName={storeName} />
      )}
    </section>
  )
}

function Header() {
  return (
    <h3 className="flex items-center gap-1.5 text-[15px] font-semibold">
      <Sparkles className="size-4 text-discount" aria-hidden />
      Offers for you
    </h3>
  )
}

/**
 * Multi-coupon horizontal rail with snap-scroll + active-slide pagination
 * dots underneath. The dots are derived from an IntersectionObserver on
 * the card refs (threshold 0.6 — the card is "active" when most of it
 * is in view). Tapping a dot scrolls that card into view.
 */
function CouponRail({
  coupons,
  storeName,
}: {
  coupons: PublicCoupon[]
  storeName: string | undefined
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Array<HTMLDivElement | null>>([])
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const root = scrollRef.current
    if (root === null) return
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry with the largest intersection ratio above the
        // visibility threshold — handles the moment where two cards
        // overlap during scroll.
        let bestIndex = activeIndex
        let bestRatio = 0
        for (const entry of entries) {
          if (entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio
            const idx = Number(
              (entry.target as HTMLElement).dataset.couponIndex,
            )
            if (!Number.isNaN(idx)) bestIndex = idx
          }
        }
        if (bestRatio > 0.6) setActiveIndex(bestIndex)
      },
      { root, threshold: [0.4, 0.6, 0.8, 1] },
    )
    cardRefs.current.forEach((el) => {
      if (el !== null) observer.observe(el)
    })
    return () => observer.disconnect()
    // We want this to run once per coupon list — re-observe if the
    // list identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coupons.length])

  function scrollToIndex(i: number): void {
    const card = cardRefs.current[i]
    if (card === null || card === undefined) return
    card.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" })
  }

  return (
    <div className="space-y-2.5">
      <div
        ref={scrollRef}
        className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          scrollSnapType: "x mandatory",
          maskImage:
            "linear-gradient(to right, black 0, black calc(100% - 28px), transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to right, black 0, black calc(100% - 28px), transparent 100%)",
        }}
      >
        <div className="flex gap-3 pr-6">
          {coupons.map((c, i) => (
            <div
              key={c.id}
              ref={(el) => {
                cardRefs.current[i] = el
              }}
              data-coupon-index={i}
              className="w-[min(20rem,100%)] shrink-0"
              style={{ scrollSnapAlign: "start" }}
            >
              <CouponCard coupon={c} storeName={storeName} />
            </div>
          ))}
        </div>
      </div>

      {/* Pagination dots */}
      <div
        role="tablist"
        aria-label="Coupon pages"
        className="flex items-center justify-center gap-1.5 pt-0.5"
      >
        {coupons.map((c, i) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={i === activeIndex}
            aria-label={`Show coupon ${i + 1} of ${coupons.length}`}
            onClick={() => scrollToIndex(i)}
            className={cn(
              "h-1.5 rounded-full transition-all duration-200",
              i === activeIndex
                ? "w-5 bg-primary"
                : "w-1.5 bg-border-strong hover:bg-muted-foreground/50",
            )}
          />
        ))}
      </div>
    </div>
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

  const headline = formatHeadline(coupon)
  const subline = formatSubline(coupon, storeName)

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
    <motion.button
      type="button"
      onClick={handleCopy}
      whileTap={{ scale: 0.99 }}
      transition={tap}
      aria-label={`Copy coupon code ${coupon.code}`}
      className={cn(
        "flex w-full items-center gap-3 text-left",
        "rounded-[var(--radius-lg)] border border-border-soft bg-card",
        "px-4 py-3.5",
        "transition-colors hover:border-primary/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {/* Left — copy block */}
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-semibold text-foreground leading-snug">
          {headline}{" "}
          <span aria-hidden className="inline-block">
            🎉
          </span>
        </span>
        <span className="block mt-0.5 text-[12px] text-muted-foreground leading-snug">
          {copied ? (
            <span className="text-success font-medium">
              Copied — paste at checkout
            </span>
          ) : (
            <>
              Use code:{" "}
              <span className="font-semibold tabular-nums tracking-wider text-foreground">
                {coupon.code}
              </span>
            </>
          )}
        </span>
        {subline !== null ? (
          <span className="block mt-1 text-[10.5px] text-muted-foreground/80 leading-snug">
            {subline}
          </span>
        ) : null}
      </span>

      {/* Right — rider illustration */}
      <span className="shrink-0">
        <DeliveryRiderIllustration className="w-20 sm:w-24" />
      </span>
    </motion.button>
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

/**
 * Single-line meta below "Use code: ...". Joins min-order + scope +
 * expiry-urgency. Kept tiny + muted so the headline stays the star.
 * Returns null when there's nothing worth saying (no min-order, GLOBAL
 * scope, far-off expiry).
 */
function formatSubline(c: PublicCoupon, storeName: string | undefined): string | null {
  const parts: string[] = []
  if (c.minOrderPaise > 0) {
    parts.push(`Min order ${formatPriceFromPaise(c.minOrderPaise)}`)
  }
  if (c.scope === "STORE" && storeName !== undefined) {
    parts.push(`Only at ${storeName}`)
  }
  const expiry = formatExpiry(c.validUntil)
  if (expiry !== null) parts.push(expiry)
  if (parts.length === 0) return null
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
  // Only surface expiry urgency when it's actually near; far-off expiries
  // are noise on a single-line subline.
  if (days <= 7) return `Expires in ${days} days`
  return null
}
