"use client"

import type { OrderStatus, OrderView } from "@workspace/api-client"
import { useApi } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { ErrorState } from "@workspace/ui/components/error-state"
import { SafeImage } from "@workspace/ui/components/safe-image"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Check, Loader2, MapPin, ShoppingBag, XCircle } from "lucide-react"
import { useParams } from "next/navigation"
import { toast } from "sonner"
import { describeApiError, formatPriceFromPaise } from "@/lib/format"
import { useSmartBack } from "@/lib/use-smart-back"

// The happy-path progression for the tracker. Terminal REJECTED/CANCELLED
// render as a banner instead.
const STEPS: { status: OrderStatus; label: string; at: (o: OrderView) => string | null }[] = [
  { status: "PLACED", label: "Order placed", at: (o) => o.placedAt },
  { status: "ACCEPTED", label: "Accepted by store", at: (o) => o.acceptedAt },
  { status: "OUT_FOR_DELIVERY", label: "Out for delivery", at: (o) => o.outForDeliveryAt },
  { status: "DELIVERED", label: "Delivered", at: (o) => o.deliveredAt },
]
const HAPPY_ORDER: OrderStatus[] = ["PLACED", "ACCEPTED", "OUT_FOR_DELIVERY", "DELIVERED"]
const TERMINAL: OrderStatus[] = ["DELIVERED", "REJECTED", "CANCELLED"]

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>()
  const api = useApi()
  const queryClient = useQueryClient()
  const orderId = params.id
  const goBack = useSmartBack("/stores")

  const order = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => api.orders.get(orderId),
    enabled: typeof orderId === "string" && orderId.length > 0,
    // Poll while the order is still in flight so the tracker advances as the
    // store acts; stop once it reaches a terminal state.
    refetchInterval: (q) => {
      const s = q.state.data?.status
      return s && !TERMINAL.includes(s) ? 15_000 : false
    },
  })

  const cancelM = useMutation({
    mutationFn: () => api.orders.cancel(orderId),
    onSuccess: (o) => {
      queryClient.setQueryData(["order", orderId], o)
      void queryClient.invalidateQueries({ queryKey: ["orders"] })
      toast.success("Order cancelled")
    },
    onError: (err) => toast.error(describeApiError(err)),
  })

  return (
    <div className="min-h-svh bg-background pb-12">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border/40 flex items-center gap-2 px-4 sm:px-6 py-3">
        <Button variant="secondary" size="icon" onClick={goBack} aria-label="Back">
          <ArrowLeft className="size-4" />
        </Button>
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
              <p className="text-xs text-muted-foreground">
                {new Date(order.data.placedAt).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">#{order.data.id.slice(-6)}</p>
            </div>

            {/* Status: tracker for the happy path, banner for terminal reject/cancel */}
            {order.data.status === "REJECTED" || order.data.status === "CANCELLED" ? (
              <div className="rounded-[var(--radius-md)] bg-destructive/10 text-destructive p-4 flex items-start gap-2">
                <XCircle className="size-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">
                    {order.data.status === "REJECTED" ? "Order rejected" : "Order cancelled"}
                  </p>
                  {(order.data.rejectionReason ?? order.data.cancellationReason) && (
                    <p className="text-sm mt-0.5">
                      {order.data.rejectionReason ?? order.data.cancellationReason}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <OrderTracker order={order.data} />
            )}

            {/* Cancel — only while the store hasn't accepted yet */}
            {order.data.status === "PLACED" && (
              <Button
                variant="secondary"
                className="w-full"
                disabled={cancelM.isPending}
                onClick={() => cancelM.mutate()}
              >
                {cancelM.isPending && <Loader2 className="size-4 animate-spin" />}
                Cancel order
              </Button>
            )}

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

function OrderTracker({ order }: { order: OrderView }) {
  const currentIdx = HAPPY_ORDER.indexOf(order.status)
  return (
    <div className="rounded-[var(--radius-md)] border border-border p-4">
      <ol>
        {STEPS.map((step, i) => {
          const done = i <= currentIdx
          const at = step.at(order)
          const isLast = i === STEPS.length - 1
          return (
            <li key={step.status} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`flex size-6 items-center justify-center rounded-full ${
                    done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {done ? (
                    <Check className="size-3.5" />
                  ) : (
                    <span className="size-2 rounded-full bg-current" />
                  )}
                </span>
                {!isLast && (
                  <span className={`w-0.5 flex-1 min-h-6 ${i < currentIdx ? "bg-primary" : "bg-border"}`} />
                )}
              </div>
              <div className={`pb-5 ${done ? "" : "opacity-60"}`}>
                <p className="text-sm font-medium">{step.label}</p>
                {done && at && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(at).toLocaleString()}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
