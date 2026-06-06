"use client"

/**
 * Order detail — DP-3 refresh.
 *
 * - Sticky back header with order id.
 * - Status surface:
 *     happy path → vertical OrderProgress stepper. When the order is
 *       currently OUT_FOR_DELIVERY, render the static tracking map
 *       placeholder above the stepper (real rider GPS lives in the Riders
 *       phase later).
 *     REJECTED / CANCELLED → empathetic destructive banner with reason.
 * - Action row: CRITICAL — Cancel button only appears when `status ===
 *   PLACED` (matches backend rule); after that, "Need help? Contact store"
 *   shows instead so the user has a path forward.
 * - Store card with name + tel link.
 * - Items list.
 * - Bill via CartSummaryCard.
 * - Delivery address card.
 * - Customer note row (when present).
 *
 * Reorder is offered for terminal-but-not-success states (REJECTED /
 * CANCELLED) so the user has a one-tap recovery to try again at the same
 * (or a different) store.
 */

import type { OrderStatus, OrderView } from "@workspace/api-client"
import { useApi } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { ErrorState } from "@workspace/ui/components/error-state"
import { ProgressiveImage } from "@workspace/ui/components/image"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { toast } from "@workspace/ui/components/toaster"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft,
  HelpCircle,
  MapPin,
  Phone,
  RefreshCw,
  ShoppingBag,
  XCircle,
} from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useState } from "react"

import { CartSummaryCard } from "@/components/cart-summary-card"
import { OrderProgress } from "@/components/order-progress"
import { ReorderDialog } from "@/components/reorder-dialog"
import { StaticTrackingMap } from "@/components/static-tracking-map"
import { describeApiError, formatPriceFromPaise } from "@/lib/format"
import { useSmartBack } from "@/lib/use-smart-back"
import { cn } from "@workspace/ui/lib/utils"

const TERMINAL: OrderStatus[] = ["DELIVERED", "REJECTED", "CANCELLED"]

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>()
  const api = useApi()
  const queryClient = useQueryClient()
  const orderId = params.id
  const goBack = useSmartBack("/orders")
  const [reorderOpen, setReorderOpen] = useState(false)

  const order = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => api.orders.get(orderId),
    enabled: typeof orderId === "string" && orderId.length > 0,
    // Realtime push (Socket.IO) drives status changes; this is the fallback.
    refetchInterval: (q) => {
      const s = q.state.data?.status
      return s && !TERMINAL.includes(s) ? 60_000 : false
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
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border/40">
        <div className="max-w-md mx-auto flex items-center gap-2 px-4 py-3">
          <Button
            variant="secondary"
            size="icon"
            onClick={goBack}
            aria-label="Back"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold leading-tight">Order</h1>
            {order.data ? (
              <p className="text-[11px] text-muted-foreground tabular-nums">
                #{order.data.id.slice(-8).toUpperCase()}
              </p>
            ) : null}
          </div>
          <Link
            href="/account/help"
            className="inline-flex size-9 items-center justify-center rounded-full hover:bg-surface-soft transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Help"
          >
            <HelpCircle className="size-4" />
          </Link>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-5 space-y-4">
        {order.isPending ? (
          <>
            <Skeleton className="h-16 w-full rounded-[var(--radius-md)]" />
            <Skeleton className="h-48 w-full rounded-[var(--radius-md)]" />
            <Skeleton className="h-40 w-full rounded-[var(--radius-md)]" />
          </>
        ) : null}

        {order.isError ? (
          <ErrorState
            title="Couldn’t load this order"
            description="It may not exist or isn’t yours."
            retry={() => order.refetch()}
          />
        ) : null}

        {order.data ? (
          <>
            <p className="text-xs text-muted-foreground">
              Placed on{" "}
              {new Date(order.data.placedAt).toLocaleString(undefined, {
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>

            {/* Status surface */}
            {order.data.status === "REJECTED" ||
            order.data.status === "CANCELLED" ? (
              <FailedBanner order={order.data} />
            ) : (
              <>
                {order.data.status === "OUT_FOR_DELIVERY" ? (
                  <StaticTrackingMap
                    storeName={order.data.store.nameSnapshot}
                  />
                ) : null}
                <OrderProgress order={order.data} />
              </>
            )}

            {/* Action row */}
            <ActionRow
              order={order.data}
              cancelling={cancelM.isPending}
              onCancel={() => cancelM.mutate()}
              onReorder={() => setReorderOpen(true)}
            />

            {/* Store card */}
            <section className="rounded-[var(--radius-md)] border border-border bg-card p-3 flex items-center gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-full bg-primary/10 shrink-0">
                <ShoppingBag className="size-5 text-primary" aria-hidden />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-tight truncate">
                  {order.data.store.nameSnapshot}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {order.data.store.phoneSnapshot}
                </p>
              </div>
              <a
                href={`tel:${order.data.store.phoneSnapshot}`}
                aria-label={`Call ${order.data.store.nameSnapshot}`}
                className="inline-flex size-9 items-center justify-center rounded-full border border-border text-foreground hover:bg-surface-soft transition-colors"
              >
                <Phone className="size-3.5" aria-hidden />
              </a>
            </section>

            {/* Items */}
            <section>
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                Items ({order.data.items.length})
              </h2>
              <ul className="rounded-[var(--radius-md)] border border-border bg-card divide-y divide-border-soft overflow-hidden">
                {order.data.items.map((it) => (
                  <li
                    key={it.id}
                    className="flex items-center gap-3 px-3 py-2.5"
                  >
                    <ProgressiveImage
                      src={it.imageUrlSnapshot}
                      alt={it.nameSnapshot}
                      aspect="aspect-square"
                      rounded="rounded-[var(--radius-sm)]"
                      className="w-12 shrink-0"
                      fallback={
                        <ShoppingBag className="size-4 text-muted-foreground" />
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {it.nameSnapshot}
                      </p>
                      {/* IP-2 — variant identity. Pre-IP-2 orders carry
                          variantName=null; IP-2+ orders snapshot the
                          variant the customer actually bought. Hidden
                          for "Default" auto-backfill names so receipts
                          for single-variant products don't add noise. */}
                      {it.variantName !== null && it.variantName !== "Default" ? (
                        <p className="text-[11px] text-muted-foreground leading-tight truncate">
                          {it.variantName}
                        </p>
                      ) : null}
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatPriceFromPaise(it.unitPricePaiseSnapshot)} ×{" "}
                        {it.quantity}
                      </p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums">
                      {formatPriceFromPaise(it.lineTotalPaise)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            {/* Bill */}
            <CartSummaryCard
              subtotalPaise={order.data.itemsSubtotalPaise}
              deliveryFeePaise={order.data.deliveryFeePaise}
              discountPaise={order.data.discountPaise}
              couponCode={order.data.couponCode}
              totalLabel={
                order.data.paymentMethod === "COD"
                  ? "Paid by COD"
                  : "Total paid"
              }
            />

            {/* Delivery address */}
            <section className="rounded-[var(--radius-md)] border border-border bg-card p-3 space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Delivering to
              </p>
              <p className="text-sm flex items-start gap-2 text-foreground">
                <MapPin
                  className="size-4 mt-0.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="font-semibold block">
                    {order.data.delivery.label}
                  </span>
                  <span className="text-xs text-muted-foreground leading-snug">
                    {order.data.delivery.line1}
                    {order.data.delivery.line2
                      ? `, ${order.data.delivery.line2}`
                      : ""}
                    , {order.data.delivery.city} {order.data.delivery.pincode}
                  </span>
                </span>
              </p>
            </section>

            {order.data.customerNote ? (
              <p className="text-xs text-muted-foreground px-1">
                <span className="font-semibold text-foreground">Note:</span>{" "}
                {order.data.customerNote}
              </p>
            ) : null}

            {/* Reorder confirmation sheet */}
            <ReorderDialog
              open={reorderOpen}
              onOpenChange={setReorderOpen}
              items={order.data.items}
              totalPaise={order.data.totalPaise}
              storeId={order.data.store.id}
              storeName={order.data.store.nameSnapshot}
            />
          </>
        ) : null}
      </main>
    </div>
  )
}

function FailedBanner({ order }: { order: OrderView }) {
  const isRejected = order.status === "REJECTED"
  const reason = order.rejectionReason ?? order.cancellationReason
  return (
    <div className="rounded-[var(--radius-md)] bg-destructive/10 border border-destructive/30 px-4 py-3 flex items-start gap-2.5">
      <XCircle className="size-5 shrink-0 mt-0.5 text-destructive" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-destructive">
          {isRejected
            ? "The store couldn’t fulfil this order"
            : "Order cancelled"}
        </p>
        {reason ? (
          <p className="text-xs text-foreground mt-0.5 leading-snug">{reason}</p>
        ) : (
          <p className="text-xs text-muted-foreground mt-0.5">
            {isRejected
              ? "Don’t worry — try another store nearby."
              : "If this was a mistake, you can reorder below."}
          </p>
        )}
      </div>
    </div>
  )
}

function ActionRow({
  order,
  cancelling,
  onCancel,
  onReorder,
}: {
  order: OrderView
  cancelling: boolean
  onCancel: () => void
  onReorder: () => void
}) {
  // CRITICAL DP-3 RULE: customer cancel allowed ONLY while status === PLACED.
  // Past that, replace with help link; backend enforces, this is the UI.
  if (order.status === "PLACED") {
    return (
      <Button
        variant="destructive"
        className="w-full"
        loading={cancelling}
        onClick={onCancel}
      >
        Cancel order
      </Button>
    )
  }

  // Terminal failure paths → primary action is "Reorder" so the user has a
  // one-tap recovery instead of dead-end frustration.
  if (order.status === "REJECTED" || order.status === "CANCELLED") {
    return (
      <Button className="w-full" onClick={onReorder}>
        <RefreshCw className="size-4" />
        Reorder
      </Button>
    )
  }

  // DELIVERED — past order; offer a reorder + help link.
  if (order.status === "DELIVERED") {
    return (
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onReorder}>
          <RefreshCw className="size-4" />
          Reorder
        </Button>
        <Button asChild variant="ghost" className="flex-1">
          <Link href="/account/help">Need help?</Link>
        </Button>
      </div>
    )
  }

  // In-flight after PLACED: cancel not allowed (backend rejects); offer help.
  return (
    <Link
      href="/account/help"
      className={cn(
        "inline-flex items-center justify-center w-full h-10 rounded-md",
        "text-sm font-medium text-muted-foreground hover:text-foreground",
        "border border-border bg-card hover:bg-surface-soft transition-colors",
      )}
    >
      <HelpCircle className="size-4 mr-1.5" aria-hidden />
      Need help? Contact store
    </Link>
  )
}
