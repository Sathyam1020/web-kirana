"use client"

import { ApiError, type PreviewResult } from "@workspace/api-client"
import { useApi } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { Input } from "@workspace/ui/components/input"
import { SafeImage } from "@workspace/ui/components/safe-image"
import {
  ArrowLeft,
  Loader2,
  ShoppingBag,
  Tag,
  Trash2,
  X,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"
import { useCart } from "@/lib/cart"
import { describeApiError, formatPriceFromPaise } from "@/lib/format"

export default function CartPage() {
  const cart = useCart()
  const api = useApi()
  const items = Object.values(cart.items)
  const subtotal = cart.subtotalPaise()

  const [couponCode, setCouponCode] = useState("")
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<PreviewResult | null>(null)

  async function applyCoupon() {
    if (!cart.storeId || items.length === 0 || previewing) return
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
        toast.success(
          `Saved ${formatPriceFromPaise(result.discountPaise)}`,
        )
      } else if (result.reason === "INVALID_CODE") {
        toast.error("That coupon isn't valid for this cart")
      } else if (result.reason === "MIN_ORDER_NOT_MET" && result.minOrderPaise !== undefined) {
        toast.warning(
          `Add ${formatPriceFromPaise(result.minOrderPaise - subtotal)} more to use this coupon`,
        )
      } else {
        toast.error("Coupon couldn't be applied")
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === "UNAUTHORIZED") {
        toast.warning("Log in to use coupons")
      } else {
        toast.error(describeApiError(err))
      }
    } finally {
      setPreviewing(false)
    }
  }

  function clearCoupon() {
    setCouponCode("")
    setPreview(null)
  }

  const finalPaise =
    preview && preview.isValid ? preview.breakdown.finalPaise : subtotal

  return (
    <div className="min-h-svh bg-background pb-44">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border/40 flex items-center justify-between px-4 sm:px-6 py-3">
        <Link href="/stores" aria-label="Back">
          <Button variant="secondary" size="icon">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <h1 className="text-lg font-semibold">Your cart</h1>
        <div className="size-10" />
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-3">
        {items.length === 0 ? (
          <EmptyState
            icon={<ShoppingBag className="size-5" />}
            title="Cart is empty"
            description="Add items from any store to get started."
            action={
              <Button asChild>
                <Link href="/stores">Browse stores</Link>
              </Button>
            }
          />
        ) : (
          <>
            {items.map((item) => (
              <Card
                key={item.productId}
                className="p-3 flex items-center gap-3"
              >
                <div className="size-16 shrink-0 rounded-[var(--radius-lg)] bg-muted overflow-hidden">
                  <SafeImage
                    src={item.imageUrl}
                    alt={item.name}
                    fallback={<ShoppingBag className="size-5" />}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="tabular-nums text-sm font-semibold mt-1">
                    {formatPriceFromPaise(item.pricePaise)}
                  </p>
                  {/* Quantity stepper sits under the price on narrow
                      viewports to keep all controls at a thumb-friendly
                      40px touch target. On sm+ the row stays single-line. */}
                  <div className="mt-2 sm:hidden inline-flex items-center rounded-full bg-muted">
                    <button
                      onClick={() => cart.dec(item.productId)}
                      className="size-10 inline-flex items-center justify-center text-base font-semibold"
                      aria-label="Remove one"
                    >
                      −
                    </button>
                    <span className="tabular-nums text-sm font-semibold min-w-6 text-center">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => cart.incById(item.productId)}
                      className="size-10 inline-flex items-center justify-center text-base font-semibold"
                      aria-label="Add one"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="hidden sm:inline-flex items-center rounded-full bg-muted">
                  <button
                    onClick={() => cart.dec(item.productId)}
                    className="size-10 inline-flex items-center justify-center text-base font-semibold"
                    aria-label="Remove one"
                  >
                    −
                  </button>
                  <span className="tabular-nums text-sm font-semibold min-w-6 text-center">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => cart.incById(item.productId)}
                    className="size-10 inline-flex items-center justify-center text-base font-semibold"
                    aria-label="Add one"
                  >
                    +
                  </button>
                </div>
                <button
                  onClick={() => cart.remove(item.productId)}
                  className="size-10 inline-flex items-center justify-center text-muted-foreground hover:text-destructive"
                  aria-label="Remove"
                >
                  <Trash2 className="size-4" />
                </button>
              </Card>
            ))}

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
                {preview && preview.isValid ? (
                  <Button variant="ghost" onClick={clearCoupon}>
                    <X className="size-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={applyCoupon}
                    disabled={!couponCode || previewing}
                  >
                    {previewing && <Loader2 className="size-4 animate-spin" />}
                    Apply
                  </Button>
                )}
              </div>
              {preview && preview.isValid && (
                <p className="text-xs text-primary mt-2 flex items-center gap-1.5">
                  <Tag className="size-3" />
                  {preview.breakdown.couponCode} applied —{" "}
                  <span className="tabular-nums">
                    {formatPriceFromPaise(preview.discountPaise)}
                  </span>{" "}
                  off
                </p>
              )}
            </Card>

            <div className="bg-muted rounded-[var(--radius-lg)] p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="tabular-nums">
                  {formatPriceFromPaise(subtotal)}
                </span>
              </div>
              {preview && preview.isValid && (
                <div className="flex justify-between text-foreground/70">
                  <span>Discount</span>
                  <span className="tabular-nums">
                    − {formatPriceFromPaise(preview.discountPaise)}
                  </span>
                </div>
              )}
              <div className="flex justify-between font-semibold pt-2 border-t border-border/60">
                <span>Total</span>
                <span className="tabular-nums">
                  {formatPriceFromPaise(finalPaise)}
                </span>
              </div>
            </div>
          </>
        )}
      </main>

      {items.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 bg-background/90 backdrop-blur-md border-t border-border/40 p-4">
          <div className="max-w-2xl mx-auto">
            <Button size="lg" className="w-full" disabled>
              Checkout coming soon
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Ordering opens when we launch Phase 7.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
