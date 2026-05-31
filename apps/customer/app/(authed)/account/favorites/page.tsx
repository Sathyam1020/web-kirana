"use client"

/**
 * Favorite stores — frame E from the design.
 *
 * Hydrates the local favorites slice (storeIds) against /v1/stores/nearby
 * results so we can render real cards (name, image, rating, distance, ETA).
 * Each card has a star toggle (removes from favorites with a smooth fade).
 *
 * Empty state: friendly illustration + "Star a store" copy. Shown only when
 * the favorites set is genuinely empty — never as filler under a populated
 * list (mockup bug fix).
 */

import type { StoreNearbyHit } from "@workspace/api-client"
import { useApi } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { ProgressiveImage } from "@workspace/ui/components/image"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Clock, Star, Store as StoreIcon } from "lucide-react"
import Link from "next/link"
import { motion } from "motion/react"

import { NoLocationIllustration } from "@/components/illustrations"
import { useFavorites } from "@/lib/favorites"
import { formatDistance, formatEta } from "@/lib/format"
import { useUserLocation } from "@/lib/location"
import { useSmartBack } from "@/lib/use-smart-back"
import { cn } from "@workspace/ui/lib/utils"
import { springs, tapScale, useMotionPreset } from "@workspace/ui/lib/motion"

export default function FavoritesPage() {
  const onBack = useSmartBack("/account")
  const api = useApi()
  const favoriteIds = useFavorites((s) => s.storeIds)
  const removeFavorite = useFavorites((s) => s.remove)
  const { location } = useUserLocation()

  const nearby = useQuery({
    queryKey: ["stores", "nearby", location?.lat, location?.lng],
    enabled: location !== null && favoriteIds.length > 0,
    queryFn: () =>
      api.stores.nearby({
        lat: location!.lat,
        lng: location!.lng,
        radiusMeters: 50_000,
        limit: 50,
        includeClosed: true,
      }),
    staleTime: 60_000,
  })

  const empty = favoriteIds.length === 0
  // Map favorited ids → store objects (filtered to "still in range"). Stores
  // that fell out of range (or were deactivated) just drop out of the list;
  // the favorites slice keeps the id for when they return.
  const favorites = (nearby.data?.items ?? []).filter((s) =>
    favoriteIds.includes(s.id),
  )

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
          <h1 className="text-base font-semibold flex-1">Favorite stores</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-5 space-y-3">
        {empty ? (
          <EmptyFavorites />
        ) : location === null ? (
          <div className="rounded-[var(--radius-md)] border border-border bg-card py-10 px-4 flex flex-col items-center gap-3 text-center">
            <NoLocationIllustration className="w-40" />
            <h2 className="text-base font-semibold">Where are you?</h2>
            <p className="text-sm text-muted-foreground max-w-xs">
              Share your location so we can show your favorites with live
              distance + ETA.
            </p>
            <Button asChild className="mt-1">
              <Link href="/stores">Set location</Link>
            </Button>
          </div>
        ) : nearby.isPending ? (
          <FavoritesSkeleton />
        ) : favorites.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-border bg-card py-8 px-4 text-center">
            <p className="text-sm font-semibold">
              Your favorites aren’t in range
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
              They might be too far from your current location. Try again from
              a place they deliver to.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {favorites.map((store) => (
              <li key={store.id}>
                <FavoriteCard
                  store={store}
                  onRemove={() => removeFavorite(store.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

function FavoriteCard({
  store,
  onRemove,
}: {
  store: StoreNearbyHit
  onRemove: () => void
}) {
  const tap = useMotionPreset(springs.tap)
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-card overflow-hidden">
      <Link
        href={`/stores/${store.id}`}
        className="flex items-center gap-3 p-3 hover:bg-surface-soft transition-colors"
      >
        <ProgressiveImage
          src={store.imageUrl}
          alt={store.name}
          aspect="aspect-square"
          rounded="rounded-[var(--radius-md)]"
          className="w-16 shrink-0"
          fallback={<StoreIcon className="size-5 text-muted-foreground" />}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight truncate">
            {store.name}
          </p>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1 flex-wrap">
            <Clock className="size-3" aria-hidden />
            <span className="tabular-nums">
              {formatEta(store.distanceMeters)}
            </span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">
              {formatDistance(store.distanceMeters)}
            </span>
          </p>
          <p
            className={cn(
              "text-xs font-medium mt-1",
              store.isOpen ? "text-success" : "text-warning-foreground",
            )}
          >
            {store.isOpen ? "Open now" : "Closed"}
          </p>
        </div>
        <motion.button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            onRemove()
          }}
          whileTap={{ scale: tapScale }}
          transition={tap}
          aria-label={`Remove ${store.name} from favorites`}
          className="inline-flex size-9 items-center justify-center rounded-full text-primary hover:bg-primary/10 transition-colors"
        >
          <Star className="size-5" fill="currentColor" strokeWidth={0} />
        </motion.button>
      </Link>
    </div>
  )
}

function EmptyFavorites() {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-card py-10 px-4 flex flex-col items-center gap-3 text-center">
      {/* Hearts floating around a star — use the existing favorites visual
          via a composed SVG. Keep dimensions consistent with siblings. */}
      <svg
        viewBox="0 0 240 180"
        className="h-auto w-44"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="No favorites yet"
      >
        <ellipse cx="120" cy="158" rx="64" ry="6" fill="var(--surface-soft)" />
        {/* Storefront */}
        <rect
          x="78"
          y="80"
          width="84"
          height="72"
          rx="4"
          fill="var(--card)"
          stroke="var(--border)"
          strokeWidth="2"
        />
        <path d="M70 80h100l-8 -16h-84z" fill="var(--primary)" opacity="0.2" />
        <rect x="108" y="116" width="24" height="36" rx="2" fill="var(--surface-soft)" />
        {/* Big yellow star floating above */}
        <g transform="translate(120,50)">
          <path
            d="M0 -18l5 13 14 1-11 9 4 14-12 -8-12 8 4-14-11-9 14-1z"
            fill="var(--warning)"
            stroke="var(--warning)"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </g>
        {/* Mini stars */}
        <g transform="translate(64,64)">
          <path d="M0 -6l2 4 5 0-4 3 1 5-4 -3-4 3 1-5-4-3 5 0z" fill="var(--primary)" opacity="0.7" />
        </g>
        <g transform="translate(180,72)">
          <path d="M0 -5l2 4 4 0-4 3 1 4-3 -3-3 3 1-4-4-3 4 0z" fill="var(--primary)" opacity="0.5" />
        </g>
      </svg>
      <h2 className="text-base font-semibold mt-1">No favorites yet</h2>
      <p className="text-sm text-muted-foreground max-w-xs">
        Tap the star on any store to keep it here for quick access.
      </p>
      <Button asChild className="mt-1">
        <Link href="/stores">Browse stores</Link>
      </Button>
    </div>
  )
}

function FavoritesSkeleton() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <li
          key={i}
          className="rounded-[var(--radius-md)] border border-border bg-card p-3 flex items-center gap-3"
        >
          <Skeleton className="size-16 rounded-[var(--radius-md)] shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </li>
      ))}
    </ul>
  )
}
