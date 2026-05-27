"use client"

import { useApi } from "@workspace/auth"
import type { ProductOwnerView } from "@workspace/api-client"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { ErrorState } from "@workspace/ui/components/error-state"
import { Input } from "@workspace/ui/components/input"
import { SafeImage } from "@workspace/ui/components/safe-image"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { Loader2, Package, Star } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"
import { toast } from "sonner"
import { describeApiError, formatPriceFromPaise } from "@/lib/format"

export default function FeaturedPage() {
  const api = useApi()
  const queryClient = useQueryClient()

  const products = useQuery({
    queryKey: ["products", "me", "all"],
    queryFn: () => api.products.list({ limit: 100 }),
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["products", "me"] })
  }

  const feature = useMutation({
    mutationFn: ({ id, order }: { id: string; order?: number }) =>
      api.products.feature(id, order),
    onSuccess: invalidate,
    onError: (err) => toast.error(describeApiError(err)),
  })

  const unfeature = useMutation({
    mutationFn: (id: string) => api.products.unfeature(id),
    onSuccess: invalidate,
    onError: (err) => toast.error(describeApiError(err)),
  })

  const items = products.data?.items ?? []
  const featured = useMemo(
    () =>
      items
        .filter((p) => p.isFeatured)
        .sort(
          (a, b) => (a.featuredOrder ?? 0) - (b.featuredOrder ?? 0),
        ),
    [items],
  )
  const rest = useMemo(
    () => items.filter((p) => !p.isFeatured && p.isActive),
    [items],
  )

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <header>
        <h1 className="text-3xl font-semibold">Featured row</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Up to 20 products shine at the top of your store. Lower order number = higher pin.
        </p>
      </header>

      {products.isError && (
        <ErrorState
          title="Couldn't load your products"
          description="Try again — your pinned and pinnable items will reappear."
          retry={() => products.refetch()}
        />
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Pinned ({featured.length})
        </h2>
        {products.isPending && (
          <div className="space-y-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        )}
        {!products.isPending && !products.isError && featured.length === 0 && (
          <EmptyState
            icon={<Star className="size-5" />}
            title="Nothing pinned yet"
            description="Pin a product from the list below to show it at the top of your store."
          />
        )}
        <ul className="space-y-2">
          {featured.map((p) => (
            <FeaturedRow
              key={p.id}
              product={p}
              onReorder={(order) => feature.mutate({ id: p.id, order })}
              onUnpin={() => unfeature.mutate(p.id)}
              disabled={feature.isPending || unfeature.isPending}
            />
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Pin a product
        </h2>
        {products.isPending && (
          <div className="space-y-2">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        )}
        <ul className="space-y-2">
          {rest.map((p) => (
            <Card key={p.id} className="p-3 flex items-center gap-3">
              <div className="size-14 shrink-0 rounded-[var(--radius-lg)] bg-muted overflow-hidden">
                <SafeImage
                  src={p.imageUrl}
                  alt={p.name}
                  fallback={<Package className="size-4" />}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.categoryName}</p>
                <p className="tabular-nums text-sm font-semibold mt-1">
                  {formatPriceFromPaise(p.pricePaise)}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => feature.mutate({ id: p.id })}
                disabled={feature.isPending}
              >
                {feature.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Star className="size-3.5" />
                )}
                Pin
              </Button>
            </Card>
          ))}
          {rest.length === 0 && !products.isPending && !products.isError && (
            <EmptyState
              icon={<Package className="size-5" />}
              title="Nothing else to pin"
              description="All your active products are already pinned."
              action={
                <Button asChild variant="secondary">
                  <Link href="/products/new">Add a product</Link>
                </Button>
              }
            />
          )}
        </ul>
      </section>
    </div>
  )
}

function FeaturedRow({
  product,
  onReorder,
  onUnpin,
  disabled,
}: {
  product: ProductOwnerView
  onReorder: (order: number) => void
  onUnpin: () => void
  disabled: boolean
}) {
  return (
    <Card className="p-3 flex items-center gap-3">
      <Star
        className="size-4 text-primary shrink-0"
        fill="currentColor"
      />
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{product.name}</p>
        <p className="tabular-nums text-xs text-muted-foreground">
          {formatPriceFromPaise(product.pricePaise)} · {product.categoryName}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          className="w-20 h-9 text-center tabular-nums"
          defaultValue={product.featuredOrder ?? 0}
          onBlur={(e) => {
            const v = Number(e.target.value)
            if (!Number.isFinite(v)) return
            if (v === (product.featuredOrder ?? 0)) return
            onReorder(Math.max(0, Math.min(10000, Math.round(v))))
          }}
          disabled={disabled}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={onUnpin}
          disabled={disabled}
          className="text-destructive hover:text-destructive"
        >
          Unpin
        </Button>
      </div>
    </Card>
  )
}
