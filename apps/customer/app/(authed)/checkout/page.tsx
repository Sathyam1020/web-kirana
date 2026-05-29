"use client"

import { ApiError, type PreviewResult } from "@workspace/api-client"
import { useApi } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { Input } from "@workspace/ui/components/input"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useMutation, useQuery } from "@tanstack/react-query"
import { ArrowLeft, Check, Loader2, MapPin, Tag, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useCart } from "@/lib/cart"
import { OrderSuccessCelebration } from "@/components/order-success-celebration"
import { describeApiError, formatPriceFromPaise } from "@/lib/format"
import { primeAudio } from "@/lib/sound"

export default function CheckoutPage() {
  const api = useApi()
  const router = useRouter()
  const cart = useCart()
  const items = Object.values(cart.items)
  const subtotal = cart.subtotalPaise()

  // One idempotency key per checkout-page visit. A transient retry reuses it
  // (safe); fixing the cart sends you back and remounts with a fresh key.
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null)
  const [couponCode, setCouponCode] = useState("")
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [previewing, setPreviewing] = useState(false)
  // Set on a successful place → shows the celebration, which then routes to
  // the order page (so the redirect doesn't race the animation).
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null)

  // No items → nothing to check out. But once an order is placed we clear the
  // cart on purpose — the celebration handles that redirect, so don't bounce.
  useEffect(() => {
    if (items.length === 0 && placedOrderId === null) router.replace("/stores")
  }, [items.length, router, placedOrderId])

  const addresses = useQuery({
    queryKey: ["addresses"],
    queryFn: () => api.addresses.list(),
  })

  // Default the selection to the default address (or the first).
  useEffect(() => {
    if (selectedAddressId !== null || !addresses.data) return
    const def = addresses.data.find((a) => a.isDefault) ?? addresses.data[0]
    if (def) setSelectedAddressId(def.id)
  }, [addresses.data, selectedAddressId])

  async function applyCoupon() {
    if (!couponCode.trim() || previewing) return
    setPreviewing(true)
    try {
      const result = await api.coupons.preview({
        code: couponCode.trim(),
        cart: items.map((it) => ({ productId: it.productId, quantity: it.quantity })),
      })
      setPreview(result)
      if (result.isValid) {
        toast.success(`Saved ${formatPriceFromPaise(result.discountPaise)}`)
      } else if (result.reason === "MIN_ORDER_NOT_MET" && result.minOrderPaise !== undefined) {
        toast.warning(`Add ${formatPriceFromPaise(result.minOrderPaise - subtotal)} more to use this coupon`)
      } else {
        toast.error("That coupon isn't valid for this cart")
      }
    } catch (err) {
      toast.error(describeApiError(err))
    } finally {
      setPreviewing(false)
    }
  }

  const appliedCoupon = preview?.isValid ? preview.breakdown.couponCode : null
  const discount = preview?.isValid ? preview.discountPaise : 0
  const total = subtotal - discount

  const place = useMutation({
    mutationFn: () => {
      if (selectedAddressId === null) throw new Error("Pick a delivery address")
      return api.orders.place(
        {
          addressId: selectedAddressId,
          cart: items.map((it) => ({ productId: it.productId, quantity: it.quantity })),
          couponCode: appliedCoupon ?? undefined,
        },
        idempotencyKey,
      )
    },
    onSuccess: (order) => {
      cart.clear()
      // The celebration overlay owns the transition to the order page.
      setPlacedOrderId(order.id)
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "CART_CHANGED") {
        toast.error("Some items changed — please review your cart")
        router.replace("/cart")
        return
      }
      if (err instanceof ApiError && err.code === "STORE_CLOSED") {
        toast.error("This store just closed. Try again later.")
        return
      }
      if (err instanceof ApiError && err.code === "OUT_OF_SERVICE_AREA") {
        toast.error("This store doesn't deliver to that address")
        return
      }
      toast.error(describeApiError(err))
    },
  })

  if (placedOrderId !== null) {
    return (
      <OrderSuccessCelebration onDone={() => router.replace(`/orders/${placedOrderId}`)} />
    )
  }

  if (items.length === 0) return null

  return (
    <div className="min-h-svh bg-background pb-44">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border/40 flex items-center justify-between px-4 sm:px-6 py-3">
        <Link href="/cart" aria-label="Back to cart">
          <Button variant="secondary" size="icon">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <h1 className="text-lg font-semibold">Checkout</h1>
        <div className="size-10" />
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Delivery address */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Deliver to
          </h2>
          {addresses.isPending ? (
            <Skeleton className="h-20 w-full rounded-[var(--radius-md)]" />
          ) : (addresses.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon={<MapPin className="size-5" />}
              title="No saved address"
              description="Add a delivery address to place your order."
              action={
                <Button asChild>
                  <Link href="/account/addresses">Add address</Link>
                </Button>
              }
            />
          ) : (
            <div className="space-y-2">
              {addresses.data?.map((a) => {
                const active = a.id === selectedAddressId
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelectedAddressId(a.id)}
                    aria-pressed={active}
                    className={
                      "flex w-full items-start gap-3 rounded-[var(--radius-md)] border p-3 text-left transition-colors " +
                      (active
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40")
                    }
                  >
                    <MapPin className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{a.label}</span>
                      <span className="block text-xs text-muted-foreground truncate">
                        {a.line1}
                        {a.line2 ? `, ${a.line2}` : ""}, {a.city} {a.pincode}
                      </span>
                    </span>
                    {active && <Check className="size-4 shrink-0 text-primary" />}
                  </button>
                )
              })}
              <Link
                href="/account/addresses"
                className="inline-block text-sm font-medium text-primary hover:text-primary-active"
              >
                + Add a new address
              </Link>
            </div>
          )}
        </section>

        {/* Coupon */}
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Coupon
          </p>
          <div className="flex gap-2">
            <Input
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              placeholder="WELCOME50"
              className="tabular-nums"
            />
            {appliedCoupon ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setCouponCode("")
                  setPreview(null)
                }}
                aria-label="Remove coupon"
              >
                <X className="size-4" />
              </Button>
            ) : (
              <Button onClick={applyCoupon} disabled={!couponCode || previewing}>
                {previewing && <Loader2 className="size-4 animate-spin" />}
                Apply
              </Button>
            )}
          </div>
          {appliedCoupon && (
            <p className="text-xs text-primary mt-2 flex items-center gap-1.5">
              <Tag className="size-3" />
              {appliedCoupon} — {formatPriceFromPaise(discount)} off
            </p>
          )}
        </Card>

        {/* Summary */}
        <div className="bg-muted rounded-[var(--radius-lg)] p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatPriceFromPaise(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-foreground/70">
              <span>Discount</span>
              <span className="tabular-nums">− {formatPriceFromPaise(discount)}</span>
            </div>
          )}
          <div className="flex justify-between text-muted-foreground">
            <span>Delivery</span>
            <span>Free</span>
          </div>
          <div className="flex justify-between font-semibold pt-2 border-t border-border/60">
            <span>Total · Pay on delivery</span>
            <span className="tabular-nums">{formatPriceFromPaise(total)}</span>
          </div>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 bg-background/90 backdrop-blur-md border-t border-border/40 p-4">
        <div className="max-w-2xl mx-auto">
          <Button
            size="lg"
            className="w-full"
            disabled={place.isPending || selectedAddressId === null}
            onClick={() => {
              // Unlock audio within the tap so the success chime can play even
              // though it fires later (after the async place completes).
              primeAudio()
              place.mutate()
            }}
          >
            {place.isPending && <Loader2 className="size-4 animate-spin" />}
            {place.isPending
              ? "Placing order"
              : `Place order · ${formatPriceFromPaise(total)}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
