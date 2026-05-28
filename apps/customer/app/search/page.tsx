"use client"

import { useApi } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { ErrorState } from "@workspace/ui/components/error-state"
import { Input } from "@workspace/ui/components/input"
import { SafeImage } from "@workspace/ui/components/safe-image"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Search as SearchIcon, ShoppingBag, X } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { formatPriceFromPaise } from "@/lib/format"
import { useUserLocation } from "@/lib/location"

const RECENTS_KEY = "kirana.recent-searches"

function readRecents(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string").slice(0, 8)
    return []
  } catch {
    return []
  }
}

function pushRecent(q: string): void {
  if (typeof window === "undefined") return
  const trimmed = q.trim()
  if (trimmed.length === 0) return
  const cur = readRecents().filter((x) => x.toLowerCase() !== trimmed.toLowerCase())
  cur.unshift(trimmed)
  window.localStorage.setItem(RECENTS_KEY, JSON.stringify(cur.slice(0, 8)))
}

export default function SearchPage() {
  const api = useApi()
  const { location } = useUserLocation()
  const [raw, setRaw] = useState("")
  const [debounced, setDebounced] = useState("")
  const [recents, setRecents] = useState<string[]>([])

  useEffect(() => {
    setRecents(readRecents())
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(raw.trim())
      if (raw.trim().length >= 2) pushRecent(raw.trim())
    }, 300)
    return () => clearTimeout(t)
  }, [raw])

  const results = useQuery({
    queryKey: ["search", debounced, location?.lat, location?.lng],
    queryFn: () =>
      api.search.products({
        q: debounced,
        page: 1,
        limit: 30,
        lat: location?.lat,
        lng: location?.lng,
        radiusMeters: location ? 5000 : undefined,
      }),
    enabled: debounced.length >= 2,
  })

  const showRecents = debounced.length < 2

  const hasResults = useMemo(
    () => results.data && results.data.items.length > 0,
    [results.data],
  )

  return (
    <div className="min-h-svh bg-background pb-32">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border/40 px-4 sm:px-6 py-3 flex items-center gap-2">
        <Link href="/stores" aria-label="Back">
          <Button variant="secondary" size="icon">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div className="flex-1 relative">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search products and stores"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            className="pl-11 h-12"
            autoFocus
          />
          {raw && (
            <button
              type="button"
              onClick={() => setRaw("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 size-6 rounded-full bg-muted inline-flex items-center justify-center"
              aria-label="Clear"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </header>

      <main className="px-4 sm:px-6 pt-4">
        {showRecents && recents.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Recent searches
            </h2>
            <div className="flex flex-wrap gap-2">
              {recents.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRaw(r)}
                  className="h-9 px-3 rounded-full bg-muted text-sm hover:bg-surface-strong"
                >
                  {r}
                </button>
              ))}
            </div>
          </section>
        )}

        {showRecents && recents.length === 0 && (
          <p className="text-sm text-muted-foreground mt-12 text-center">
            Try &ldquo;atta&rdquo;, &ldquo;doodh&rdquo;, or a store name. We&apos;ll find what&apos;s close to you.
          </p>
        )}

        {!showRecents && results.isPending && (
          <ul className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <li
                key={i}
                className="flex gap-3 p-3 rounded-[var(--radius-md)] bg-card border border-border"
              >
                <Skeleton className="size-16 rounded-[var(--radius-lg)] shrink-0" />
                <div className="min-w-0 flex-1 space-y-2 py-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </li>
            ))}
          </ul>
        )}

        {!showRecents && results.isError && (
          <ErrorState
            className="mt-6"
            title="Search failed"
            description="We couldn't reach the search service. Try again."
            retry={() => results.refetch()}
          />
        )}

        {!showRecents && hasResults && (
          <ul className="space-y-3">
            {results.data!.items.map((hit) => (
              <li key={hit.id}>
                <Link
                  href={`/stores/${hit.storeId}`}
                  className="flex gap-3 p-3 rounded-[var(--radius-md)] bg-card border border-border hover:shadow-md transition-shadow"
                >
                  <div className="size-16 shrink-0 rounded-[var(--radius-lg)] bg-muted overflow-hidden">
                    <SafeImage
                      src={hit.imageUrl}
                      alt={hit.name}
                      fallback={<ShoppingBag className="size-5" />}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-sm truncate">{hit.name}</h3>
                    <p className="text-xs text-muted-foreground truncate">
                      {hit.storeName} · {hit.categoryName}
                    </p>
                    <p className="tabular-nums text-sm font-semibold mt-1">
                      {formatPriceFromPaise(hit.pricePaise)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {!showRecents && results.data && results.data.items.length === 0 && (
          <EmptyState
            className="mt-6"
            icon={<SearchIcon className="size-5" />}
            title={`No results for "${debounced}"`}
            description="Try a shorter or differently-spelled query."
          />
        )}
      </main>
    </div>
  )
}
