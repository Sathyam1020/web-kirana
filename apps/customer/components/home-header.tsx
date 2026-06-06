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

import { DeliverToTrigger } from "@/components/deliver-to-trigger"
import { HomeSearchBar } from "@/components/home-search-bar"

export function HomeHeader() {
  const api = useApi()
  const isAuthed = useIsAuthenticated()
  const status = useAuthStore((s) => s.status)

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

  return (
    <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border/40">
      <div className="max-w-md mx-auto px-4 py-3 flex flex-col gap-3">
        {/* Row 1 — deliver-to + bell + account */}
        <div className="flex items-center justify-between gap-3 min-w-0">
          <DeliverToTrigger className="flex-1 min-w-0" />
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
