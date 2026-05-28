"use client"

import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { SafeImage } from "@workspace/ui/components/safe-image"
import { ArrowLeft, ShoppingBag, Trash2 } from "lucide-react"
import Link from "next/link"
import { useCart } from "@/lib/cart"
import { formatPriceFromPaise } from "@/lib/format"

export default function CartPage() {
  const cart = useCart()
  const items = Object.values(cart.items)
  const subtotal = cart.subtotalPaise()

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
              <Card key={item.productId} className="p-3 flex items-center gap-3">
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
                </div>
                <div className="inline-flex items-center rounded-full bg-muted">
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

            <div className="bg-muted rounded-[var(--radius-lg)] p-4 flex justify-between text-sm font-semibold">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatPriceFromPaise(subtotal)}</span>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Apply coupons and pick a delivery address at checkout.
            </p>
          </>
        )}
      </main>

      {items.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 bg-background/90 backdrop-blur-md border-t border-border/40 p-4">
          <div className="max-w-2xl mx-auto">
            <Button size="lg" className="w-full" asChild>
              <Link href="/checkout">
                Proceed to checkout · {formatPriceFromPaise(subtotal)}
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
