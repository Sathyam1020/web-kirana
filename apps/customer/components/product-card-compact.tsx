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
        // DP-7 compression: card padding p-1.5 → p-1 to claw back ~8px
        // vertical per card and let more products fit in a viewport.
        "p-1 hover:shadow-card transition-shadow",
        className,
      )}
      data-product-id={product.id}
    >
      {/* Image — discount tag / OOS overlay only. No action button here.
          DP-7 compression: aspect-square → aspect-[5/4] trims ~25px of
          image height per card; product is still recognizable while the
          ADD button (the actual commerce primitive) reaches the thumb
          faster on scroll. */}
      <div className="relative">
        <ProgressiveImage
          src={product.imageUrl}
          alt={product.name}
          aspect="aspect-[5/4]"
          rounded="rounded-[var(--radius-md)]"
          fallback={<ShoppingBag className="size-6 text-muted-foreground" />}
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

      {/* Name + unit + price stack — DP-7: tighter typography for
          denser grocery scanability. Name + price stay legible; the
          delta is shaved off the gaps. */}
      <div className="pt-1.5 px-0.5">
        <p className="text-[12px] font-medium leading-[1.15] line-clamp-2 text-foreground">
          {product.name}
        </p>
        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
          {unitLabel(product.unit)}
        </p>
        <div className="mt-0.5 flex items-baseline gap-1">
          <span className="tabular-nums text-[13px] font-bold text-foreground">
            {formatPriceFromPaise(product.effectivePricePaise)}
          </span>
          {hasDiscount ? (
            <span className="tabular-nums text-[10px] text-muted-foreground line-through">
              {formatPriceFromPaise(product.pricePaise)}
            </span>
          ) : null}
        </div>
      </div>

      {/* ADD / stepper — DP-7: h-9 → h-8 keeps a comfortable 32px tap
          target while shaving height off each card. */}
      <div className="mt-auto pt-1.5 px-0.5">
        {oos ? (
          <button
            type="button"
            disabled
            className="w-full inline-flex items-center justify-center h-8 rounded-full text-[11px] font-semibold text-muted-foreground border border-border bg-surface-soft"
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
                  "flex items-center justify-between h-8 rounded-full overflow-hidden w-full",
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
                  className="h-8 px-2.5 inline-flex items-center justify-center"
                >
                  <Minus className="size-3.5" strokeWidth={2.5} />
                </motion.button>
                <motion.span
                  key={inCart}
                  // DP-6: tactile scale pulse on every increment — feels
                  // like a click instead of a soft slide-fade.
                  initial={{ scale: 1.18, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
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
                  className="h-8 px-2.5 inline-flex items-center justify-center"
                >
                  <Plus className="size-3.5" strokeWidth={2.5} />
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
                  // DP-6/DP-7: filled primary ADD (Blinkit/Zepto-native).
                  // h-8 — 32px is the platform-recommended floor for tap
                  // targets and lets ~3 more cards fit on a long scroll.
                  "w-full inline-flex items-center justify-center gap-1.5 h-8 rounded-full",
                  "bg-primary text-primary-foreground font-bold text-[11px] uppercase tracking-wide",
                  "shadow-card hover:bg-primary-active transition-colors",
                )}
                data-state="add"
              >
                <Plus className="size-3.5" strokeWidth={3} />
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
