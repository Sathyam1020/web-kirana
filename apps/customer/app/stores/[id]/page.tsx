"use client"

import { useApi } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { ErrorState } from "@workspace/ui/components/error-state"
import { SafeImage } from "@workspace/ui/components/safe-image"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowLeft,
  MapPin,
  Package,
  ShoppingCart,
  Store as StoreIcon,
} from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useMemo, useState } from "react"
import { ProductCard } from "@/components/product-card"
import { useCart } from "@/lib/cart"
import { formatPriceFromPaise } from "@/lib/format"

export default function StoreDetailPage() {
  const params = useParams<{ id: string }>()
  const storeId = params.id
  const api = useApi()
  const [category, setCategory] = useState<string | null>(null)
  const cart = useCart()
  const cartCount = cart.totalItems()

  const detail = useQuery({
    queryKey: ["store", storeId, "detail"],
    queryFn: () => api.stores.detail(storeId),
    enabled: typeof storeId === "string" && storeId.length > 0,
  })

  const products = useQuery({
    queryKey: ["store", storeId, "products", category],
    queryFn: () =>
      api.stores.products(storeId, {
        category: category ?? undefined,
        limit: 60,
      }),
    enabled: typeof storeId === "string" && storeId.length > 0,
  })

  const featured = useMemo(() => detail.data?.featuredProducts ?? [], [detail.data])

  return (
    <div className="min-h-svh bg-background pb-32">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border/40">
        <div className="max-w-6xl mx-auto flex items-center gap-2 px-4 sm:px-6 lg:px-8 py-3">
          <Link href="/" aria-label="Back">
            <Button variant="secondary" size="icon">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div className="min-w-0 flex-1">
            {detail.data ? (
              <>
                <h1 className="text-base font-semibold truncate">
                  {detail.data.store.name}
                </h1>
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

      {/* Hero — full-bleed background, content centred via the same max-w
          as the rest of the page so the store image doesn't stretch into
          a giant letterbox on desktop monitors. */}
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
          <div className="mb-5">
            <h1 className="text-2xl font-semibold">
              {detail.data.store.name}
            </h1>
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

        {/* Category chips. top-[57px] matches the actual sticky header
            height (py-3 + h-10 button = ~57px) — adjust if the header
            chrome changes. */}
        <div className="sticky top-[57px] z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 bg-background/90 backdrop-blur-md overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            <CategoryChip
              label="All"
              active={category === null}
              onClick={() => setCategory(null)}
            />
            {detail.data?.categories.map((cat) => (
              <CategoryChip
                key={cat.id}
                label={`${cat.name} · ${cat.productCount}`}
                active={category === cat.id}
                onClick={() => setCategory(cat.id)}
              />
            ))}
          </div>
        </div>

        {/* Featured */}
        {category === null && featured.length > 0 && (
          <section className="mt-4">
            <h2 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
              Featured
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {featured.map((p) => (
                <ProductCard key={p.id} product={p} storeId={storeId} />
              ))}
            </div>
          </section>
        )}

        {/* Products grid */}
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
            {category === null ? "All products" : "Products"}
          </h2>
          {products.isPending && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
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
          {products.isError && (
            <ErrorState
              title="Couldn't load products"
              description="The product list failed to load. Try again."
              retry={() => products.refetch()}
            />
          )}
          {products.data && products.data.items.length === 0 && (
            <EmptyState
              icon={<Package className="size-5" />}
              title="No products yet"
              description={
                category === null
                  ? "This store hasn't listed any products."
                  : "Nothing in this category yet."
              }
            />
          )}
          {products.data && products.data.items.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {products.data.items.map((p) => (
                <ProductCard key={p.id} product={p} storeId={storeId} />
              ))}
            </div>
          )}
        </section>
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
          <span className="tabular-nums">
            {formatPriceFromPaise(cart.subtotalPaise())}
          </span>
        </Link>
      )}
    </div>
  )
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "inline-flex h-9 items-center rounded-full px-4 text-sm font-medium bg-primary text-primary-foreground"
          : "inline-flex h-9 items-center rounded-full px-4 text-sm font-medium bg-muted text-foreground hover:bg-surface-strong"
      }
    >
      {label}
    </button>
  )
}
