"use client"

/**
 * "Other nearby stores" rail — everything from /v1/stores/nearby except the
 * currently-selected primary. Tapping a row promotes that store to primary
 * (with cart-clear confirm via the existing dialog if needed).
 *
 * Layout per row matches the mockup: thumbnail-left, info-right, in a
 * vertical stack (not a horizontal carousel). This keeps the visual
 * hierarchy "your store is special; these are the alternatives".
 */

import type { StoreNearbyHit } from "@workspace/api-client"
import { ProgressiveImage } from "@workspace/ui/components/image"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { ChevronRight, Clock, Store as StoreIcon } from "lucide-react"
import { motion } from "motion/react"

import { cn } from "@workspace/ui/lib/utils"
import { springs, useMotionPreset } from "@workspace/ui/lib/motion"
import { formatDistance, formatEta, formatPriceFromPaise } from "@/lib/format"

interface OtherStoresRailProps {
  stores: StoreNearbyHit[] | undefined
  isLoading: boolean
  onPickStore: (storeId: string) => void
  onSeeAll: () => void
}

const VISIBLE = 4

export function OtherStoresRail({
  stores,
  isLoading,
  onPickStore,
  onSeeAll,
}: OtherStoresRailProps) {
  const hasStores = !isLoading && (stores?.length ?? 0) > 0
  if (!isLoading && !hasStores) return null

  return (
    <section aria-label="Other nearby stores" className="space-y-3">
      <div className="flex items-end justify-between">
        <h3 className="text-base font-semibold">Other nearby stores</h3>
        {hasStores && (stores?.length ?? 0) > VISIBLE ? (
          <button
            type="button"
            onClick={onSeeAll}
            className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            See all
          </button>
        ) : null}
      </div>

      <ul className="flex flex-col gap-2">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => <RowSkeleton key={`skel-${i}`} />)
          : stores?.slice(0, VISIBLE).map((store) => (
              <StoreRow
                key={store.id}
                store={store}
                onPick={() => onPickStore(store.id)}
              />
            ))}
      </ul>
    </section>
  )
}

function StoreRow({
  store,
  onPick,
}: {
  store: StoreNearbyHit
  onPick: () => void
}) {
  const tap = useMotionPreset(springs.tap)

  return (
    <li>
      <motion.button
        type="button"
        onClick={onPick}
        whileTap={{ scale: 0.99 }}
        transition={tap}
        className={cn(
          "flex w-full items-center gap-3 text-left",
          "rounded-[var(--radius-md)] border border-border bg-card",
          "p-2.5 hover:border-border-strong transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <ProgressiveImage
          src={store.imageUrl}
          alt={store.name}
          aspect="aspect-square"
          rounded="rounded-[var(--radius-md)]"
          className="w-16 shrink-0"
          fallback={<StoreIcon className="size-6 text-muted-foreground" />}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight truncate">
            {store.name}
          </p>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5 flex-wrap">
            <Clock className="size-3" aria-hidden />
            <span className="tabular-nums">{formatEta(store.distanceMeters)}</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">
              {formatDistance(store.distanceMeters)}
            </span>
          </p>
          <p
            className={cn(
              "text-xs font-medium mt-0.5",
              store.isOpen ? "text-success" : "text-warning-foreground",
            )}
          >
            {store.isOpen
              ? store.minOrderPaise > 0
                ? `Open · Min ${formatPriceFromPaise(store.minOrderPaise)}`
                : "Open now"
              : "Closed"}
          </p>
        </div>
        <ChevronRight className="size-4 text-muted-foreground shrink-0" aria-hidden />
      </motion.button>
    </li>
  )
}

function RowSkeleton() {
  return (
    <li className="rounded-[var(--radius-md)] border border-border bg-card p-2.5 flex items-center gap-3">
      <Skeleton className="size-16 rounded-[var(--radius-md)] shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </li>
  )
}
