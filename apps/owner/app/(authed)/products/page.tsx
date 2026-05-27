"use client"

import { useApi } from "@workspace/auth"
import type { ProductOwnerView } from "@workspace/api-client"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { ConfirmButton } from "@workspace/ui/components/confirm-button"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { ErrorState } from "@workspace/ui/components/error-state"
import { Input } from "@workspace/ui/components/input"
import { SafeImage } from "@workspace/ui/components/safe-image"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Switch } from "@workspace/ui/components/switch"
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import {
  Loader2,
  Package,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  Undo2,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { describeApiError, formatPriceFromPaise } from "@/lib/format"

export default function ProductsPage() {
  const api = useApi()
  const queryClient = useQueryClient()
  const [includeInactive, setIncludeInactive] = useState(false)
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.categories.list(),
  })

  const list = useQuery({
    queryKey: ["products", "me", { debounced, activeCategory, includeInactive }],
    queryFn: () =>
      api.products.list({
        limit: 100,
        includeInactive,
        category: activeCategory ?? undefined,
        q: debounced.length >= 2 ? debounced : undefined,
      }),
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["products", "me"] })
  }

  const toggleAvailable = useMutation({
    mutationFn: ({ id, next }: { id: string; next: boolean }) =>
      api.products.update(id, { isAvailable: next }),
    onSuccess: invalidate,
    onError: (err) => toast.error(describeApiError(err)),
  })

  const softDelete = useMutation({
    mutationFn: (id: string) => api.products.remove(id),
    onSuccess: () => {
      invalidate()
      toast.success("Product removed")
    },
    onError: (err) => toast.error(describeApiError(err)),
  })

  const restore = useMutation({
    mutationFn: (id: string) => api.products.restore(id),
    onSuccess: () => {
      invalidate()
      toast.success("Product restored")
    },
    onError: (err) => toast.error(describeApiError(err)),
  })

  const items = list.data?.items ?? []

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Products</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage what your store sells.
          </p>
        </div>
        <Link href="/products/new">
          <Button>
            <Plus className="size-4" />
            New
          </Button>
        </Link>
      </div>

      <Card className="p-3 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search your catalog"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-11"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={includeInactive}
            onCheckedChange={setIncludeInactive}
          />
          Include deleted
        </label>
      </Card>

      {categories.data && categories.data.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Chip
            label="All"
            active={activeCategory === null}
            onClick={() => setActiveCategory(null)}
          />
          {categories.data.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              active={activeCategory === c.id}
              onClick={() => setActiveCategory(c.id)}
            />
          ))}
        </div>
      )}

      {list.isPending && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      )}

      {list.isError && (
        <ErrorState
          title="Couldn't load your products"
          description="Try again in a moment."
          retry={() => list.refetch()}
        />
      )}

      {list.data && items.length === 0 && (
        <EmptyState
          icon={<Package className="size-5" />}
          title={
            debounced || activeCategory
              ? "No matches"
              : "No products yet"
          }
          description={
            debounced || activeCategory
              ? "Adjust your search or category filter."
              : "Add your first product to start selling."
          }
          action={
            debounced || activeCategory ? undefined : (
              <Button asChild>
                <Link href="/products/new">Add product</Link>
              </Button>
            )
          }
        />
      )}

      <ul className="space-y-2">
        {items.map((p) => (
          <li key={p.id}>
            <ProductRow
              product={p}
              onToggleAvailable={(next) =>
                toggleAvailable.mutate({ id: p.id, next })
              }
              onDelete={() => softDelete.mutate(p.id)}
              onRestore={() => restore.mutate(p.id)}
              disableActions={
                toggleAvailable.isPending ||
                softDelete.isPending ||
                restore.isPending
              }
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

function ProductRow({
  product,
  onToggleAvailable,
  onDelete,
  onRestore,
  disableActions,
}: {
  product: ProductOwnerView
  onToggleAvailable: (next: boolean) => void
  onDelete: () => void
  onRestore: () => void
  disableActions: boolean
}) {
  return (
    <Card className="p-3 flex items-center gap-3">
      <div className="size-16 shrink-0 rounded-[var(--radius-lg)] bg-muted overflow-hidden">
        <SafeImage
          src={product.imageUrl}
          alt={product.name}
          fallback={<Package className="size-5" />}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium truncate">{product.name}</p>
          {product.isFeatured && (
            <Star className="size-3.5 text-primary" fill="currentColor" />
          )}
          {!product.isActive && (
            <span className="text-[10px] uppercase font-bold tracking-wider bg-destructive/15 text-destructive rounded-full px-2 py-0.5">
              Deleted
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {product.categoryName} · {product.unit}
        </p>
        <p className="tabular-nums text-sm font-semibold mt-1">
          {formatPriceFromPaise(product.pricePaise)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {product.isActive ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {product.isAvailable ? "In stock" : "Out"}
              </span>
              <Switch
                checked={product.isAvailable}
                onCheckedChange={onToggleAvailable}
                disabled={disableActions}
              />
            </div>
            <Link href={`/products/${product.id}`} aria-label="Edit">
              <Button variant="ghost" size="icon">
                <Pencil className="size-4" />
              </Button>
            </Link>
            <ConfirmButton
              variant="ghost"
              size="icon"
              onConfirm={onDelete}
              title="Remove this product?"
              description={`"${product.name}" will be hidden from customers. You can restore it later.`}
              confirmLabel="Remove"
              destructive
              disabled={disableActions}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </ConfirmButton>
          </>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={onRestore}
            disabled={disableActions}
          >
            {disableActions ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Undo2 className="size-3.5" />
            )}
            Restore
          </Button>
        )}
      </div>
    </Card>
  )
}

function Chip({
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
          ? "inline-flex h-9 items-center rounded-full px-4 text-sm font-medium bg-primary text-primary-foreground shrink-0"
          : "inline-flex h-9 items-center rounded-full px-4 text-sm font-medium bg-muted hover:bg-surface-strong shrink-0"
      }
    >
      {label}
    </button>
  )
}
