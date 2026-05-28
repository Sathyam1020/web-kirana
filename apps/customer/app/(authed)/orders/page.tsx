"use client"

import type { OrderStatus } from "@workspace/api-client"
import { useApi } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { ErrorState } from "@workspace/ui/components/error-state"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Package } from "lucide-react"
import Link from "next/link"
import { formatPriceFromPaise } from "@/lib/format"
import { useSmartBack } from "@/lib/use-smart-back"

const STATUS_LABEL: Record<OrderStatus, string> = {
  PLACED: "Placed",
  ACCEPTED: "Accepted",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
}

export default function OrdersPage() {
  const api = useApi()
  const goBack = useSmartBack("/account")
  const orders = useQuery({
    queryKey: ["orders"],
    queryFn: () => api.orders.list(),
  })

  return (
    <div className="min-h-svh bg-background pb-28">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border/40 flex items-center gap-2 px-4 sm:px-6 py-3">
        <Button variant="secondary" size="icon" onClick={goBack} aria-label="Back">
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-lg font-semibold">Your orders</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-3">
        {orders.isPending &&
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-[var(--radius-md)]" />
          ))}

        {orders.isError && (
          <ErrorState
            title="Couldn't load your orders"
            description="Try again in a moment."
            retry={() => orders.refetch()}
          />
        )}

        {orders.data && orders.data.items.length === 0 && (
          <EmptyState
            icon={<Package className="size-5" />}
            title="No orders yet"
            description="When you place an order, it'll show up here."
            action={
              <Button asChild>
                <Link href="/stores">Browse stores</Link>
              </Button>
            }
          />
        )}

        {orders.data?.items.map((o) => (
          <Link
            key={o.id}
            href={`/orders/${o.id}`}
            className="block rounded-[var(--radius-md)] border border-border p-4 hover:border-primary/40 transition-colors"
          >
            <div className="flex items-center justify-between">
              <p className="font-medium truncate">{o.store.nameSnapshot}</p>
              <span className="text-xs font-semibold text-primary shrink-0">
                {STATUS_LABEL[o.status]}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1 text-sm text-muted-foreground">
              <span>
                {o.items.length} item{o.items.length === 1 ? "" : "s"} ·{" "}
                {new Date(o.placedAt).toLocaleDateString()}
              </span>
              <span className="tabular-nums font-semibold text-foreground">
                {formatPriceFromPaise(o.totalPaise)}
              </span>
            </div>
          </Link>
        ))}
      </main>
    </div>
  )
}
