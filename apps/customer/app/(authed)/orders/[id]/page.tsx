"use client"

import type { OrderStatus } from "@workspace/api-client"
import { useApi } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { ErrorState } from "@workspace/ui/components/error-state"
import { SafeImage } from "@workspace/ui/components/safe-image"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, MapPin, ShoppingBag } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { formatPriceFromPaise } from "@/lib/format"

const STATUS_LABEL: Record<OrderStatus, string> = {
  PLACED: "Order placed",
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

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>()
  const api = useApi()
  const orderId = params.id

  const order = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => api.orders.get(orderId),
    enabled: typeof orderId === "string" && orderId.length > 0,
  })

  return (
    <div className="min-h-svh bg-background pb-12">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border/40 flex items-center gap-2 px-4 sm:px-6 py-3">
        <Link href="/orders" aria-label="Back to orders">
          <Button variant="secondary" size="icon">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <h1 className="text-lg font-semibold">Order</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {order.isPending && (
          <>
            <Skeleton className="h-16 w-full rounded-[var(--radius-md)]" />
            <Skeleton className="h-40 w-full rounded-[var(--radius-md)]" />
          </>
        )}

        {order.isError && (
          <ErrorState
            title="Couldn't load this order"
            description="It may not exist or isn't yours."
            retry={() => order.refetch()}
          />
        )}

        {order.data && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <span
                  className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${statusTone(order.data.status)}`}
                >
                  {STATUS_LABEL[order.data.status]}
                </span>
                <p className="text-xs text-muted-foreground mt-2">
                  {new Date(order.data.placedAt).toLocaleString()}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">#{order.data.id.slice(-6)}</p>
            </div>

            {/* Store */}
            <div className="rounded-[var(--radius-md)] border border-border p-4">
              <p className="font-semibold">{order.data.store.nameSnapshot}</p>
              <p className="text-sm text-muted-foreground">{order.data.store.phoneSnapshot}</p>
            </div>

            {/* Items */}
            <div className="rounded-[var(--radius-md)] border border-border divide-y divide-border">
              {order.data.items.map((it) => (
                <div key={it.id} className="flex items-center gap-3 p-3">
                  <div className="size-12 shrink-0 rounded-[var(--radius-sm)] bg-surface-soft overflow-hidden">
                    <SafeImage
                      src={it.imageUrlSnapshot}
                      alt={it.nameSnapshot}
                      fallback={<ShoppingBag className="size-4" />}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{it.nameSnapshot}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatPriceFromPaise(it.unitPricePaiseSnapshot)} × {it.quantity}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums">
                    {formatPriceFromPaise(it.lineTotalPaise)}
                  </p>
                </div>
              ))}
            </div>

            {/* Bill */}
            <div className="bg-muted rounded-[var(--radius-lg)] p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="tabular-nums">
                  {formatPriceFromPaise(order.data.itemsSubtotalPaise)}
                </span>
              </div>
              {order.data.discountPaise > 0 && (
                <div className="flex justify-between text-foreground/70">
                  <span>Discount{order.data.couponCode ? ` (${order.data.couponCode})` : ""}</span>
                  <span className="tabular-nums">
                    − {formatPriceFromPaise(order.data.discountPaise)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>Delivery</span>
                <span>{order.data.deliveryFeePaise > 0 ? formatPriceFromPaise(order.data.deliveryFeePaise) : "Free"}</span>
              </div>
              <div className="flex justify-between font-semibold pt-2 border-t border-border/60">
                <span>Total · Pay on delivery</span>
                <span className="tabular-nums">{formatPriceFromPaise(order.data.totalPaise)}</span>
              </div>
            </div>

            {/* Delivery address */}
            <div className="rounded-[var(--radius-md)] border border-border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Delivering to
              </p>
              <p className="text-sm flex items-start gap-2">
                <MapPin className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
                <span>
                  <span className="font-medium">{order.data.delivery.label}</span> ·{" "}
                  {order.data.delivery.line1}
                  {order.data.delivery.line2 ? `, ${order.data.delivery.line2}` : ""},{" "}
                  {order.data.delivery.city} {order.data.delivery.pincode}
                </span>
              </p>
            </div>

            {order.data.customerNote && (
              <p className="text-sm text-muted-foreground">
                Note: {order.data.customerNote}
              </p>
            )}
          </>
        )}
      </main>
    </div>
  )
}
