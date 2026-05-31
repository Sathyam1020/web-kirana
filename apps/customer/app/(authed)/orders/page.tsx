"use client"

/**
 * Orders list — DP-3 refresh.
 *
 * Two distinct sections:
 *   - Active orders at the top, pinned (most recent first). Each card has
 *     an inline "Track order" + call-store affordance.
 *   - Past orders below, grouped by month (e.g. "This month", "March").
 *     Each card has a "Reorder" CTA that opens the 3-case ReorderDialog.
 *
 * Empty / loading / error states each get their own treatment with
 * illustrations from the DP-1 set.
 *
 * Reorder polls realtime via socket; the slow fallback refetch keeps the
 * page accurate if sockets are down.
 */

import type { OrderStatus, OrderView } from "@workspace/api-client"
import { useApi } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { ErrorState } from "@workspace/ui/components/error-state"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import { NoOrdersIllustration } from "@/components/illustrations"
import { OrderCard } from "@/components/order-card"
import { ReorderDialog } from "@/components/reorder-dialog"
import { useSmartBack } from "@/lib/use-smart-back"

const ACTIVE: OrderStatus[] = ["PLACED", "ACCEPTED", "OUT_FOR_DELIVERY"]

export default function OrdersPage() {
  const api = useApi()
  const goBack = useSmartBack("/account")
  const orders = useQuery({
    queryKey: ["orders"],
    queryFn: () => api.orders.list(),
    refetchInterval: 60_000,
  })

  const [reorderTarget, setReorderTarget] = useState<OrderView | null>(null)

  const grouped = useMemo(
    () => groupOrders(orders.data?.items ?? []),
    [orders.data?.items],
  )

  return (
    <div className="min-h-svh bg-background pb-28">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border/40">
        <div className="max-w-md mx-auto flex items-center gap-2 px-4 py-3">
          <Button variant="secondary" size="icon" onClick={goBack} aria-label="Back">
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="text-base font-semibold flex-1">Your orders</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-5 space-y-4">
        {orders.isPending ? <OrdersSkeleton /> : null}

        {orders.isError ? (
          <ErrorState
            title="Couldn’t load your orders"
            description="Try again in a moment."
            retry={() => orders.refetch()}
          />
        ) : null}

        {orders.data && orders.data.items.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-border bg-card py-10 px-4 flex flex-col items-center gap-3 text-center mt-8">
            <NoOrdersIllustration className="w-44" />
            <h2 className="text-base font-semibold">No orders yet</h2>
            <p className="text-sm text-muted-foreground max-w-xs">
              When you place an order, it’ll show up here. Browse stores to
              get started.
            </p>
            <Button asChild className="mt-1">
              <Link href="/stores">Browse stores</Link>
            </Button>
          </div>
        ) : null}

        {grouped.active.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-1">
              Active orders
            </h2>
            <ul className="space-y-2">
              {grouped.active.map((o) => (
                <li key={o.id}>
                  <OrderCard order={o} onReorder={() => setReorderTarget(o)} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {grouped.pastByMonth.length > 0 ? (
          <section className="space-y-4">
            <div className="flex items-baseline justify-between px-1">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Past orders
              </h2>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {grouped.pastCount} total
              </span>
            </div>
            {grouped.pastByMonth.map(([month, list]) => (
              <div key={month} className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground px-1">
                  {month}
                </h3>
                <ul className="space-y-2">
                  {list.map((o) => (
                    <li key={o.id}>
                      <OrderCard
                        order={o}
                        onReorder={() => setReorderTarget(o)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ) : null}
      </main>

      {reorderTarget ? (
        <ReorderDialog
          open
          onOpenChange={(o) => {
            if (!o) setReorderTarget(null)
          }}
          items={reorderTarget.items}
          totalPaise={reorderTarget.totalPaise}
          storeId={reorderTarget.store.id}
          storeName={reorderTarget.store.nameSnapshot}
        />
      ) : null}
    </div>
  )
}

/**
 * Split orders into active vs past, with past grouped by month. Month label
 * is "This month" for the current month, otherwise the month name.
 */
function groupOrders(items: OrderView[]): {
  active: OrderView[]
  pastByMonth: Array<[string, OrderView[]]>
  pastCount: number
} {
  const active: OrderView[] = []
  const past: OrderView[] = []
  for (const o of items) {
    if (ACTIVE.includes(o.status)) active.push(o)
    else past.push(o)
  }
  const now = new Date()
  const sameMonth = (d: Date) =>
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  const groups = new Map<string, OrderView[]>()
  for (const o of past) {
    const dt = new Date(o.placedAt)
    const label = sameMonth(dt)
      ? "This month"
      : dt.toLocaleDateString(undefined, { month: "long", year: "numeric" })
    const arr = groups.get(label)
    if (arr) arr.push(o)
    else groups.set(label, [o])
  }
  return {
    active,
    pastByMonth: Array.from(groups.entries()),
    pastCount: past.length,
  }
}

function OrdersSkeleton() {
  return (
    <>
      <section className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-28 w-full rounded-[var(--radius-md)]" />
      </section>
      <section className="space-y-3">
        <Skeleton className="h-3 w-24" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-24 w-full rounded-[var(--radius-md)]"
          />
        ))}
      </section>
    </>
  )
}
