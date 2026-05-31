"use client"

/**
 * Compact product card for home rails (buy-again, featured, bestsellers).
 *
 * Stacked layout, no overlaps:
 *   image
 *   name
 *   unit
 *   price
 *   ─────────
 *   [   ADD   ]   ← full-width chip at the bottom; morphs into stepper
 *
 * Sibling to `ProductCard` (the bigger bordered card used in store-detail
 * grids). They share the same cart API; visuals differ.
 */

import type { ProductPublicView, Unit } from "@workspace/api-client"
import { UNIT_LABELS } from "@workspace/api-client"
import { ProgressiveImage } from "@workspace/ui/components/image"
import { Minus, Plus, ShoppingBag } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import { useCart } from "@/lib/cart"
import { formatPriceFromPaise } from "@/lib/format"
import { cn } from "@workspace/ui/lib/utils"
import { springs, tapScale, useMotionPreset } from "@workspace/ui/lib/motion"

interface ProductCardCompactProps {
  product: ProductPublicView
  storeId: string
  /** Snapshot of the store's display name — stored on the cart so the
   *  floating pill can show "Hampi Kirani" alongside item count. */
  storeName?: string
  className?: string
}

export function ProductCardCompact({
  product,
  storeId,
  storeName,
  className,
}: ProductCardCompactProps) {
  const cart = useCart()
  const inCart = cart.itemCount(product.id)

  const hasDiscount = product.effectivePricePaise < product.pricePaise
  const discountLabel = !hasDiscount
    ? null
    : product.discountType === "PERCENT" && product.discountValue !== null
      ? `${product.discountValue}% OFF`
      : `${formatPriceFromPaise(product.pricePaise - product.effectivePricePaise)} OFF`

  const tap = useMotionPreset(springs.tap)
  const oos = !product.isAvailable

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={tap}
      className={cn(
        "flex flex-col select-none rounded-[var(--radius-md)] bg-card border border-border-soft",
        "p-2 hover:shadow-card transition-shadow",
        className,
      )}
      data-product-id={product.id}
    >
      {/* Image — discount tag / OOS overlay only. No action button here. */}
      <div className="relative">
        <ProgressiveImage
          src={product.imageUrl}
          alt={product.name}
          aspect="aspect-square"
          rounded="rounded-[var(--radius-md)]"
          fallback={<ShoppingBag className="size-7 text-muted-foreground" />}
        />
        {discountLabel && !oos ? (
          <span className="absolute top-1.5 left-1.5 rounded-[var(--radius-sm)] bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground shadow-card">
            {discountLabel}
          </span>
        ) : null}
        {oos ? (
          <span className="absolute top-1.5 left-1.5 rounded-[var(--radius-sm)] bg-foreground/85 text-background px-1.5 py-0.5 text-[10px] font-semibold leading-none">
            Out of stock
          </span>
        ) : null}
      </div>

      {/* Name + unit + price stack — tight, no min-h reserve. */}
      <div className="pt-2 px-0.5">
        <p className="text-[13px] font-medium leading-tight line-clamp-2 text-foreground">
          {product.name}
        </p>
        <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
          {unitLabel(product.unit)}
        </p>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="tabular-nums text-sm font-bold text-foreground">
            {formatPriceFromPaise(product.effectivePricePaise)}
          </span>
          {hasDiscount ? (
            <span className="tabular-nums text-[10px] text-muted-foreground line-through">
              {formatPriceFromPaise(product.pricePaise)}
            </span>
          ) : null}
        </div>
      </div>

      {/* ADD / stepper — full-width row at the bottom. `mt-auto` anchors
          it to the card foot so siblings of different name lengths still
          line up their buttons. */}
      <div className="mt-auto pt-2 px-0.5">
        {oos ? (
          <button
            type="button"
            disabled
            className="w-full inline-flex items-center justify-center h-9 rounded-full text-xs font-semibold text-muted-foreground border border-border bg-surface-soft"
          >
            Notify me
          </button>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            {inCart > 0 ? (
              <motion.div
                key="stepper"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={tap}
                className={cn(
                  "flex items-center justify-between h-9 rounded-full overflow-hidden w-full",
                  "bg-primary text-primary-foreground shadow-card",
                )}
                data-state="stepper"
              >
                <motion.button
                  type="button"
                  onClick={() => cart.dec(product.id)}
                  whileTap={{ scale: tapScale }}
                  transition={tap}
                  aria-label={`Remove one ${product.name}`}
                  className="h-9 px-3 inline-flex items-center justify-center"
                >
                  <Minus className="size-4" strokeWidth={2.5} />
                </motion.button>
                <motion.span
                  key={inCart}
                  initial={{ y: -3, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 3, opacity: 0 }}
                  transition={tap}
                  className="tabular-nums text-sm font-bold"
                >
                  {inCart}
                </motion.span>
                <motion.button
                  type="button"
                  onClick={() => cart.inc(product, storeId, storeName)}
                  whileTap={{ scale: tapScale }}
                  transition={tap}
                  aria-label={`Add one more ${product.name}`}
                  className="h-9 px-3 inline-flex items-center justify-center"
                >
                  <Plus className="size-4" strokeWidth={2.5} />
                </motion.button>
              </motion.div>
            ) : (
              <motion.button
                key="add"
                type="button"
                onClick={() => cart.inc(product, storeId, storeName)}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                whileTap={{ scale: tapScale }}
                transition={tap}
                aria-label={`Add ${product.name} to cart`}
                className={cn(
                  // Full-width outlined ADD — high invitation, zero
                  // chance of overlapping anything else.
                  "w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-full",
                  "bg-card border border-primary text-primary font-bold text-xs uppercase tracking-wide",
                  "hover:bg-primary/5 transition-colors",
                )}
                data-state="add"
              >
                <Plus className="size-4" strokeWidth={3} />
                Add
              </motion.button>
            )}
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  )
}

function unitLabel(u: Unit): string {
  return `Per ${UNIT_LABELS[u]}`
}
