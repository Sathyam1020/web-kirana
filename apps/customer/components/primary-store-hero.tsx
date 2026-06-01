"use client"

/**
 * The promoted "primary store" card on the new home screen — the customer
 * is shopping AT this store; everything below the hero is relative to it.
 *
 * - "Change" link opens the choose-store sheet (handled by parent).
 * - Favorite star is **visual-only in DP-1** — a proper favorites feature
 *   lands in a later phase; we render the affordance so the layout matches
 *   the design without committing to half-baked behavior.
 * - Stats pill row (orders this month / avg delivery / on-time %) shows
 *   only when there's enough sample size — individual pills hide when the
 *   backend returns null for them.
 * - Closed-state banner clarifies that browsing is OK but order placement
 *   isn't — replaces the warning-tinted divider from the previous version.
 */

import type {
  StoreNearbyHit,
  StoreTrustStats,
} from "@workspace/api-client"
import { ProgressiveImage } from "@workspace/ui/components/image"
import { Clock, Star, Store as StoreIcon, Timer } from "lucide-react"
import { motion } from "motion/react"
import Link from "next/link"

import { cn } from "@workspace/ui/lib/utils"
import { springs, tapScale, useMotionPreset } from "@workspace/ui/lib/motion"
import { useFavorites } from "@/lib/favorites"
import {
  estimateEta,
  formatDeliveryBy,
  formatDistance,
  formatEta,
} from "@/lib/format"

interface PrimaryStoreHeroProps {
  store: StoreNearbyHit
  stats: StoreTrustStats | undefined
  /** Total nearby store count — surfaced next to the "Change" link so
   *  first-time users see they have options without scrolling. */
  nearbyCount: number
  onChangeStore: () => void
}

export function PrimaryStoreHero({
  store,
  stats,
  nearbyCount,
  onChangeStore,
}: PrimaryStoreHeroProps) {
  const tap = useMotionPreset(springs.tap)
  // Favorites now live in the local zustand slice — taps persist + flow
  // into the /account/favorites page (DP-4).
  const favorited = useFavorites((s) => s.has(store.id))
  const toggleFavorite = useFavorites((s) => s.toggle)

  // Deadline-framed ETA: prefer the live delivery average; otherwise use the
  // straight-line estimate's upper bound so the promised arrival under-shoots
  // rather than over-promises.
  const etaIsLive = stats != null && stats.avgDeliveryMinutes !== null
  const etaMinutes = etaIsLive
    ? stats!.avgDeliveryMinutes!
    : estimateEta(store.distanceMeters).max

  return (
    <section
      aria-label={`You are shopping at ${store.name}`}
      className="rounded-[var(--radius-lg)] border border-border bg-card overflow-hidden"
    >
      <div className="flex gap-2.5 p-2">
        <Link
          href={`/stores/${store.id}`}
          className="shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-[var(--radius-md)]"
        >
          {/* DP-7: store image w-20/24 → w-16/20 + outer pad p-3 → p-2.
              Hero compresses from ~120px tall to ~90px so the actual
              browse rails reach the viewport faster. */}
          <ProgressiveImage
            src={store.imageUrl}
            alt={store.name}
            aspect="aspect-square"
            className="w-16 sm:w-20"
            fallback={<StoreIcon className="size-6" />}
          />
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/stores/${store.id}`}
              className="min-w-0 focus-visible:outline-none rounded-md"
            >
              <h2 className="text-[15px] sm:text-base font-semibold truncate leading-tight">
                {store.name}
              </h2>
            </Link>
            <div className="flex items-center gap-2 shrink-0">
              <motion.button
                type="button"
                onClick={() => toggleFavorite(store.id)}
                whileTap={{ scale: tapScale }}
                transition={tap}
                aria-label={
                  favorited
                    ? `Unfavorite ${store.name}`
                    : `Favorite ${store.name}`
                }
                aria-pressed={favorited}
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-full",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  // DP-9: favorite is a QUALITY/trust signal → amber
                  // rating role, not the action role. Stops the star from
                  // competing with the ADD buttons below it.
                  favorited ? "text-rating" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Star
                  className="size-4 transition-transform"
                  strokeWidth={favorited ? 0 : 2}
                  fill={favorited ? "currentColor" : "transparent"}
                />
              </motion.button>
              <motion.button
                type="button"
                onClick={onChangeStore}
                whileTap={{ scale: tapScale }}
                transition={tap}
                className={cn(
                  // DP-8: count-bearing chip so optionality is visible
                  // above the fold. DP-9: neutral chrome instead of
                  // primary — the chip is a quiet affordance, not THE
                  // action (the ADD buttons own that role). Keeps the
                  // hero from spawning three primary-coloured pills in
                  // the same row.
                  "shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded-full",
                  "text-[11px] font-semibold text-foreground/80 border border-border bg-surface-soft",
                  "hover:bg-surface-muted hover:text-foreground transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
                aria-label={
                  nearbyCount > 1
                    ? `Change store (${nearbyCount} nearby)`
                    : "Change store"
                }
              >
                Change
                {nearbyCount > 1 ? (
                  <>
                    <span aria-hidden className="text-muted-foreground/60">·</span>
                    <span className="tabular-nums">{nearbyCount}</span>
                  </>
                ) : null}
              </motion.button>
            </div>
          </div>

          {/* Meta line — ETA · distance · status. When the store is OPEN
              the ETA is deadline-framed ("by 7:42 pm") off the LIVE avg
              when there's enough delivery sample (kept success-tinted +
              live dot for trust), else off the straight-line estimate's
              upper bound to under-promise. When CLOSED we drop the
              deadline (no delivery is happening) and show the neutral
              duration estimate instead. */}
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
            {store.isOpen ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 font-semibold",
                  etaIsLive ? "text-success" : "text-foreground",
                )}
              >
                {etaIsLive ? (
                  <span
                    aria-hidden
                    className="inline-block size-1.5 rounded-full bg-success"
                  />
                ) : (
                  <Clock className="size-3" aria-hidden />
                )}
                <span className="tabular-nums">
                  {formatDeliveryBy(etaMinutes)}
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" aria-hidden />
                <span className="tabular-nums">
                  {formatEta(store.distanceMeters)}
                </span>
              </span>
            )}
            <span aria-hidden>·</span>
            <span className="tabular-nums">
              {formatDistance(store.distanceMeters)}
            </span>
            <span aria-hidden>·</span>
            <span
              className={cn(
                "inline-flex items-center gap-1 font-medium",
                store.isOpen ? "text-success" : "text-warning-foreground",
              )}
            >
              <span
                className={cn(
                  "inline-block size-1.5 rounded-full",
                  store.isOpen ? "bg-success" : "bg-warning",
                )}
                aria-hidden
              />
              {store.isOpen ? "Open" : "Closed"}
            </span>
            {/* IP-1 — when the store is closed, surface the opening time
                inline so the customer knows when to come back without
                having to read the banner below. Tabular nums keep the
                "07:00" aligned with the rest of the meta line. */}
            {!store.isOpen && store.openTime ? (
              <>
                <span aria-hidden className="text-muted-foreground/60">·</span>
                <span className="tabular-nums text-muted-foreground">
                  Opens at {store.openTime}
                </span>
              </>
            ) : null}
            {store.minOrderPaise > 0 ? (
              <>
                <span aria-hidden>·</span>
                <span className="tabular-nums">
                  Min ₹{(store.minOrderPaise / 100).toFixed(0)}
                </span>
              </>
            ) : null}
          </div>

          {/* Trust stats inline within the right column (next to the
              image, NOT below the hero). Pills hide individually when
              the backend hasn't accumulated enough sample. */}
          <StatsRow stats={stats} />
        </div>
      </div>

      {/* Closed banner */}
      {!store.isOpen ? (
        <div className="border-t border-border-soft bg-warning-soft px-4 py-2.5 flex items-start gap-2">
          <Star className="size-4 shrink-0 mt-0.5 text-warning" aria-hidden />
          <p className="text-xs text-foreground">
            {store.name} is currently closed. You can browse, but you won&rsquo;t
            be able to place an order until they re-open.
          </p>
        </div>
      ) : null}
    </section>
  )
}

function StatsRow({ stats }: { stats: StoreTrustStats | undefined }) {
  const ordersPill =
    stats !== undefined && stats.ordersThisMonth >= 10
      ? `${roundDown(stats.ordersThisMonth)}+ orders/mo`
      : null
  const avgPill =
    stats !== undefined && stats.avgDeliveryMinutes !== null
      ? `Avg ${stats.avgDeliveryMinutes} min`
      : null
  const onTimePill =
    stats !== undefined && stats.onTimePercent !== null
      ? `${stats.onTimePercent}% on-time`
      : null

  if (ordersPill === null && avgPill === null && onTimePill === null) return null

  // Compact pill row sits in the right column next to the image so the
  // hero stays a single horizontal block, never a tall stack of stuff
  // hanging below the image.
  return (
    <div className="mt-1.5 flex items-center gap-1 flex-wrap">
      {ordersPill ? (
        <StatPill icon={<StoreIcon className="size-2.5" />} label={ordersPill} />
      ) : null}
      {avgPill ? (
        <StatPill icon={<Timer className="size-2.5" />} label={avgPill} />
      ) : null}
      {onTimePill ? (
        <StatPill icon={<Clock className="size-2.5" />} label={onTimePill} />
      ) : null}
    </div>
  )
}

function StatPill({
  icon,
  label,
}: {
  icon: React.ReactNode
  label: string
}) {
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-surface-soft text-[10px] font-medium text-muted-foreground tabular-nums">
      {icon}
      {label}
    </span>
  )
}

// Round-down to nearest 10/50/100 for the "200+ orders" feel.
function roundDown(n: number): number {
  if (n >= 1000) return Math.floor(n / 100) * 100
  if (n >= 200) return Math.floor(n / 50) * 50
  if (n >= 50) return Math.floor(n / 10) * 10
  return n
}
