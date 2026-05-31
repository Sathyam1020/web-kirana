"use client"

/**
 * Compact product card for home rails (buy-again, featured, bestsellers).
 *
 * Design intent:
 *   - Card-framed (bg-card + subtle border + hover shadow) so it reads as
 *     tappable.
 *   - Image-dominant top half; ADD pill floats at bottom-right of the
 *     image, OUTLINED initially → fills with Rausch once in cart. The
 *     outlined→filled transition is the "I'm a button waiting for you" →
 *     "I'm engaged" cue that makes the CTA feel inviting.
 *   - Discount tag top-left overlay when present; OOS chip replaces ADD.
 *   - Below image: name (2-line clamp), unit, price (bold, with MRP
 *     strikethrough next to it).
 *
 * Sibling to `ProductCard` (the bigger, full-bordered card used in
 * store-detail grids). They share the same cart API; visuals differ.
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
      <div className="relative">
        <ProgressiveImage
          src={product.imageUrl}
          alt={product.name}
          aspect="aspect-square"
          rounded="rounded-[var(--radius-md)]"
          fallback={<ShoppingBag className="size-7 text-muted-foreground" />}
        />

        {/* Discount badge / OOS chip top-left */}
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

        {/* ADD / stepper overlay — bottom-right of image */}
        {!oos ? (
          <div className="absolute bottom-1.5 right-1.5">
            <AnimatePresence mode="wait" initial={false}>
              {inCart > 0 ? (
                <motion.div
                  key="stepper"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  transition={tap}
                  className={cn(
                    "flex items-center h-8 rounded-full overflow-hidden",
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
                    className="size-8 inline-flex items-center justify-center"
                  >
                    <Minus className="size-3.5" strokeWidth={2.5} />
                  </motion.button>
                  <motion.span
                    key={inCart}
                    initial={{ y: -3, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 3, opacity: 0 }}
                    transition={tap}
                    className="tabular-nums text-xs font-bold min-w-[1.25rem] text-center"
                  >
                    {inCart}
                  </motion.span>
                  <motion.button
                    type="button"
                    onClick={() => cart.inc(product, storeId, storeName)}
                    whileTap={{ scale: tapScale }}
                    transition={tap}
                    aria-label={`Add one more ${product.name}`}
                    className="size-8 inline-flex items-center justify-center"
                  >
                    <Plus className="size-3.5" strokeWidth={2.5} />
                  </motion.button>
                </motion.div>
              ) : (
                <motion.button
                  key="add"
                  type="button"
                  onClick={() => cart.inc(product, storeId, storeName)}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  whileTap={{ scale: tapScale }}
                  transition={tap}
                  aria-label={`Add ${product.name} to cart`}
                  className={cn(
                    // Outlined initial state — Rausch border + text on a
                    // light card chip, which then morphs to the filled
                    // stepper above. The chip is wider than a bare icon so
                    // it screams "tap me".
                    "inline-flex items-center gap-1 h-8 px-3 rounded-full",
                    "bg-card border border-primary text-primary font-bold text-xs uppercase tracking-wide",
                    "shadow-card hover:bg-primary/5",
                  )}
                  data-state="add"
                >
                  <Plus className="size-3.5" strokeWidth={3} />
                  Add
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        ) : null}
      </div>

      {/* Body — name / unit / price stack */}
      <div className="pt-2 px-0.5 flex flex-col gap-0.5">
        <p className="text-[13px] font-medium leading-tight line-clamp-2 min-h-[2.25rem] text-foreground">
          {product.name}
        </p>
        <p className="text-[11px] text-muted-foreground leading-tight">
          {unitLabel(product.unit)}
        </p>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="tabular-nums text-sm font-bold text-foreground">
            {formatPriceFromPaise(product.effectivePricePaise)}
          </span>
          {hasDiscount ? (
            <span className="tabular-nums text-[11px] text-muted-foreground line-through">
              {formatPriceFromPaise(product.pricePaise)}
            </span>
          ) : null}
        </div>
      </div>
    </motion.div>
  )
}

function unitLabel(u: Unit): string {
  return `Per ${UNIT_LABELS[u]}`
}
