"use client"

import { useApi } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { ErrorState } from "@workspace/ui/components/error-state"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { ArrowLeft, Loader2, Package, ShoppingCart } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useState } from "react"
import { ProductCard } from "@/components/product-card"
import { SubcategoryRail } from "@/components/subcategory-rail"
import { useCart } from "@/lib/cart"
import { formatPriceFromPaise } from "@/lib/format"

const PRODUCTS_PER_PAGE = 24

export default function CategoryPage() {
  const params = useParams<{ id: string; categoryId: string }>()
  const storeId = params.id
  const categoryId = params.categoryId
  const api = useApi()
  const cart = useCart()
  const cartCount = cart.totalItems()

  const enabled =
    typeof storeId === "string" &&
    storeId.length > 0 &&
    typeof categoryId === "string" &&
    categoryId.length > 0

  const [selectedSub, setSelectedSub] = useState<string | null>(null)

  const subcategories = useQuery({
    queryKey: ["store", storeId, "category", categoryId, "subcategories"],
    queryFn: () => api.subcategories.publicForStoreCategory(storeId, categoryId),
    enabled,
  })

  const products = useInfiniteQuery({
    queryKey: ["store", storeId, "category", categoryId, "products", selectedSub],
    enabled,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.stores.products(storeId, {
        categoryId,
        subcategoryId: selectedSub ?? undefined,
        page: pageParam,
        limit: PRODUCTS_PER_PAGE,
      }),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  })

  const items = products.data?.pages.flatMap((p) => p.items) ?? []
  // The category name isn't on the subcategory payload; derive it from the
  // first product (every ProductPublicView carries the full taxonomy chain).
  const categoryName = items[0]?.categoryName ?? null

  return (
    <div className="min-h-svh bg-background flex flex-col">
      <header className="sticky top-0 z-30 h-14 flex items-center bg-background/90 backdrop-blur-md border-b border-border/40">
        <div className="flex items-center gap-2 px-3 sm:px-4 w-full">
          <Link href={`/stores/${storeId}`} aria-label="Back to store">
            <Button variant="secondary" size="icon">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div className="min-w-0 flex-1">
            {categoryName ? (
              <h1 className="text-base font-semibold truncate">{categoryName}</h1>
            ) : products.isPending ? (
              <Skeleton className="h-5 w-40" />
            ) : (
              <h1 className="text-base font-semibold truncate">Category</h1>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 w-full">
        {/* Left rail — full-height, sticky, independently scrollable */}
        {subcategories.isPending ? (
          <aside className="sticky top-14 h-[calc(100svh-3.5rem)] w-20 sm:w-28 md:w-48 lg:w-56 shrink-0 overflow-y-auto border-r border-border/60 bg-surface-soft/40 py-2 px-2.5 sm:px-3 space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </aside>
        ) : (
          <SubcategoryRail
            subcategories={subcategories.data ?? []}
            selected={selectedSub}
            onSelect={setSelectedSub}
          />
        )}

        {/* Right pane — products (page scrolls) */}
        <main className="flex-1 min-w-0 p-3 sm:p-4 lg:p-6">
          {products.isError && (
            <ErrorState
              title="Couldn't load products"
              description="The product list failed to load. Try again."
              retry={() => products.refetch()}
            />
          )}

          {products.isPending && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {Array.from({ length: 10 }).map((_, i) => (
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
          )}

          {products.data && items.length === 0 && (
            <EmptyState
              icon={<Package className="size-5" />}
              title="Nothing here yet"
              description={
                selectedSub === null
                  ? "This category has no products yet."
                  : "Nothing in this subcategory yet."
              }
            />
          )}

          {items.length > 0 && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {items.map((p) => (
                  <ProductCard key={p.id} product={p} storeId={storeId} />
                ))}
              </div>
              {products.hasNextPage && (
                <div className="flex justify-center pt-6">
                  <Button
                    variant="secondary"
                    onClick={() => products.fetchNextPage()}
                    disabled={products.isFetchingNextPage}
                  >
                    {products.isFetchingNextPage && (
                      <Loader2 className="size-4 animate-spin" />
                    )}
                    Load more
                  </Button>
                </div>
              )}
            </>
          )}
        </main>
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
