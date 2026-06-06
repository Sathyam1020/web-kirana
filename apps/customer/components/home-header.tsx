"use client"

/**
 * Sticky home header — the system the new store-first home is built on.
 *
 * Layout (mobile-first):
 *   ┌──────────────────────────────────────────────┐
 *   │ Deliver to: Home • Whitefield (▼)    🔔 👤   │
 *   │ 🔍  Search for milk, atta, eggs…             │
 *   └──────────────────────────────────────────────┘
 *
 * On scroll, the header stays pinned with a backdrop blur. The search bar
 * is part of the header (not a separate body section) so it's always
 * reachable — matching Blinkit/Zepto's convention.
 */

import { useApi, useAuthStore, useIsAuthenticated } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { useQuery } from "@tanstack/react-query"
import { Bell } from "lucide-react"
import Link from "next/link"
import { useEffect } from "react"

import { DeliverToPill } from "@/components/deliver-to-pill"
import { HomeSearchBar } from "@/components/home-search-bar"
import { useResolvedLocation, useUserLocation } from "@/lib/location"

export function HomeHeader() {
  const api = useApi()
  const isAuthed = useIsAuthenticated()
  const status = useAuthStore((s) => s.status)
  const {
    location,
    status: locStatus,
    request: requestLocation,
  } = useUserLocation()
  // IP-3 — resolves the customer's coords into a human label via Google
  // Geocoding. Cached 24h in localStorage; falls back to null on key-
  // missing or network failure (the label below then degrades to
  // "Current location").
  const { label: resolvedLabel, loading: resolvingLabel } =
    useResolvedLocation(location)

  useEffect(() => {
    if (locStatus === "idle") requestLocation()
  }, [locStatus, requestLocation])

  // Only authed customers see the bell; show the count of active orders.
  const activeOrdersQuery = useQuery({
    queryKey: ["orders", "active-count"],
    queryFn: () => api.orders.list(),
    enabled: status === "authenticated",
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  const activeCount = (activeOrdersQuery.data?.items ?? []).filter((o) =>
    ["PLACED", "ACCEPTED", "OUT_FOR_DELIVERY"].includes(o.status),
  ).length

  // IP-3 — prefer the freshly-resolved human label ("Brookefield,
  // Bengaluru") over either the persisted `location.label` (legacy
  // path, may still be a raw coord string) or the generic "Current
  // location" fallback. Only show "Locating…" / "Resolving…" while we
  // genuinely don't have a label yet; once we have ANY label, keep it
  // visible during background refreshes so the pill doesn't flicker.
  const deliverToLabel =
    locStatus === "ready" && location
      ? resolvedLabel ??
        location.label ??
        (resolvingLabel ? "Resolving…" : "Current location")
      : locStatus === "denied"
        ? "Set your location"
        : locStatus === "requesting"
          ? "Locating…"
          : "Enable location"

  return (
    <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border/40">
      <div className="max-w-md mx-auto px-4 py-3 flex flex-col gap-3">
        {/* Row 1 — deliver-to + bell + account */}
        <div className="flex items-center justify-between gap-3 min-w-0">
          <DeliverToPill
            label={deliverToLabel}
            status={locStatus}
            onClick={requestLocation}
            className="flex-1 min-w-0"
          />
          <div className="flex items-center gap-1 shrink-0">
            {/* Account access is owned by the bottom-nav Account tab —
                duplicating it in the header was noise. Only the bell stays
                here for the active-order count cue; the bottom nav covers
                the rest. */}
            {isAuthed ? (
              <Link
                href="/orders"
                aria-label={
                  activeCount > 0
                    ? `${activeCount} active order${activeCount === 1 ? "" : "s"}`
                    : "Notifications"
                }
                className="relative inline-flex size-10 items-center justify-center rounded-full hover:bg-surface-soft transition-colors"
              >
                <Bell className="size-5" aria-hidden />
                {activeCount > 0 ? (
                  <span
                    aria-hidden
                    className="absolute top-2 right-2 inline-flex min-w-4 h-4 px-1 items-center justify-center rounded-full bg-primary text-[10px] font-semibold leading-none text-primary-foreground tabular-nums"
                  >
                    {activeCount}
                  </span>
                ) : null}
              </Link>
            ) : (
              <Link href="/login">
                <Button size="sm">Sign in</Button>
              </Link>
            )}
          </div>
        </div>
        {/* Row 2 — search */}
        <HomeSearchBar />
      </div>
    </header>
  )
}
