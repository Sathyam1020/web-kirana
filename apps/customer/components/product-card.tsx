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

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
      className="bg-card rounded-[var(--radius-md)] border border-border p-3 flex flex-col hover:shadow-md transition-shadow"
    >
      <div className="aspect-square bg-surface-soft rounded-[var(--radius-md)] overflow-hidden mb-3">
        <SafeImage
          src={product.imageUrl}
          alt={product.name}
          fallback={<ShoppingBag className="size-8" />}
        />
      </div>
      <h3 className="text-sm font-medium line-clamp-2 min-h-10">
        {product.name}
      </h3>
      <p className="text-xs text-muted-foreground mt-0.5">
        {unitLabel(product.unit)}
      </p>
      <div className="flex items-center justify-between mt-2">
        <span className="tabular-nums font-semibold text-base">
          {formatPriceFromPaise(product.pricePaise)}
        </span>
        {product.isAvailable ? (
          <AnimatePresence mode="wait" initial={false}>
            {inCart > 0 ? (
              <motion.div
                key="stepper"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.12 }}
                className="flex items-center gap-1 rounded-full bg-primary text-primary-foreground shadow-sm"
              >
                <button
                  onClick={() => cart.dec(product.id)}
                  className="size-8 inline-flex items-center justify-center text-sm font-semibold transition-transform active:scale-90"
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
                  className="size-8 inline-flex items-center justify-center text-sm font-semibold transition-transform active:scale-90"
                  aria-label="Add one"
                >
                  +
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="add"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.12 }}
              >
                <Button size="sm" onClick={() => cart.inc(product, storeId)}>
                  <Plus className="size-3.5" />
                  Add
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        ) : (
          <span className="text-xs text-muted-foreground">Out of stock</span>
        )}
      </div>
    </motion.div>
  )
}

function unitLabel(u: Unit): string {
  return `Per ${UNIT_LABELS[u]}`
}
