"use client"

import type { OrderStatus } from "@workspace/api-client"
import { useApi } from "@workspace/auth"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { ErrorState } from "@workspace/ui/components/error-state"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useQuery } from "@tanstack/react-query"
import { Package } from "lucide-react"
import Link from "next/link"
import { formatPriceFromPaise } from "@/lib/format"

const STATUS_LABEL: Record<OrderStatus, string> = {
  PLACED: "New",
  ACCEPTED: "Accepted",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
}

function statusTone(status: OrderStatus): string {
  if (status === "DELIVERED") return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
  if (status === "REJECTED" || status === "CANCELLED") return "bg-destructive/10 text-destructive"
  return "bg-primary/10 text-primary"
}

export default function OwnerOrdersPage() {
  const api = useApi()
  const orders = useQuery({
    queryKey: ["owner-orders"],
    queryFn: () => api.stores.orders(),
  })

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Orders</h1>

      {orders.isPending && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-[var(--radius-md)]" />
          ))}
        </div>
      )}

      {orders.isError && (
        <ErrorState
          title="Couldn't load orders"
          description="Try again in a moment."
          retry={() => orders.refetch()}
        />
      )}

      {orders.data && orders.data.items.length === 0 && (
        <EmptyState
          icon={<Package className="size-5" />}
          title="No orders yet"
          description="Incoming orders will appear here."
        />
      )}

      <div className="space-y-3">
        {orders.data?.items.map((o) => (
          <Link
            key={o.id}
            href={`/orders/${o.id}`}
            className="block rounded-[var(--radius-md)] border border-border p-4 hover:border-primary/40 transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium truncate">{o.customer.nameSnapshot}</p>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone(o.status)}`}
              >
                {STATUS_LABEL[o.status]}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1 text-sm text-muted-foreground">
              <span>
                {o.items.length} item{o.items.length === 1 ? "" : "s"} ·{" "}
                {new Date(o.placedAt).toLocaleString()}
              </span>
              <span className="tabular-nums font-semibold text-foreground">
                {formatPriceFromPaise(o.totalPaise)}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
