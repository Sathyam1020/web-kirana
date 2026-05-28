"use client"

import type { OrderStatus } from "@workspace/api-client"
import { useApi } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { ErrorState } from "@workspace/ui/components/error-state"
import { SafeImage } from "@workspace/ui/components/safe-image"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, MapPin, Phone, ShoppingBag } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { formatPriceFromPaise } from "@/lib/format"

const STATUS_LABEL: Record<OrderStatus, string> = {
  PLACED: "New order",
  ACCEPTED: "Accepted",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
}

export default function OwnerOrderDetailPage() {
  const params = useParams<{ id: string }>()
  const api = useApi()
  const orderId = params.id

  const order = useQuery({
    queryKey: ["owner-order", orderId],
    queryFn: () => api.stores.order(orderId),
    enabled: typeof orderId === "string" && orderId.length > 0,
  })

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/orders" aria-label="Back to orders">
          <Button variant="secondary" size="icon">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-semibold">Order</h1>
      </div>

      {order.isPending && (
        <>
          <Skeleton className="h-16 w-full rounded-[var(--radius-md)]" />
          <Skeleton className="h-40 w-full rounded-[var(--radius-md)]" />
        </>
      )}

      {order.isError && (
        <ErrorState
          title="Couldn't load this order"
          description="It may not exist or isn't for your store."
          retry={() => order.refetch()}
        />
      )}

      {order.data && (
        <>
          <div className="flex items-center justify-between">
            <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {STATUS_LABEL[order.data.status]}
            </span>
            <p className="text-xs text-muted-foreground">
              {new Date(order.data.placedAt).toLocaleString()}
            </p>
          </div>

          {/* Customer + delivery (fulfilment details) */}
          <div className="rounded-[var(--radius-md)] border border-border p-4 space-y-2">
            <p className="font-semibold">{order.data.customer.nameSnapshot}</p>
            <p className="text-sm flex items-center gap-2 text-muted-foreground">
              <Phone className="size-4" />
              <a href={`tel:${order.data.customer.phoneSnapshot}`} className="hover:text-foreground">
                {order.data.customer.phoneSnapshot}
              </a>
            </p>
            <p className="text-sm flex items-start gap-2 text-muted-foreground">
              <MapPin className="size-4 mt-0.5 shrink-0" />
              <span>
                {order.data.delivery.line1}
                {order.data.delivery.line2 ? `, ${order.data.delivery.line2}` : ""},{" "}
                {order.data.delivery.city} {order.data.delivery.pincode}
              </span>
            </p>
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
              <span className="tabular-nums">{formatPriceFromPaise(order.data.itemsSubtotalPaise)}</span>
            </div>
            {order.data.discountPaise > 0 && (
              <div className="flex justify-between text-foreground/70">
                <span>Discount{order.data.couponCode ? ` (${order.data.couponCode})` : ""}</span>
                <span className="tabular-nums">− {formatPriceFromPaise(order.data.discountPaise)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold pt-2 border-t border-border/60">
              <span>Total · Collect on delivery</span>
              <span className="tabular-nums">{formatPriceFromPaise(order.data.totalPaise)}</span>
            </div>
          </div>

          {order.data.customerNote && (
            <p className="text-sm text-muted-foreground">Note: {order.data.customerNote}</p>
          )}
        </>
      )}
    </div>
  )
}
