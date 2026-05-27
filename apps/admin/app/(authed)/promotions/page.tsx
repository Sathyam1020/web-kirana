"use client"

import { useApi } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
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
import { Loader2, Search, Sparkles, X } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { describeApiError, formatPriceFromPaise } from "@/lib/format"

export default function PromotionsPage() {
  const api = useApi()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")
  const [promoteTarget, setPromoteTarget] = useState<
    { id: string; name: string } | null
  >(null)
  const [promoteUntil, setPromoteUntil] = useState("")

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const results = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => api.search.products({ q: debounced, page: 1, limit: 30 }),
    enabled: debounced.length >= 2,
  })

  const promote = useMutation({
    mutationFn: ({ id, until }: { id: string; until: string }) =>
      api.admin.promoteProduct(id, { promotedUntil: until }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["search"] })
      toast.success("Product promoted")
      setPromoteTarget(null)
      setPromoteUntil("")
    },
    onError: (err) => toast.error(describeApiError(err)),
  })

  const unpromote = useMutation({
    mutationFn: (id: string) => api.admin.unpromoteProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["search"] })
      toast.success("Unpromoted")
    },
    onError: (err) => toast.error(describeApiError(err)),
  })

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold">Promotions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Promoted products rank higher in search until they expire.
        </p>
      </header>

      <Card className="p-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search the marketplace catalog"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-11"
          />
        </div>
      </Card>

      {debounced.length < 2 && (
        <EmptyState
          icon={<Search className="size-5" />}
          title="Find a product to promote"
          description="Type at least 2 characters to search the marketplace catalog."
        />
      )}

      {debounced.length >= 2 && results.isPending && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      )}

      {debounced.length >= 2 && results.isError && (
        <ErrorState
          title="Search failed"
          description="We couldn't reach the search service. Try again."
          retry={() => results.refetch()}
        />
      )}

      {debounced.length >= 2 && results.data && results.data.items.length === 0 && (
        <EmptyState
          icon={<Search className="size-5" />}
          title={`No products for "${debounced}"`}
          description="Try a different keyword."
        />
      )}

      {results.data && results.data.items.length > 0 && (
        <ul className="space-y-2">
          {results.data.items.map((hit) => (
            <li key={hit.id}>
              <Card className="p-3 flex items-center gap-3">
                <div className="size-14 shrink-0 rounded-[var(--radius-lg)] bg-muted overflow-hidden">
                  <SafeImage
                    src={hit.imageUrl}
                    alt={hit.name}
                    fallback={<Sparkles className="size-4" />}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{hit.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {hit.storeName} · {hit.categoryName}
                  </p>
                  <p className="tabular-nums text-sm font-semibold mt-1">
                    {formatPriceFromPaise(hit.pricePaise)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setPromoteTarget({ id: hit.id, name: hit.name })
                    setPromoteUntil(
                      new Date(Date.now() + 7 * 86_400_000)
                        .toISOString()
                        .slice(0, 10),
                    )
                  }}
                  disabled={promote.isPending}
                >
                  <Sparkles className="size-3.5" />
                  Promote
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => unpromote.mutate(hit.id)}
                  disabled={unpromote.isPending}
                >
                  {unpromote.isPending && (
                    <Loader2 className="size-3.5 animate-spin" />
                  )}
                  <X className="size-3.5" />
                  Unpromote
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={promoteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setPromoteTarget(null)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Promote {promoteTarget?.name}</DialogTitle>
          </DialogHeader>
          <div>
            <label className="text-sm font-medium block mb-2">
              Promote until
            </label>
            <Input
              type="date"
              value={promoteUntil}
              onChange={(e) => setPromoteUntil(e.target.value)}
              min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
            />
            <p className="text-xs text-muted-foreground mt-2">
              Must be in the future.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPromoteTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                promoteTarget &&
                promote.mutate({
                  id: promoteTarget.id,
                  until: new Date(promoteUntil).toISOString(),
                })
              }
              disabled={!promoteUntil || promote.isPending}
            >
              {promote.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
