"use client"

/**
 * Offers & coupons — frame G from the design (typo "Offers & coons" fixed).
 *
 * Active section (top) and Expired section (collapsible) — two parallel
 * queries to /v1/coupons/active with `status=active` / `status=expired`.
 *
 * Per-card actions:
 *   - Copy → copies code, toasts.
 *   - Use now → copies code + navigates to home so the user can shop.
 *
 * Expired cards render muted (lowered opacity, no Use now button).
 */

import type { PublicCoupon } from "@workspace/api-client"
import { useApi } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { toast } from "@workspace/ui/components/toaster"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowLeft,
  ChevronDown,
  Copy,
  ScrollText,
  Tag,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { NoCouponsIllustration } from "@/components/illustrations"
import { formatPriceFromPaise } from "@/lib/format"
import { useSmartBack } from "@/lib/use-smart-back"
import { cn } from "@workspace/ui/lib/utils"

export default function OffersPage() {
  const api = useApi()
  const onBack = useSmartBack("/account")
  const router = useRouter()

  const active = useQuery({
    queryKey: ["coupons", "page", "active"],
    queryFn: () => api.coupons.active({ status: "active" }),
    staleTime: 60_000,
  })
  const expired = useQuery({
    queryKey: ["coupons", "page", "expired"],
    queryFn: () => api.coupons.active({ status: "expired" }),
    staleTime: 5 * 60_000,
  })

  const [expiredOpen, setExpiredOpen] = useState(false)

  const activeItems = active.data?.items ?? []
  const expiredItems = expired.data?.items ?? []

  return (
    <div className="min-h-svh bg-background pb-28">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border/40">
        <div className="max-w-md mx-auto flex items-center gap-2 px-4 py-3">
          <Button
            variant="secondary"
            size="icon"
            aria-label="Back"
            onClick={onBack}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="text-base font-semibold flex-1">Offers &amp; coupons</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-5 space-y-5">
        {/* Active offers */}
        <section className="space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-1">
            Active offers
            {active.isPending ? null : ` (${activeItems.length})`}
          </h2>
          {active.isPending ? (
            <CouponSkeletons />
          ) : activeItems.length === 0 ? (
            <div className="rounded-[var(--radius-md)] border border-border bg-card py-8 px-4 flex flex-col items-center text-center gap-3">
              <NoCouponsIllustration className="w-32" />
              <p className="text-sm font-semibold">No active offers right now</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Check back soon — new offers from kiranas and the platform
                show up here.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {activeItems.map((c) => (
                <li key={c.id}>
                  <CouponRow
                    coupon={c}
                    expired={false}
                    onUseNow={async () => {
                      await navigator.clipboard
                        .writeText(c.code)
                        .catch(() => {})
                      toast.success(`Code ${c.code} copied`, {
                        description: "Browse a store and apply at checkout.",
                      })
                      router.push("/stores")
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Expired offers — collapsible */}
        {!expired.isPending && expiredItems.length > 0 ? (
          <section className="space-y-2">
            <button
              type="button"
              onClick={() => setExpiredOpen((o) => !o)}
              className="w-full flex items-center justify-between px-1 py-1"
            >
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Expired offers ({expiredItems.length})
              </span>
              <ChevronDown
                className={cn(
                  "size-4 text-muted-foreground transition-transform",
                  expiredOpen && "rotate-180",
                )}
                aria-hidden
              />
            </button>
            {expiredOpen ? (
              <ul className="space-y-2">
                {expiredItems.map((c) => (
                  <li key={c.id}>
                    <CouponRow coupon={c} expired />
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  )
}

function CouponRow({
  coupon,
  expired,
  onUseNow,
}: {
  coupon: PublicCoupon
  expired: boolean
  onUseNow?: () => void
}) {
  const isGlobal = coupon.scope === "GLOBAL"
  const Icon = isGlobal ? ScrollText : Tag

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(coupon.code)
      toast.success(`Code ${coupon.code} copied`)
    } catch {
      toast.error("Couldn’t copy the code")
    }
  }

  const headline = formatHeadline(coupon)
  const subline = formatSubline(coupon)
  const dateLabel = formatDate(coupon.validUntil, expired)

  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border overflow-hidden",
        expired
          ? "border-border bg-surface-soft opacity-80"
          : "border-primary/15 bg-gradient-to-br from-primary/8 via-primary/4 to-card",
      )}
    >
      <div className="flex">
        <div
          className={cn(
            "w-14 shrink-0 flex flex-col items-center justify-center gap-1 border-r border-dashed py-4",
            expired
              ? "border-border bg-surface-soft"
              : "border-primary/30 bg-primary/5",
          )}
        >
          <Icon
            className={cn(
              "size-5",
              expired
                ? "text-muted-foreground"
                : isGlobal
                  ? "text-primary"
                  : "text-luxe",
            )}
            aria-hidden
          />
          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            {isGlobal ? "Kirana" : "Store"}
          </span>
        </div>
        <div className="flex-1 min-w-0 px-3 py-3 flex flex-col gap-2">
          <div>
            <p
              className={cn(
                "text-base font-bold leading-tight",
                expired ? "text-muted-foreground line-through" : "text-foreground",
              )}
            >
              {headline}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-tight">
              {subline}
            </p>
            {dateLabel ? (
              <p
                className={cn(
                  "text-[11px] mt-0.5 tabular-nums",
                  expired ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {dateLabel}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-[var(--radius-sm)] text-[12px] font-semibold tabular-nums",
                expired
                  ? "bg-surface-strong text-muted-foreground"
                  : "bg-foreground/10 text-foreground",
              )}
            >
              {coupon.code}
            </span>
            <button
              type="button"
              onClick={copyCode}
              aria-label={`Copy coupon code ${coupon.code}`}
              className={cn(
                "ml-auto inline-flex items-center gap-1 h-8 px-3 rounded-full text-xs font-semibold",
                "border transition-colors",
                expired
                  ? "border-border bg-card text-muted-foreground"
                  : "border-primary bg-card text-primary hover:bg-primary/5",
              )}
            >
              <Copy className="size-3.5" aria-hidden />
              Copy
            </button>
            {!expired && onUseNow ? (
              <button
                type="button"
                onClick={onUseNow}
                className="inline-flex items-center h-8 px-3 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary-active transition-colors"
              >
                Use now
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function CouponSkeletons() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <li
          key={i}
          className="rounded-[var(--radius-md)] border border-border bg-card h-32"
        >
          <Skeleton className="h-full w-full rounded-[var(--radius-md)]" />
        </li>
      ))}
    </ul>
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

function formatSubline(c: PublicCoupon): string {
  const parts: string[] = []
  if (c.minOrderPaise > 0) {
    parts.push(`Min order ${formatPriceFromPaise(c.minOrderPaise)}`)
  }
  parts.push(c.scope === "GLOBAL" ? "Valid at every store" : "Store-only")
  return parts.join(" · ")
}

function formatDate(iso: string | null, expired: boolean): string | null {
  if (iso === null) return null
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return null
  const label = dt.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
  return expired ? `Expired on ${label}` : `Valid till ${label}`
}
