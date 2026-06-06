"use client"

/**
 * Cart page — refreshed to DP-1 visual language (DP-3).
 *
 * Layout:
 *   - Sticky back-header
 *   - MinOrderStrip (min order nudge → free-delivery upsell)
 *   - Store identity badge ("Items from {storeName}")
 *   - Compact line items (image + name + unit + stepper + remove)
 *   - Coupon teaser (real apply happens at checkout)
 *   - CartSummaryCard (subtotal + delivery + total)
 *   - Sticky "Proceed to checkout" CTA at the bottom (DP-0 Button)
 *   - Empty state with EmptyCartIllustration
 *
 * IP-1: cart fetches the active store's fee config and computes the
 * delivery-fee preview client-side using the same rule as the backend
 * (computeDeliveryFeePaise). The bill row mirrors what placement will
 * actually charge — no surprise at checkout. Backend still snapshots
 * the final figure at placement, so this is purely a preview.
 */

import { useApi } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { ProgressiveImage } from "@workspace/ui/components/image"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Minus, Plus, ShoppingBag, Store, Tag, Trash2 } from "lucide-react"
import Link from "next/link"
import { motion } from "motion/react"

import { CartSummaryCard } from "@/components/cart-summary-card"
import { EmptyCartIllustration } from "@/components/illustrations"
import { MinOrderStrip } from "@/components/min-order-strip"
import { useCart } from "@/lib/cart"
import { formatPriceFromPaise } from "@/lib/format"
import { useSmartBack } from "@/lib/use-smart-back"
import { cn } from "@workspace/ui/lib/utils"
import { springs, tapScale, useMotionPreset } from "@workspace/ui/lib/motion"

/**
 * Client-side mirror of `apps/backend/src/modules/orders/orders.service.ts`
 * `computeDeliveryFeePaise`. Keeping these in sync is enforced by tests on
 * the backend side; mismatches surface as a fee mismatch between the
 * preview and the final order. If the rule grows complex, lift this into
 * a shared package.
 */
function previewDeliveryFeePaise(
  subtotalPaise: number,
  store: { baseDeliveryFeePaise: number; freeDeliveryThresholdPaise: number } | undefined,
): number {
  if (store === undefined) return 0
  if (
    store.freeDeliveryThresholdPaise > 0 &&
    subtotalPaise >= store.freeDeliveryThresholdPaise
  ) {
    return 0
  }
  return store.baseDeliveryFeePaise
}

export default function CartPage() {
  const api = useApi()
  const cart = useCart()
  const items = Object.values(cart.items)
  const subtotal = cart.subtotalPaise()
  const onBack = useSmartBack("/stores")
  const tap = useMotionPreset(springs.tap)

  const empty = items.length === 0

  // IP-1 — fetch the active store to drive the fee preview + MinOrderStrip.
  // Same query key as the home page so the detail is already cached when the
  // customer navigates Home → Cart. Stale-time matches Home so we don't
  // refetch the moment they cross routes.
  const storeQuery = useQuery({
    queryKey: ["stores", "detail", cart.storeId],
    enabled: cart.storeId !== null && !empty,
    queryFn: () => api.stores.detail(cart.storeId as string),
    staleTime: 60_000,
  })
  const store = storeQuery.data?.store

  const previewFeePaise = previewDeliveryFeePaise(subtotal, store)
  // Free-delivery banner copy when the threshold is met. Quiet success
  // beat — uses the same success-soft tint as MinOrderStrip's "you're good"
  // state so the cart feels consistent with the strip on Home.
  const freeDeliveryEarned =
    store !== undefined &&
    store.freeDeliveryThresholdPaise > 0 &&
    subtotal >= store.freeDeliveryThresholdPaise &&
    store.baseDeliveryFeePaise > 0

  return (
    <div className="min-h-svh bg-background pb-32">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border/40">
        <div className="max-w-md mx-auto flex items-center gap-2 px-4 py-3">
          <Button variant="secondary" size="icon" aria-label="Back" onClick={onBack}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold leading-tight">Your cart</h1>
            {!empty ? (
              <p className="text-xs text-muted-foreground truncate">
                {items.length} item{items.length === 1 ? "" : "s"}
                {cart.storeName ? <> from {cart.storeName}</> : null}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      {/* IP-1 — Min-order / free-delivery nudge directly under the header.
          Same component as the home strip so the customer sees one consistent
          commerce ask across routes. Hidden when cart empty / wrong store /
          neither threshold applies. */}
      {!empty && store !== undefined ? (
        <MinOrderStrip
          storeId={store.id}
          minOrderPaise={store.minOrderPaise}
          freeDeliveryThresholdPaise={store.freeDeliveryThresholdPaise}
        />
      ) : null}

      <main className="max-w-md mx-auto px-4 py-5 space-y-4">
        {empty ? (
          <div className="rounded-[var(--radius-md)] border border-border bg-card py-10 px-4 flex flex-col items-center gap-3 text-center mt-8">
            <EmptyCartIllustration className="w-44" />
            <h2 className="text-base font-semibold">Your cart is empty</h2>
            <p className="text-sm text-muted-foreground max-w-xs">
              Add items from any store and they&rsquo;ll show up here.
            </p>
            <Button asChild className="mt-1">
              <Link href="/stores">Browse stores</Link>
            </Button>
          </div>
        ) : (
          <>
            {/* Store identity badge */}
            {cart.storeName ? (
              <div className="flex items-center gap-2 px-1">
                <Store className="size-4 text-primary" aria-hidden />
                <p className="text-xs text-muted-foreground">
                  Items from{" "}
                  <span className="font-semibold text-foreground">
                    {cart.storeName}
                  </span>
                </p>
              </div>
            ) : null}

            {/* Cart items list */}
            <ul className="space-y-2">
              {items.map((item) => (
                <li
                  key={item.variantId}
                  className="rounded-[var(--radius-md)] border border-border bg-card p-3 flex items-center gap-3"
                >
                  <ProgressiveImage
                    src={item.imageUrl}
                    alt={item.productName}
                    aspect="aspect-square"
                    rounded="rounded-[var(--radius-md)]"
                    className="w-16 shrink-0"
                    fallback={<ShoppingBag className="size-5 text-muted-foreground" />}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight line-clamp-2">
                      {item.productName}
                    </p>
                    {/* IP-2 — show variant name (e.g. "500 g") so the
                        customer sees which size they bought without
                        having to expand the row. Hidden for the legacy
                        "Default" auto-backfill name to avoid noise. */}
                    {item.variantName !== "Default" ? (
                      <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                        {item.variantName}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground tabular-nums mt-1">
                      {formatPriceFromPaise(item.pricePaise)} × {item.quantity}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <div
                      className={cn(
                        "flex items-center h-8 rounded-full bg-primary text-primary-foreground shadow-card overflow-hidden",
                      )}
                    >
                      <motion.button
                        type="button"
                        onClick={() => cart.dec(item.variantId)}
                        whileTap={{ scale: tapScale }}
                        transition={tap}
                        aria-label={`Remove one ${item.productName}`}
                        className="size-8 inline-flex items-center justify-center"
                      >
                        <Minus className="size-3.5" strokeWidth={2.5} />
                      </motion.button>
                      <span className="tabular-nums text-xs font-bold min-w-[1.25rem] text-center">
                        {item.quantity}
                      </span>
                      <motion.button
                        type="button"
                        onClick={() => cart.incVariant(item.variantId)}
                        whileTap={{ scale: tapScale }}
                        transition={tap}
                        aria-label={`Add one more ${item.productName}`}
                        className="size-8 inline-flex items-center justify-center"
                      >
                        <Plus className="size-3.5" strokeWidth={2.5} />
                      </motion.button>
                    </div>
                    <p className="tabular-nums text-xs font-semibold text-foreground">
                      {formatPriceFromPaise(item.pricePaise * item.quantity)}
                    </p>
                  </div>
                  <motion.button
                    type="button"
                    onClick={() => cart.remove(item.variantId)}
                    whileTap={{ scale: tapScale }}
                    transition={tap}
                    aria-label={`Remove ${item.productName}`}
                    className="size-8 inline-flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </motion.button>
                </li>
              ))}
            </ul>

            {/* Coupon teaser — coupon actually applies at checkout. Surfaces
                the offer-aware affordance here so customers know they can. */}
            <Link
              href="/checkout"
              className="flex items-center gap-3 rounded-[var(--radius-md)] border border-dashed border-primary/40 bg-primary/5 px-3 py-2.5 hover:bg-primary/10 transition-colors"
            >
              <Tag className="size-4 text-primary shrink-0" aria-hidden />
              <p className="text-xs flex-1 text-foreground">
                Apply a coupon at checkout to save more
              </p>
              <span className="text-xs font-semibold text-primary">Apply</span>
            </Link>

            {/* Bill — IP-1: real delivery fee preview from the store config.
                Backend snapshots the same number at placement (same rule),
                so the figure here matches what the customer will actually
                pay. Total label switches to "To pay" once we have a real fee
                to commit to (vs an indicative "Subtotal" before the store
                detail loads). */}
            <CartSummaryCard
              subtotalPaise={subtotal}
              deliveryFeePaise={previewFeePaise}
              discountPaise={0}
              totalLabel={store !== undefined ? "To pay (COD)" : "Subtotal"}
            />

            {/* Earned-free-delivery success beat — only when the store
                offers a free tier AND the customer's subtotal cleared it.
                Quiet so it doesn't compete with the strip on the home;
                this is the receipt of the upsell. */}
            {freeDeliveryEarned ? (
              <p
                role="status"
                className="text-[11px] text-success font-semibold text-center"
              >
                Free delivery unlocked — you saved{" "}
                <span className="tabular-nums">
                  {formatPriceFromPaise(store!.baseDeliveryFeePaise)}
                </span>
                .
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground text-center">
                Final amount and any coupon savings confirm at checkout.
              </p>
            )}
          </>
        )}
      </main>

      {/* Sticky checkout CTA — total mirrors the bill row so the customer
          isn't surprised. Includes the IP-1 delivery-fee preview. */}
      {!empty ? (
        <div className="fixed inset-x-0 bottom-0 z-30 bg-background/95 backdrop-blur-md border-t border-border/40 pb-[env(safe-area-inset-bottom)]">
          <div className="max-w-md mx-auto px-4 py-3">
            <Button size="lg" className="w-full" asChild>
              <Link href="/checkout">
                <span className="flex items-center justify-between w-full">
                  <span className="font-semibold">Proceed to checkout</span>
                  <span className="tabular-nums font-bold">
                    {formatPriceFromPaise(subtotal + previewFeePaise)}
                  </span>
                </span>
              </Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
