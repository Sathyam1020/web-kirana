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
  // The ribbon stacks two lines: a big amount on top and "OFF" beneath.
  // Splitting here so the visual chrome stays a pure render concern.
  const discountTopLine = !hasDiscount
    ? null
    : product.discountType === "PERCENT" && product.discountValue !== null
      ? `${product.discountValue}%`
      : formatPriceFromPaise(product.pricePaise - product.effectivePricePaise)
  const discountAriaLabel = discountTopLine ? `${discountTopLine} off` : null

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
        {discountTopLine && !oos ? (
          // DP-9.1: Blinkit-style ribbon hanging from the top-left of the
          // product image. clip-path carves a V-notch in the bottom edge
          // so the badge reads as a "banner" instead of a rounded pill.
          // The drop-shadow filter (not box-shadow) respects the clip
          // path so the shadow follows the notched silhouette.
          <span
            aria-label={discountAriaLabel ?? undefined}
            role="img"
            className={cn(
              "absolute top-0 left-2 z-10 select-none pointer-events-none",
              "w-9 pt-1 pb-3",
              "flex flex-col items-center justify-start",
              "bg-discount text-discount-foreground",
              "text-[10px] font-extrabold leading-[1.05] tracking-wide",
              "[filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.22))]",
            )}
            style={{
              clipPath:
                "polygon(0 0, 100% 0, 100% 100%, 50% 70%, 0 100%)",
            }}
          >
            <span className="tabular-nums">{discountTopLine}</span>
            <span className="text-[8px] tracking-[0.04em] -mt-px">OFF</span>
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

      {/* ADD / stepper — DP-7 tone-down: ADD is the resting state, the
          STEPPER is the engaged state. Blinkit's actual cards: ADD is a
          subtle outlined chip; only after engaging does it switch to a
          loud filled stepper. Mirrors that.
          Both states share the same h-7 (28px) tap target so the layout
          doesn't reflow when the morph happens. */}
      <div className="mt-auto pt-1.5 px-0.5">
        {oos ? (
          <button
            type="button"
            disabled
            className="w-full inline-flex items-center justify-center h-7 rounded-full text-[10px] font-semibold text-muted-foreground border border-border bg-surface-soft"
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
                  // Engaged state stays in the SAME visual family as the
                  // resting ADD chip — outlined, white surface, primary
                  // border / icons / count. The count pulse on increment
                  // (below) is the "you just added one" feedback; we
                  // don't need a loud filled fill for that.
                  "flex items-center justify-between h-7 rounded-full overflow-hidden w-full",
                  "bg-card border border-primary text-primary",
                )}
                data-state="stepper"
              >
                <motion.button
                  type="button"
                  onClick={() => cart.dec(product.id)}
                  whileTap={{ scale: tapScale }}
                  transition={tap}
                  aria-label={`Remove one ${product.name}`}
                  className="h-7 px-2 inline-flex items-center justify-center"
                >
                  <Minus className="size-3" strokeWidth={2.5} />
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
                  className="h-7 px-2 inline-flex items-center justify-center"
                >
                  <Plus className="size-3" strokeWidth={2.5} />
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
                  // Resting-state ADD — outlined chip, white surface,
                  // primary border + label. Filled was reading as a
                  // billboard at full-width; this is Blinkit's actual
                  // pattern: a clear affordance that doesn't out-shout
                  // the product image / price above it.
                  "w-full inline-flex items-center justify-center h-7 rounded-full",
                  "bg-card border border-primary text-primary",
                  "font-bold text-[11px] tracking-wide",
                  "hover:bg-primary/5 transition-colors",
                )}
                data-state="add"
              >
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
