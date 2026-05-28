"use client"

import { Button } from "@workspace/ui/components/button"
import { SafeImage } from "@workspace/ui/components/safe-image"
import type { ProductPublicView, Unit } from "@workspace/api-client"
import { UNIT_LABELS } from "@workspace/api-client"
import { Plus, ShoppingBag } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { formatPriceFromPaise } from "@/lib/format"
import { useCart } from "@/lib/cart"

export function ProductCard({
  product,
  storeId,
}: {
  product: ProductPublicView
  storeId: string
}) {
  const cart = useCart()
  const inCart = cart.itemCount(product.id)

  // Phase 6.8 — effectivePricePaise already accounts for expiry server-side,
  // so a strictly-lower effective price means an active discount.
  const hasDiscount = product.effectivePricePaise < product.pricePaise
  const discountLabel = !hasDiscount
    ? null
    : product.discountType === "PERCENT" && product.discountValue !== null
      ? `${product.discountValue}% OFF`
      : `${formatPriceFromPaise(product.pricePaise - product.effectivePricePaise)} OFF`

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
      className="bg-card rounded-[var(--radius-md)] border border-border p-3 flex flex-col hover:shadow-md transition-shadow"
    >
      <div className="relative aspect-square bg-surface-soft rounded-[var(--radius-md)] overflow-hidden mb-3">
        <SafeImage
          src={product.imageUrl}
          alt={product.name}
          fallback={<ShoppingBag className="size-8" />}
        />
        {discountLabel && (
          <span className="absolute top-1.5 left-1.5 rounded-[var(--radius-sm)] bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
            {discountLabel}
          </span>
        )}
      </div>
      <h3 className="text-sm font-medium line-clamp-2 min-h-10">
        {product.name}
      </h3>
      <p className="text-xs text-muted-foreground mt-0.5">
        {unitLabel(product.unit)}
      </p>
      {/* Price on its own line + a full-width Add / stepper below. Stacking
          (vs side-by-side) keeps the footer clean at every card width — the
          compact horizontal-scroll cards and the wider grid cards alike. */}
      <div className="mt-2 space-y-2">
        {hasDiscount ? (
          <span className="flex items-baseline gap-1.5">
            <span className="tabular-nums font-semibold text-base">
              {formatPriceFromPaise(product.effectivePricePaise)}
            </span>
            <span className="tabular-nums text-xs text-muted-foreground line-through">
              {formatPriceFromPaise(product.pricePaise)}
            </span>
          </span>
        ) : (
          <span className="block tabular-nums font-semibold text-base">
            {formatPriceFromPaise(product.pricePaise)}
          </span>
        )}
        {product.isAvailable ? (
          <AnimatePresence mode="wait" initial={false}>
            {inCart > 0 ? (
              <motion.div
                key="stepper"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.12 }}
                className="flex items-center justify-between rounded-full bg-primary text-primary-foreground shadow-sm h-9 w-full"
              >
                <button
                  onClick={() => cart.dec(product.id)}
                  className="size-9 inline-flex items-center justify-center text-base font-semibold transition-transform active:scale-90"
                  aria-label="Remove one"
                >
                  −
                </button>
                <motion.span
                  key={inCart}
                  initial={{ y: -4, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 4, opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className="tabular-nums text-sm font-semibold min-w-4 text-center"
                >
                  {inCart}
                </motion.span>
                <button
                  onClick={() => cart.inc(product, storeId)}
                  className="size-9 inline-flex items-center justify-center text-base font-semibold transition-transform active:scale-90"
                  aria-label="Add one"
                >
                  +
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="add"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.12 }}
              >
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => cart.inc(product, storeId)}
                >
                  <Plus className="size-3.5" />
                  Add
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        ) : (
          <span className="block text-xs text-muted-foreground">Out of stock</span>
        )}
      </div>
    </motion.div>
  )
}

function unitLabel(u: Unit): string {
  return `Per ${UNIT_LABELS[u]}`
}
