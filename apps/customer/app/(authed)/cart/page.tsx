"use client"

/**
 * Cart page — refreshed to DP-1 visual language (DP-3).
 *
 * Layout:
 *   - Sticky back-header
 *   - Store identity badge ("Items from {storeName}")
 *   - Free-delivery progress bar
 *   - Compact line items (image + name + unit + stepper + remove)
 *   - Coupon teaser (real apply happens at checkout)
 *   - CartSummaryCard (subtotal + delivery + total)
 *   - Sticky "Proceed to checkout" CTA at the bottom (DP-0 Button)
 *   - Empty state with EmptyCartIllustration
 *
 * Free-delivery threshold + base delivery fee are NOT yet on the cart slice
 * (the store config trio lands in IP-1). For now the cart treats delivery
 * as Free and skips the progress bar until threshold data flows through.
 */

import { Button } from "@workspace/ui/components/button"
import { ProgressiveImage } from "@workspace/ui/components/image"
import { ArrowLeft, Minus, Plus, ShoppingBag, Store, Tag, Trash2 } from "lucide-react"
import Link from "next/link"
import { motion } from "motion/react"

import { CartSummaryCard } from "@/components/cart-summary-card"
import { EmptyCartIllustration } from "@/components/illustrations"
import { useCart } from "@/lib/cart"
import { formatPriceFromPaise } from "@/lib/format"
import { useSmartBack } from "@/lib/use-smart-back"
import { cn } from "@workspace/ui/lib/utils"
import { springs, tapScale, useMotionPreset } from "@workspace/ui/lib/motion"

export default function CartPage() {
  const cart = useCart()
  const items = Object.values(cart.items)
  const subtotal = cart.subtotalPaise()
  const onBack = useSmartBack("/stores")
  const tap = useMotionPreset(springs.tap)

  const empty = items.length === 0

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
                  key={item.productId}
                  className="rounded-[var(--radius-md)] border border-border bg-card p-3 flex items-center gap-3"
                >
                  <ProgressiveImage
                    src={item.imageUrl}
                    alt={item.name}
                    aspect="aspect-square"
                    rounded="rounded-[var(--radius-md)]"
                    className="w-16 shrink-0"
                    fallback={<ShoppingBag className="size-5 text-muted-foreground" />}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight line-clamp-2">
                      {item.name}
                    </p>
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
                        onClick={() => cart.dec(item.productId)}
                        whileTap={{ scale: tapScale }}
                        transition={tap}
                        aria-label={`Remove one ${item.name}`}
                        className="size-8 inline-flex items-center justify-center"
                      >
                        <Minus className="size-3.5" strokeWidth={2.5} />
                      </motion.button>
                      <span className="tabular-nums text-xs font-bold min-w-[1.25rem] text-center">
                        {item.quantity}
                      </span>
                      <motion.button
                        type="button"
                        onClick={() => cart.incById(item.productId)}
                        whileTap={{ scale: tapScale }}
                        transition={tap}
                        aria-label={`Add one more ${item.name}`}
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
                    onClick={() => cart.remove(item.productId)}
                    whileTap={{ scale: tapScale }}
                    transition={tap}
                    aria-label={`Remove ${item.name}`}
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

            {/* Bill */}
            <CartSummaryCard
              subtotalPaise={subtotal}
              deliveryFeePaise={0}
              discountPaise={0}
              totalLabel="Subtotal"
            />

            <p className="text-[11px] text-muted-foreground text-center">
              Delivery fees and any coupon savings are calculated at checkout.
            </p>
          </>
        )}
      </main>

      {/* Sticky checkout CTA */}
      {!empty ? (
        <div className="fixed inset-x-0 bottom-0 z-30 bg-background/95 backdrop-blur-md border-t border-border/40 pb-[env(safe-area-inset-bottom)]">
          <div className="max-w-md mx-auto px-4 py-3">
            <Button size="lg" className="w-full" asChild>
              <Link href="/checkout">
                <span className="flex items-center justify-between w-full">
                  <span className="font-semibold">Proceed to checkout</span>
                  <span className="tabular-nums font-bold">
                    {formatPriceFromPaise(subtotal)}
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
