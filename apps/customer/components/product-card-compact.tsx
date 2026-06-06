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

import type {
  ProductPublicVariantView,
  ProductPublicView,
  Unit,
} from "@workspace/api-client"
import { UNIT_LABELS } from "@workspace/api-client"
import { ProgressiveImage } from "@workspace/ui/components/image"
import { ChevronDown, Minus, Plus, ShoppingBag } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useState } from "react"

import { useCart } from "@/lib/cart"
import { formatPriceFromPaise } from "@/lib/format"
import { VariantPickerSheet } from "@/components/variant-picker-sheet"
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

/**
 * IP-2 — find the variant the card's single-variant path should ADD.
 * Every backfilled product carries ≥1 variant (default is marked
 * isDefault=true). Falls back to the first variant defensively in
 * case the default flag is missing.
 */
function pickDefaultVariant(
  product: ProductPublicView,
): ProductPublicVariantView | null {
  if (product.variants.length === 0) return null
  return product.variants.find((v) => v.isDefault) ?? product.variants[0] ?? null
}

export function ProductCardCompact({
  product,
  storeId,
  storeName,
  className,
}: ProductCardCompactProps) {
  const cart = useCart()
  const [variantSheetOpen, setVariantSheetOpen] = useState(false)

  // IP-2 — multi-variant trigger. >1 variant → "Add ▾" opens the picker.
  const hasMultipleVariants = product.variants.length > 1
  const defaultVariant = pickDefaultVariant(product)

  // Cart count: for single-variant cards, the stepper binds to that
  // exact variant. For multi-variant cards we surface the AGGREGATE
  // across all variants of this product so the "N · Add more" badge
  // is honest about everything the customer already picked from this row.
  const inCart = hasMultipleVariants
    ? cart.productCount(product.id)
    : defaultVariant !== null
      ? cart.variantCount(defaultVariant.id)
      : 0

  // Price displayed on the card. For multi-variant we show the cheapest
  // in-stock variant's effective price ("from ₹X"). Single-variant uses
  // the default variant's effective price directly.
  const availableVariants = product.variants.filter((v) => v.isAvailable)
  const cheapestEffective =
    hasMultipleVariants && availableVariants.length > 0
      ? Math.min(...availableVariants.map((v) => v.effectivePricePaise))
      : (defaultVariant?.effectivePricePaise ?? product.effectivePricePaise)
  const cheapestList =
    hasMultipleVariants && availableVariants.length > 0
      ? availableVariants.find((v) => v.effectivePricePaise === cheapestEffective)?.pricePaise ??
        product.pricePaise
      : (defaultVariant?.pricePaise ?? product.pricePaise)

  const hasDiscount = cheapestEffective < cheapestList
  const discountTopLine = !hasDiscount
    ? null
    : product.discountType === "PERCENT" && product.discountValue !== null
      ? `${product.discountValue}%`
      : formatPriceFromPaise(cheapestList - cheapestEffective)
  const discountAriaLabel = discountTopLine ? `${discountTopLine} off` : null

  const tap = useMotionPreset(springs.tap)
  const oos = !product.isAvailable

  return (
    <>
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
          denser grocery scanability. IP-2: multi-variant cards show
          "X sizes" + "from ₹X" so the affordance is visible BEFORE
          the customer taps. */}
      <div className="pt-1.5 px-0.5">
        <p className="text-[12px] font-medium leading-[1.15] line-clamp-2 text-foreground">
          {product.name}
        </p>
        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
          {hasMultipleVariants
            ? `${product.variants.length} sizes`
            : unitLabel(product.unit)}
        </p>
        <div className="mt-0.5 flex items-baseline gap-1">
          {hasMultipleVariants ? (
            <span className="text-[9px] text-muted-foreground tracking-wide font-medium uppercase">
              from
            </span>
          ) : null}
          <span className="tabular-nums text-[13px] font-bold text-foreground">
            {formatPriceFromPaise(cheapestEffective)}
          </span>
          {hasDiscount ? (
            <span className="tabular-nums text-[10px] text-muted-foreground line-through">
              {formatPriceFromPaise(cheapestList)}
            </span>
          ) : null}
        </div>
      </div>

      {/* ADD / stepper — DP-7 tone-down: ADD is the resting state, the
          STEPPER is the engaged state. IP-2: multi-variant products
          skip the single-tap ADD entirely and surface "Add ▾" which
          opens the variant picker sheet. A stepper inside a card
          doesn't make sense when there are multiple sizes — which
          one would +/- target? */}
      <div className="mt-auto pt-1.5 px-0.5">
        {oos ? (
          <button
            type="button"
            disabled
            className="w-full inline-flex items-center justify-center h-7 rounded-full text-[10px] font-semibold text-muted-foreground border border-border bg-surface-soft"
          >
            Notify me
          </button>
        ) : hasMultipleVariants ? (
          <motion.button
            key="options"
            type="button"
            onClick={() => setVariantSheetOpen(true)}
            whileTap={{ scale: tapScale }}
            transition={tap}
            aria-label={`Choose a size for ${product.name}`}
            aria-haspopup="dialog"
            className={cn(
              "w-full inline-flex items-center justify-center gap-1 h-7 rounded-full",
              "bg-card border border-primary text-primary",
              "font-bold text-[11px] tracking-wide",
              "hover:bg-primary/5 transition-colors",
            )}
            data-state="options"
          >
            {inCart > 0 ? (
              <>
                <span className="tabular-nums">{inCart}</span>
                <span aria-hidden className="opacity-50">·</span>
                Add more
              </>
            ) : (
              "Add"
            )}
            <ChevronDown className="size-3" strokeWidth={2.5} aria-hidden />
          </motion.button>
        ) : defaultVariant === null ? (
          // Defensive: a product with no variants shouldn't render an
          // actionable card. The server invariant says ≥1 variant per
          // product, so this is the legacy-snapshot reorder shim path.
          <button
            type="button"
            disabled
            className="w-full inline-flex items-center justify-center h-7 rounded-full text-[10px] font-semibold text-muted-foreground border border-border bg-surface-soft"
          >
            Unavailable
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
                  "flex items-center justify-between h-7 rounded-full overflow-hidden w-full",
                  "bg-card border border-primary text-primary",
                )}
                data-state="stepper"
              >
                <motion.button
                  type="button"
                  onClick={() => cart.dec(defaultVariant.id)}
                  whileTap={{ scale: tapScale }}
                  transition={tap}
                  aria-label={`Remove one ${product.name}`}
                  className="h-7 px-2 inline-flex items-center justify-center"
                >
                  <Minus className="size-3" strokeWidth={2.5} />
                </motion.button>
                <motion.span
                  key={inCart}
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
                  onClick={() => cart.inc(product, defaultVariant, storeId, storeName)}
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
                onClick={() => cart.inc(product, defaultVariant, storeId, storeName)}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                whileTap={{ scale: tapScale }}
                transition={tap}
                aria-label={`Add ${product.name} to cart`}
                className={cn(
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
    {hasMultipleVariants ? (
      <VariantPickerSheet
        open={variantSheetOpen}
        onOpenChange={setVariantSheetOpen}
        product={product}
        storeId={storeId}
        storeName={storeName}
      />
    ) : null}
    </>
  )
}

function unitLabel(u: Unit): string {
  return `Per ${UNIT_LABELS[u]}`
}
