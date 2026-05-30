"use client"

import { useApi, useAuthStore, useIsAuthenticated } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { ErrorState } from "@workspace/ui/components/error-state"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { ThemeToggle } from "@workspace/ui/components/theme-toggle"
import { useQuery } from "@tanstack/react-query"
import { motion } from "motion/react"
import { Search, ShoppingBag, Store, User } from "lucide-react"
import Link from "next/link"
import { useEffect } from "react"
import { BrandMark } from "@/components/brand-mark"
import { LocationPill } from "@/components/location-pill"
import { StoreCard } from "@/components/store-card"
import { useUserLocation } from "@/lib/location"

export default function StoresPage() {
  const api = useApi()
  // useIsAuthenticated returns the SSR-cookie hint until client hydration
  // completes, then switches to the live store status — so first paint
  // matches the eventual UI and there's no Sign in → Account flicker.
  const isAuthed = useIsAuthenticated()
  const user = useAuthStore((s) => s.user)
  const { location, status: locStatus, request: requestLocation } = useUserLocation()

  useEffect(() => {
    if (locStatus === "idle") requestLocation()
  }, [locStatus, requestLocation])

  const nearbyQuery = useQuery({
    queryKey: ["stores", "nearby", location?.lat, location?.lng],
    enabled: location !== null,
    queryFn: () =>
      api.stores.nearby({
        lat: location!.lat,
        lng: location!.lng,
        // Outer cap only — the backend already filters by each store's own
        // deliveryRadiusMeters. Keep this generous so a store with a wide
        // delivery reach still appears for a customer at the edge of it.
        radiusMeters: 50_000,
        limit: 30,
        includeClosed: true,
      }),
    staleTime: 60_000,
  })

  return (
    <div className="min-h-svh bg-background pb-24">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border/40">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 lg:px-8 py-3 gap-3">
          <BrandMark className="text-2xl" />
          <div className="hidden md:block flex-1 max-w-md">
            <Link
              href="/search"
              className="flex items-center gap-2 h-10 px-4 rounded-full bg-muted text-sm text-muted-foreground hover:bg-surface-strong transition-colors"
            >
              <Search className="size-4" />
              Search products and stores…
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/search" aria-label="Search" className="md:hidden">
              <Button variant="secondary" size="icon">
                <Search className="size-4" />
              </Button>
            </Link>
            <ThemeToggle />
            {isAuthed ? (
              <Link href="/account" aria-label="Account">
                <Button variant="secondary" size="icon">
                  <User className="size-4" />
                </Button>
              </Link>
            ) : (
              <Link href="/login">
                <Button size="sm">Sign in</Button>
              </Link>
            )}
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-3 flex items-center gap-2">
          <LocationPill
            status={locStatus}
            label={
              locStatus === "ready" && location
                ? location.label ??
                  `Around ${location.lat.toFixed(3)}, ${location.lng.toFixed(3)}`
                : locStatus === "denied"
                  ? "Set your location"
                  : "Locate me"
            }
            onClick={requestLocation}
          />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {isAuthed && user && (
          <p className="text-sm text-muted-foreground mb-2">
            Hi {user.name.split(" ")[0]} 👋
          </p>
        )}

        <div className="flex items-end justify-between mb-5">
          <div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
              Stores nearby
            </h1>
            {nearbyQuery.data && nearbyQuery.data.items.length > 0 && (
              <p className="text-sm text-muted-foreground mt-1">
                {nearbyQuery.data.items.length} store
                {nearbyQuery.data.items.length === 1 ? "" : "s"} within 5 km
              </p>
            )}
          </div>
        </div>

        {location === null && locStatus !== "requesting" && (
          <EmptyState
            icon={<ShoppingBag className="size-5" />}
            title="Where are you?"
            description="Share your location so we can show kirana stores delivering to you."
            action={<Button onClick={requestLocation}>Share location</Button>}
          />
        )}

        {nearbyQuery.isPending && location !== null && (
          <SkeletonGrid count={6} />
        )}

        {nearbyQuery.isError && (
          <ErrorState
            title="Couldn't load nearby stores"
            description="Check your connection and try again."
            retry={() => nearbyQuery.refetch()}
          />
        )}

        {nearbyQuery.data && nearbyQuery.data.items.length === 0 && (
          <EmptyState
            icon={<Store className="size-5" />}
            title="No stores yet"
            description="We don't have any kirana stores in this radius yet. We'll be here soon."
          />
        )}

        {nearbyQuery.data && nearbyQuery.data.items.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ staggerChildren: 0.04 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5"
          >
            {nearbyQuery.data.items.map((store, i) => (
              <motion.div
                key={store.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.25,
                  delay: Math.min(i * 0.04, 0.4),
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <StoreCard store={store} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </main>

    </div>
  )
}

function SkeletonGrid({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-[var(--radius-md)] bg-card border border-border overflow-hidden"
        >
          <Skeleton className="aspect-[16/9] rounded-none" />
          <div className="p-4 space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}
