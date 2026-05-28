"use client"

import { useApi } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { ErrorState } from "@workspace/ui/components/error-state"
import { SafeImage } from "@workspace/ui/components/safe-image"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { ArrowLeft, Loader2, MapPin, Package, ShoppingCart, Store as StoreIcon } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useState } from "react"
import { CategorySection } from "@/components/category-section"
import { DepartmentGrid } from "@/components/department-grid"
import { ProductCard } from "@/components/product-card"
import { useCart } from "@/lib/cart"
import { formatPriceFromPaise } from "@/lib/format"

// Mirrors INITIAL_CATEGORY_SECTIONS in the backend's stores.service.ts —
// the first page of GET /v1/stores/:id already embeds this many sections, so
// the lazy continuation starts at page 2 with the same page size.
const SECTIONS_PER_PAGE = 8

export default function StoreDetailPage() {
  const params = useParams<{ id: string }>()
  const storeId = params.id
  const api = useApi()
  const cart = useCart()
  const cartCount = cart.totalItems()

  const enabled = typeof storeId === "string" && storeId.length > 0

  const detail = useQuery({
    queryKey: ["store", storeId, "detail"],
    queryFn: () => api.stores.detail(storeId),
    enabled,
  })

  // Category sections 9+ — fetched only after the user opts in (the button
  // below flips `loadMore`). useInfiniteQuery auto-fetches its first page once
  // enabled, so gating on `loadMore` keeps the initial 8 sections from
  // silently growing to 16 on every store view. Page 2 continues from the
  // backend's offset 8.
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

  return (
    <div className="min-h-svh bg-background pb-32">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border/40">
        <div className="max-w-6xl mx-auto flex items-center gap-2 px-4 sm:px-6 lg:px-8 py-3">
          <Link href="/stores" aria-label="Back to stores">
            <Button variant="secondary" size="icon">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div className="min-w-0 flex-1">
            {detail.data ? (
              <>
                <h1 className="text-base font-semibold truncate">{detail.data.store.name}</h1>
                <p className="text-xs text-muted-foreground truncate">
                  {detail.data.store.city} · {detail.data.store.pincode}
                </p>
              </>
            ) : (
              <Skeleton className="h-5 w-40" />
            )}
          </div>
        </div>
      </header>

      {/* Banner */}
      <div className="bg-muted">
        <div className="max-w-6xl mx-auto aspect-[16/9] sm:aspect-[21/9] lg:aspect-[3/1] relative overflow-hidden">
          <SafeImage
            src={detail.data?.store.imageUrl}
            alt={detail.data?.store.name ?? "Store"}
            fallback={<StoreIcon className="size-16" />}
          />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        {detail.isError && (
          <ErrorState
            className="mt-4"
            title="Couldn't load this store"
            description="The store page failed to load. Try again in a moment."
            retry={() => detail.refetch()}
          />
        )}

        {detail.data && !detail.data.store.isOpen && (
          <div className="bg-destructive/10 text-destructive rounded-[var(--radius-lg)] p-3 text-sm font-medium mb-4">
            This store is currently closed. You can still browse.
          </div>
        )}

        {detail.data && (
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">{detail.data.store.name}</h1>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
              <MapPin className="size-3.5" />
              {detail.data.store.addressLine}, {detail.data.store.city}
            </p>
            {detail.data.store.minOrderPaise > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                Minimum order{" "}
                <span className="tabular-nums text-foreground">
                  {formatPriceFromPaise(detail.data.store.minOrderPaise)}
                </span>
              </p>
            )}
          </div>
        )}

        {/* Loading skeleton for the whole body */}
        {detail.isPending && <StoreBodySkeleton />}

        {detail.data && (
          <div className="space-y-8">
            {/* Department → category tiles */}
            <DepartmentGrid storeId={storeId} departments={departments} />

            {/* Featured */}
            {featured.length > 0 && (
              <section>
                <h2 className="text-base font-semibold mb-3">Featured</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {featured.map((p) => (
                    <ProductCard key={p.id} product={p} storeId={storeId} />
                  ))}
                </div>
              </section>
            )}

            {/* Category sections (initial 8 + lazy continuation) */}
            {initialSections.map((section) => (
              <CategorySection key={section.category.id} storeId={storeId} section={section} />
            ))}
            {extraSections.map((section) => (
              <CategorySection key={section.category.id} storeId={storeId} section={section} />
            ))}

            {/* Load-more for sections beyond the initial slice. Before the
                first opt-in, `loadMore` is false so the query hasn't run yet
                and we drive it via the button; afterwards we follow
                hasNextPage. */}
            {((hasMoreSections && !loadMore) || moreSections.hasNextPage) && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!loadMore) setLoadMore(true)
                    else moreSections.fetchNextPage()
                  }}
                  disabled={moreSections.isFetching}
                >
                  {moreSections.isFetching && <Loader2 className="size-4 animate-spin" />}
                  Show more categories
                </Button>
              </div>
            )}

            {/* Empty store (no departments and no products at all) */}
            {departments.length === 0 &&
              featured.length === 0 &&
              initialSections.length === 0 && (
                <EmptyState
                  icon={<Package className="size-5" />}
                  title="No products yet"
                  description="This store hasn't listed any products."
                />
              )}
          </div>
        )}
      </div>

      {cartCount > 0 && (
        <Link
          href="/cart"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 inline-flex items-center gap-2 h-14 px-5 sm:px-6 rounded-full bg-primary text-primary-foreground shadow-lg font-medium hover:bg-primary-active transition-colors max-w-[calc(100vw-2rem)] whitespace-nowrap"
        >
          <ShoppingCart className="size-4 shrink-0" />
          <span className="tabular-nums">
            {cartCount} item{cartCount === 1 ? "" : "s"}
          </span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{formatPriceFromPaise(cart.subtotalPaise())}</span>
        </Link>
      )}
    </div>
  )
}

function StoreBodySkeleton() {
  return (
    <div className="space-y-8">
      <section>
        <Skeleton className="h-5 w-40 mb-3" />
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 sm:gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-square w-full rounded-[var(--radius-lg)]" />
              <Skeleton className="h-3 w-4/5 mx-auto" />
            </div>
          ))}
        </div>
      </section>
      <section>
        <Skeleton className="h-5 w-32 mb-3" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[var(--radius-md)] bg-card border border-border overflow-hidden"
            >
              <Skeleton className="aspect-square rounded-none" />
              <div className="p-3 space-y-2">
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
