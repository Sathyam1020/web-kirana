"use client"

/**
 * Store detail page — "browse this store without making it your primary".
 *
 * Reached from:
 *   - tapping the hero image on the home (you stay on this store's primary
 *     home context but get a deeper browse view)
 *   - direct deep links / shared store URLs
 *
 * Visual language matches the DP-1 home (DepartmentSections, ProductRail
 * with compact product cards, hidden scrollbars, max-w-md phone column on
 * desktop). Skips the home-only rails (Buy again, Coupons, Other nearby
 * stores) since this page is for in-store browse, not cross-store discovery.
 */

import { useApi } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { ErrorState } from "@workspace/ui/components/error-state"
import { ProgressiveImage } from "@workspace/ui/components/image"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import {
  ArrowLeft,
  Clock,
  MapPin,
  Package,
  Star,
  Store as StoreIcon,
  Timer,
} from "lucide-react"
import { useParams } from "next/navigation"
import { useState } from "react"

import { DepartmentSections } from "@/components/department-sections"
import { ProductRail } from "@/components/product-rail"
import { formatPriceFromPaise } from "@/lib/format"
import { useSmartBack } from "@/lib/use-smart-back"
import { cn } from "@workspace/ui/lib/utils"
import { motion } from "motion/react"
import { springs, tapScale, useMotionPreset } from "@workspace/ui/lib/motion"
import type { StoreTrustStats } from "@workspace/api-client"

const SECTIONS_PER_PAGE = 8

export default function StoreDetailPage() {
  const params = useParams<{ id: string }>()
  const storeId = params.id
  const api = useApi()
  const onBack = useSmartBack("/stores")
  const tap = useMotionPreset(springs.tap)
  // Favorite is visual-only in DP-1/DP-2 — real backend wiring comes later.
  const [favorited, setFavorited] = useState(false)

  const enabled = typeof storeId === "string" && storeId.length > 0

  const detail = useQuery({
    queryKey: ["store", storeId, "detail"],
    queryFn: () => api.stores.detail(storeId),
    enabled,
  })

  // Category sections 9+ — lazy-load via Show more button.
  const totalCategoryCount = detail.data?.totalCategoryCount ?? 0
  const hasMoreSections = totalCategoryCount > SECTIONS_PER_PAGE
  const [loadMore, setLoadMore] = useState(false)
  const moreSections = useInfiniteQuery({
    queryKey: ["store", storeId, "more-sections"],
    enabled: enabled && loadMore && hasMoreSections,
    initialPageParam: 2,
    queryFn: ({ pageParam }) =>
      api.stores.categories(storeId, { page: pageParam, limit: SECTIONS_PER_PAGE }),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  })

  const extraSections = moreSections.data?.pages.flatMap((p) => p.items) ?? []
  const featured = detail.data?.featuredProducts ?? []
  const initialSections = detail.data?.categorySections ?? []
  const departments = detail.data?.departments ?? []
  const activeBanner = detail.data?.activeBanner ?? null
  const store = detail.data?.store
  const stats = detail.data?.stats

  return (
    <div className="min-h-svh bg-background pb-32">
      {/* Header — back + store name + favorite. Sticky so the user can
          back out at any scroll depth. */}
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
          <div className="min-w-0 flex-1">
            {store ? (
              <>
                <h1 className="text-base font-semibold truncate">
                  {store.name}
                </h1>
                <p className="text-xs text-muted-foreground truncate">
                  {store.city} · {store.pincode}
                </p>
              </>
            ) : (
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
            )}
          </div>
          {store ? (
            <motion.button
              type="button"
              onClick={() => setFavorited((f) => !f)}
              whileTap={{ scale: tapScale }}
              transition={tap}
              aria-label={
                favorited
                  ? `Unfavorite ${store.name}`
                  : `Favorite ${store.name}`
              }
              aria-pressed={favorited}
              className={cn(
                "inline-flex size-9 items-center justify-center rounded-full",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                favorited
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Star
                className="size-5"
                strokeWidth={favorited ? 0 : 2}
                fill={favorited ? "currentColor" : "transparent"}
              />
            </motion.button>
          ) : null}
        </div>
      </header>

      {/* Promo banner — owner's active banner, full-width within the column. */}
      {activeBanner ? (
        <div className="max-w-md mx-auto px-4 pt-4">
          <ProgressiveImage
            src={activeBanner.imageUrl}
            alt={activeBanner.name}
            aspect="aspect-[16/9]"
            rounded="rounded-[var(--radius-md)]"
            fallback={<StoreIcon className="size-7 text-muted-foreground" />}
          />
        </div>
      ) : null}

      <main className="max-w-md mx-auto px-4 py-5 space-y-6">
        {detail.isError ? (
          <ErrorState
            title="Couldn't load this store"
            description="The store page failed to load. Try again in a moment."
            retry={() => detail.refetch()}
          />
        ) : null}

        {detail.isPending ? <StoreBodySkeleton /> : null}

        {store ? (
          <>
            {/* Store info card — status + address + min order + stats */}
            <section className="rounded-[var(--radius-md)] border border-border bg-card p-3 space-y-2.5">
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xs font-medium",
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
                {store.isOpen ? "Open now" : "Currently closed"}
              </span>
              <p className="text-sm flex items-start gap-1.5 text-foreground leading-tight">
                <MapPin
                  className="size-3.5 shrink-0 mt-0.5 text-muted-foreground"
                  aria-hidden
                />
                {store.addressLine}, {store.city}
              </p>
              {store.minOrderPaise > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Minimum order{" "}
                  <span className="text-foreground tabular-nums">
                    {formatPriceFromPaise(store.minOrderPaise)}
                  </span>
                </p>
              ) : null}

              {/* Trust stats — same treatment as the home hero */}
              <StatsRow stats={stats} />

              {!store.isOpen ? (
                <div className="-mx-3 -mb-3 mt-1 border-t border-border-soft bg-warning-soft px-4 py-2.5 flex items-start gap-2 rounded-b-[var(--radius-md)]">
                  <Star
                    className="size-4 shrink-0 mt-0.5 text-warning"
                    aria-hidden
                  />
                  <p className="text-xs text-foreground">
                    {store.name} is currently closed. You can browse, but
                    orders can&rsquo;t be placed until they re-open.
                  </p>
                </div>
              ) : null}
            </section>

            {/* Category drilldown — department-grouped 4-col grid */}
            <DepartmentSections
              storeId={storeId}
              storeName={store.name}
              departments={departments}
              isLoading={false}
            />

            {/* Featured rail — compact-card horizontal scroll */}
            {featured.length > 0 ? (
              <ProductRail
                title="Featured"
                products={featured}
                storeId={storeId}
                storeName={store.name}
              />
            ) : null}

            {/* Category sections — initial 8 + lazy continuation */}
            {initialSections.map((section) =>
              section.products.length === 0 ? null : (
                <ProductRail
                  key={section.category.id}
                  title={section.category.name}
                  seeAllHref={
                    section.hasMore
                      ? `/stores/${storeId}/categories/${section.category.id}`
                      : undefined
                  }
                  products={section.products}
                  storeId={storeId}
                  storeName={store.name}
                />
              ),
            )}
            {extraSections.map((section) =>
              section.products.length === 0 ? null : (
                <ProductRail
                  key={section.category.id}
                  title={section.category.name}
                  seeAllHref={
                    section.hasMore
                      ? `/stores/${storeId}/categories/${section.category.id}`
                      : undefined
                  }
                  products={section.products}
                  storeId={storeId}
                  storeName={store.name}
                />
              ),
            )}

            {/* Load-more for sections beyond the initial slice */}
            {(hasMoreSections && !loadMore) || moreSections.hasNextPage ? (
              <div className="flex justify-center pt-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!loadMore) setLoadMore(true)
                    else moreSections.fetchNextPage()
                  }}
                  disabled={moreSections.isFetching}
                  loading={moreSections.isFetching}
                >
                  Show more categories
                </Button>
              </div>
            ) : null}

            {/* Empty store — no departments, no featured, no sections */}
            {departments.length === 0 &&
            featured.length === 0 &&
            initialSections.length === 0 ? (
              <EmptyState
                icon={<Package className="size-5" />}
                title="No products yet"
                description="This store hasn't listed any products."
              />
            ) : null}
          </>
        ) : null}
      </main>
    </div>
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
    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
      {ordersPill ? (
        <StatPill icon={<StoreIcon className="size-3" />} label={ordersPill} />
      ) : null}
      {avgPill ? (
        <StatPill icon={<Timer className="size-3" />} label={avgPill} />
      ) : null}
      {onTimePill ? (
        <StatPill icon={<Clock className="size-3" />} label={onTimePill} />
      ) : null}
    </div>
  )
}

function StatPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-surface-soft text-[11px] font-medium text-muted-foreground tabular-nums">
      {icon}
      {label}
    </span>
  )
}

function roundDown(n: number): number {
  if (n >= 1000) return Math.floor(n / 100) * 100
  if (n >= 200) return Math.floor(n / 50) * 50
  if (n >= 50) return Math.floor(n / 10) * 10
  return n
}

function StoreBodySkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-24 w-full rounded-[var(--radius-md)]" />
      <section className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <div className="grid grid-cols-4 gap-x-3 gap-y-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-square w-full rounded-[var(--radius-lg)]" />
              <Skeleton className="h-3 w-3/4 mx-auto" />
            </div>
          ))}
        </div>
      </section>
      <section className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="w-[8.5rem] sm:w-[10rem] shrink-0 space-y-2"
            >
              <Skeleton className="aspect-square w-full rounded-[var(--radius-md)]" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-9 w-full rounded-full" />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
