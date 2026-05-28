"use client"

import type { OrderStatus, OrderView } from "@workspace/api-client"
import { useApi } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { ErrorState } from "@workspace/ui/components/error-state"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { SafeImage } from "@workspace/ui/components/safe-image"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Loader2, MapPin, Phone, ShoppingBag } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { describeApiError, formatPriceFromPaise } from "@/lib/format"

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
  const queryClient = useQueryClient()
  const orderId = params.id
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState("")

  const order = useQuery({
    queryKey: ["owner-order", orderId],
    queryFn: () => api.stores.order(orderId),
    enabled: typeof orderId === "string" && orderId.length > 0,
  })

  function applyUpdate(updated: OrderView) {
    queryClient.setQueryData(["owner-order", orderId], updated)
    void queryClient.invalidateQueries({ queryKey: ["owner-orders"] })
  }
  const onErr = (err: unknown) => toast.error(describeApiError(err))

  const acceptM = useMutation({
    mutationFn: () => api.stores.acceptOrder(orderId),
    onSuccess: (o) => {
      applyUpdate(o)
      toast.success("Order accepted")
    },
    onError: onErr,
  })
  const rejectM = useMutation({
    mutationFn: () => api.stores.rejectOrder(orderId, rejectReason.trim()),
    onSuccess: (o) => {
      applyUpdate(o)
      setRejectOpen(false)
      setRejectReason("")
      toast.success("Order rejected")
    },
    onError: onErr,
  })
  const ofdM = useMutation({
    mutationFn: () => api.stores.markOutForDelivery(orderId),
    onSuccess: (o) => {
      applyUpdate(o)
      toast.success("Marked out for delivery")
    },
    onError: onErr,
  })
  const deliverM = useMutation({
    mutationFn: () => api.stores.markDelivered(orderId),
    onSuccess: (o) => {
      applyUpdate(o)
      toast.success("Marked delivered")
    },
    onError: onErr,
  })

  const busy = acceptM.isPending || rejectM.isPending || ofdM.isPending || deliverM.isPending
  const status = order.data?.status

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

          {/* Contextual lifecycle actions */}
          {status === "PLACED" && (
            <div className="flex gap-2">
              <Button className="flex-1" disabled={busy} onClick={() => acceptM.mutate()}>
                {acceptM.isPending && <Loader2 className="size-4 animate-spin" />}
                Accept
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                disabled={busy}
                onClick={() => setRejectOpen(true)}
              >
                Reject
              </Button>
            </div>
          )}
          {status === "ACCEPTED" && (
            <Button className="w-full" disabled={busy} onClick={() => ofdM.mutate()}>
              {ofdM.isPending && <Loader2 className="size-4 animate-spin" />}
              Out for delivery
            </Button>
          )}
          {status === "OUT_FOR_DELIVERY" && (
            <Button className="w-full" disabled={busy} onClick={() => deliverM.mutate()}>
              {deliverM.isPending && <Loader2 className="size-4 animate-spin" />}
              Mark delivered
            </Button>
          )}
          {order.data.status === "REJECTED" && order.data.rejectionReason && (
            <p className="text-sm text-destructive">Rejected: {order.data.rejectionReason}</p>
          )}
          {order.data.status === "CANCELLED" && (
            <p className="text-sm text-muted-foreground">
              Cancelled by customer{order.data.cancellationReason ? `: ${order.data.cancellationReason}` : ""}
            </p>
          )}

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

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this order?</DialogTitle>
          </DialogHeader>
          <div>
            <Label htmlFor="reject-reason" className="mb-2 block">
              Reason (the customer will see this)
            </Label>
            <Input
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Out of stock"
              maxLength={300}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRejectOpen(false)}>
              Keep order
            </Button>
            <Button
              variant="destructive"
              disabled={rejectReason.trim().length === 0 || rejectM.isPending}
              onClick={() => rejectM.mutate()}
            >
              {rejectM.isPending && <Loader2 className="size-4 animate-spin" />}
              Reject order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
