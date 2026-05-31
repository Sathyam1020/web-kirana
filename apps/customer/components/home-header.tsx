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
import { Bell, User } from "lucide-react"
import Link from "next/link"
import { useEffect } from "react"

import { DeliverToPill } from "@/components/deliver-to-pill"
import { HomeSearchBar } from "@/components/home-search-bar"
import { useUserLocation } from "@/lib/location"

export function HomeHeader() {
  const api = useApi()
  const isAuthed = useIsAuthenticated()
  const status = useAuthStore((s) => s.status)
  const {
    location,
    status: locStatus,
    request: requestLocation,
  } = useUserLocation()

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

  const deliverToLabel =
    locStatus === "ready" && location
      ? location.label ?? "Current location"
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
            ) : null}
            {isAuthed ? (
              <Link
                href="/account"
                aria-label="Account"
                className="inline-flex size-10 items-center justify-center rounded-full hover:bg-surface-soft transition-colors"
              >
                <User className="size-5" aria-hidden />
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
