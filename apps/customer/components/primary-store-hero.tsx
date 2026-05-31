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
import { formatDistance, formatEta } from "@/lib/format"

interface PrimaryStoreHeroProps {
  store: StoreNearbyHit
  stats: StoreTrustStats | undefined
  onChangeStore: () => void
}

export function PrimaryStoreHero({
  store,
  stats,
  onChangeStore,
}: PrimaryStoreHeroProps) {
  const tap = useMotionPreset(springs.tap)
  // Favorites now live in the local zustand slice — taps persist + flow
  // into the /account/favorites page (DP-4).
  const favorited = useFavorites((s) => s.has(store.id))
  const toggleFavorite = useFavorites((s) => s.toggle)

  return (
    <section
      aria-label={`You are shopping at ${store.name}`}
      className="rounded-[var(--radius-lg)] border border-border bg-card overflow-hidden"
    >
      <div className="flex gap-3 p-3">
        <Link
          href={`/stores/${store.id}`}
          className="shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-[var(--radius-md)]"
        >
          <ProgressiveImage
            src={store.imageUrl}
            alt={store.name}
            aspect="aspect-square"
            className="w-20 sm:w-24"
            fallback={<StoreIcon className="size-7" />}
          />
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/stores/${store.id}`}
              className="min-w-0 focus-visible:outline-none rounded-md"
            >
              <h2 className="text-base sm:text-lg font-semibold truncate leading-tight">
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
                  favorited ? "text-primary" : "text-muted-foreground hover:text-foreground",
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
                  "shrink-0 text-xs font-semibold text-primary",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md",
                  "px-1 py-0.5",
                )}
              >
                Change
              </motion.button>
            </div>
          </div>

          {/* Meta line — ETA · distance · status */}
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" aria-hidden />
              <span className="tabular-nums">
                {formatEta(store.distanceMeters)}
              </span>
            </span>
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
          </div>

          {/* Min order line — reserves height when absent. */}
          <p className="mt-1 text-xs text-muted-foreground min-h-4 leading-tight">
            {store.minOrderPaise > 0 ? (
              <>
                Min order{" "}
                <span className="text-foreground tabular-nums">
                  ₹{(store.minOrderPaise / 100).toFixed(0)}
                </span>
              </>
            ) : null}
          </p>
        </div>
      </div>

      {/* Trust stats row — individual pills hide when null. */}
      <StatsRow stats={stats} />

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
      ? `${roundDown(stats.ordersThisMonth)}+ orders this month`
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

  return (
    <div className="px-3 pb-3 -mt-1 flex items-center gap-1.5 flex-wrap">
      {ordersPill ? <StatPill icon={<StoreIcon className="size-3" />} label={ordersPill} /> : null}
      {avgPill ? <StatPill icon={<Timer className="size-3" />} label={avgPill} /> : null}
      {onTimePill ? <StatPill icon={<Clock className="size-3" />} label={onTimePill} /> : null}
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
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-surface-soft text-[11px] font-medium text-muted-foreground tabular-nums">
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
