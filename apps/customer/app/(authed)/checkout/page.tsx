"use client"

/**
 * Checkout page — refreshed to DP-1 visual language (DP-3).
 *
 * Section order (top → bottom inside the max-w-md column):
 *   1. Delivery address — list of saved addresses with radio-style select
 *   2. Order summary — collapsed by default, expandable
 *   3. Coupon row — collapsible apply/remove
 *   4. Bill breakdown via CartSummaryCard
 *   5. Payment method — COD only (online payments later phase)
 *   6. Sticky Place order CTA — uses DP-0 Button state matrix
 *
 * Preserved from previous implementation: idempotency key per visit,
 * coupon preview flow, error codes (CART_CHANGED / STORE_CLOSED /
 * OUT_OF_SERVICE_AREA), order-success celebration handoff.
 */

import { ApiError, type PreviewResult } from "@workspace/api-client"
import { useApi } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { toast } from "@workspace/ui/components/toaster"
import { useMutation, useQuery } from "@tanstack/react-query"
import { ArrowLeft, Check, ChevronDown, MapPin, Tag, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { CartSummaryCard } from "@/components/cart-summary-card"
import { OrderSuccessCelebration } from "@/components/order-success-celebration"
import { Shake } from "@/components/shake"
import { useCart } from "@/lib/cart"
import { describeApiError, formatPriceFromPaise } from "@/lib/format"
import { primeAudio } from "@/lib/sound"
import { useSmartBack } from "@/lib/use-smart-back"
import { cn } from "@workspace/ui/lib/utils"

export default function CheckoutPage() {
  const api = useApi()
  const router = useRouter()
  const cart = useCart()
  const items = Object.values(cart.items)
  const subtotal = cart.subtotalPaise()
  const onBack = useSmartBack("/cart")

  // One idempotency key per checkout-page visit. A transient retry reuses it
  // (safe); leaving and re-entering checkout remounts and gets a fresh key.
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null)
  const [couponCode, setCouponCode] = useState("")
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [couponError, setCouponError] = useState<string | null>(null)
  const [itemsExpanded, setItemsExpanded] = useState(false)
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null)

  // No items → nothing to check out. Once an order is placed we clear the
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
        cart: items.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
        })),
      })
      setPreview(result)
      if (result.isValid) {
        setCouponError(null)
        toast.success(`Saved ${formatPriceFromPaise(result.discountPaise)}`)
      } else if (
        result.reason === "MIN_ORDER_NOT_MET" &&
        result.minOrderPaise !== undefined
      ) {
        setCouponError(`min-order-${Date.now()}`)
        toast.warning(
          `Add ${formatPriceFromPaise(result.minOrderPaise - subtotal)} more to use this coupon`,
        )
      } else {
        setCouponError(`invalid-${Date.now()}`)
        toast.error("That coupon isn’t valid for this cart")
      }
    } catch (err) {
      setCouponError(`error-${Date.now()}`)
      toast.error(describeApiError(err))
    } finally {
      setPreviewing(false)
    }
  }

  const appliedCoupon = preview?.isValid ? preview.breakdown.couponCode : null
  const discount = preview?.isValid ? preview.discountPaise : 0

  const place = useMutation({
    mutationFn: () => {
      if (selectedAddressId === null) throw new Error("Pick a delivery address")
      return api.orders.place(
        {
          addressId: selectedAddressId,
          cart: items.map((it) => ({
            productId: it.productId,
            quantity: it.quantity,
          })),
          couponCode: appliedCoupon ?? undefined,
        },
        idempotencyKey,
      )
    },
    onSuccess: (order) => {
      cart.clear()
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
        toast.error("This store doesn’t deliver to that address")
        return
      }
      // IP-1: backend enforces minimum order at placement. The MinOrderStrip
      // nudges before this fires, but if the customer reached checkout with
      // a sub-min cart anyway (e.g. items removed mid-flow), surface the
      // gap honestly using the requiredPaise / actualPaise the server
      // returned and bounce back to /cart so they can top it up.
      if (err instanceof ApiError && err.code === "MIN_ORDER_NOT_MET") {
        const details = err.details as
          | { requiredPaise?: number; actualPaise?: number }
          | undefined
        if (
          details !== undefined &&
          typeof details.requiredPaise === "number" &&
          typeof details.actualPaise === "number"
        ) {
          const shortBy = details.requiredPaise - details.actualPaise
          toast.error(
            `Add ${formatPriceFromPaise(shortBy)} more to meet this store's minimum order`,
          )
        } else {
          toast.error("Cart is below this store's minimum order")
        }
        router.replace("/cart")
        return
      }
      toast.error(describeApiError(err))
    },
  })

  if (placedOrderId !== null) {
    return (
      <OrderSuccessCelebration
        onDone={() => router.replace(`/orders/${placedOrderId}`)}
      />
    )
  }

  if (items.length === 0) return null

  return (
    <div className="min-h-svh bg-background pb-32">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border/40">
        <div className="max-w-md mx-auto flex items-center gap-2 px-4 py-3">
          <Button variant="secondary" size="icon" aria-label="Back" onClick={onBack}>
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="text-base font-semibold flex-1">Checkout</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-5 space-y-5">
        {/* Delivery address */}
        <section className="space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Deliver to
          </h2>
          {addresses.isPending ? (
            <Skeleton className="h-20 w-full rounded-[var(--radius-md)]" />
          ) : (addresses.data?.length ?? 0) === 0 ? (
            <div className="rounded-[var(--radius-md)] border border-border bg-card py-6 px-4 text-center space-y-2.5">
              <MapPin className="size-6 text-muted-foreground mx-auto" aria-hidden />
              <p className="text-sm font-semibold">No saved address</p>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Add a delivery address to place your order.
              </p>
              <Button asChild size="sm" className="mt-1">
                <Link href="/account/addresses">Add address</Link>
              </Button>
            </div>
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
                    className={cn(
                      "flex w-full items-start gap-3 rounded-[var(--radius-md)] border bg-card p-3 text-left transition-colors",
                      active
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-border-strong",
                    )}
                  >
                    <MapPin
                      className="size-4 mt-0.5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">
                        {a.label}
                      </span>
                      <span className="block text-xs text-muted-foreground truncate mt-0.5">
                        {a.line1}
                        {a.line2 ? `, ${a.line2}` : ""}, {a.city} {a.pincode}
                      </span>
                    </span>
                    {active ? (
                      <Check className="size-4 shrink-0 text-primary mt-0.5" />
                    ) : null}
                  </button>
                )
              })}
              <Link
                href="/account/addresses"
                className="inline-block text-sm font-medium text-primary hover:text-primary-active mt-1"
              >
                + Add a new address
              </Link>
            </div>
          )}
        </section>

        {/* Order summary — collapsed by default */}
        <section className="rounded-[var(--radius-md)] border border-border bg-card overflow-hidden">
          <button
            type="button"
            onClick={() => setItemsExpanded((e) => !e)}
            className="flex items-center justify-between w-full px-4 py-3"
          >
            <span className="text-sm font-semibold">
              Order summary · {items.length} item{items.length === 1 ? "" : "s"}
            </span>
            <ChevronDown
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                itemsExpanded && "rotate-180",
              )}
              aria-hidden
            />
          </button>
          {itemsExpanded ? (
            <ul className="border-t border-border-soft divide-y divide-border-soft">
              {items.map((item) => (
                <li
                  key={item.productId}
                  className="px-4 py-2.5 flex items-center gap-3"
                >
                  <p className="text-sm flex-1 truncate">{item.name}</p>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    × {item.quantity}
                  </span>
                  <span className="text-sm font-semibold tabular-nums w-16 text-right">
                    {formatPriceFromPaise(item.pricePaise * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {/* Coupon */}
        <section className="rounded-[var(--radius-md)] border border-border bg-card p-4 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Coupon
          </p>
          <div className="flex gap-2">
            <Shake trigger={couponError} className="flex-1">
              <Input
                value={couponCode}
                onChange={(e) => {
                  setCouponCode(e.target.value.toUpperCase())
                  if (couponError !== null) setCouponError(null)
                }}
                placeholder="Enter code"
                className="tabular-nums w-full"
                disabled={appliedCoupon !== null}
              />
            </Shake>
            {appliedCoupon ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCouponCode("")
                  setPreview(null)
                }}
                aria-label="Remove coupon"
              >
                <X className="size-4" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={applyCoupon}
                disabled={!couponCode || previewing}
                loading={previewing}
              >
                Apply
              </Button>
            )}
          </div>
          {appliedCoupon ? (
            <p className="text-xs text-success font-medium flex items-center gap-1.5 mt-1">
              <Tag className="size-3" />
              {appliedCoupon} applied · {formatPriceFromPaise(discount)} off
            </p>
          ) : null}
        </section>

        {/* Bill breakdown */}
        <CartSummaryCard
          subtotalPaise={subtotal}
          deliveryFeePaise={0}
          discountPaise={discount}
          couponCode={appliedCoupon}
          totalLabel="To pay (COD)"
        />

        {/* Payment method — COD only this round */}
        <section className="rounded-[var(--radius-md)] border border-border bg-card px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Payment method
            </p>
            <p className="text-sm font-semibold mt-0.5">Cash on Delivery</p>
          </div>
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-semibold">
            COD
          </span>
        </section>
      </main>

      {/* Sticky Place order CTA */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-background/95 backdrop-blur-md border-t border-border/40 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-md mx-auto px-4 py-3">
          <Button
            size="lg"
            className="w-full"
            disabled={selectedAddressId === null}
            loading={place.isPending}
            onClick={() => {
              // Unlock audio within the tap so the success chime can play
              // when the async place completes.
              primeAudio()
              place.mutate()
            }}
          >
            <span className="flex items-center justify-between w-full">
              <span className="font-semibold">
                {place.isPending ? "Placing order…" : "Place order"}
              </span>
              <span className="tabular-nums font-bold">
                {formatPriceFromPaise(subtotal - discount)}
              </span>
            </span>
          </Button>
        </div>
      </div>
    </div>
  )
}
