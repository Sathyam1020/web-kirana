"use client"

import { Button } from "@workspace/ui/components/button"
import { SafeImage } from "@workspace/ui/components/safe-image"
import type {
  ProductPublicVariantView,
  ProductPublicView,
  Unit,
} from "@workspace/api-client"
import { UNIT_LABELS } from "@workspace/api-client"
import { ChevronDown, Plus, ShoppingBag } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useState } from "react"

import { formatPriceFromPaise } from "@/lib/format"
import { useCart } from "@/lib/cart"
import { VariantPickerSheet } from "@/components/variant-picker-sheet"

function pickDefaultVariant(
  product: ProductPublicView,
): ProductPublicVariantView | null {
  if (product.variants.length === 0) return null
  return product.variants.find((v) => v.isDefault) ?? product.variants[0] ?? null
}

export function ProductCard({
  product,
  storeId,
  storeName,
}: {
  product: ProductPublicView
  storeId: string
  storeName?: string
}) {
  const cart = useCart()
  const [variantSheetOpen, setVariantSheetOpen] = useState(false)

  const hasMultipleVariants = product.variants.length > 1
  const defaultVariant = pickDefaultVariant(product)

  const inCart = hasMultipleVariants
    ? cart.productCount(product.id)
    : defaultVariant !== null
      ? cart.variantCount(defaultVariant.id)
      : 0

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
  const discountLabel = !hasDiscount
    ? null
    : product.discountType === "PERCENT" && product.discountValue !== null
      ? `${product.discountValue}% OFF`
      : `${formatPriceFromPaise(cheapestList - cheapestEffective)} OFF`

  return (
    <>
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
          <span className="absolute top-1.5 left-1.5 rounded-[var(--radius-sm)] bg-discount px-1.5 py-0.5 text-[10px] font-semibold leading-none text-discount-foreground">
            {discountLabel}
          </span>
        )}
      </div>
      <h3 className="text-sm font-medium line-clamp-2 min-h-10">
        {product.name}
      </h3>
      <p className="text-xs text-muted-foreground mt-0.5">
        {hasMultipleVariants
          ? `${product.variants.length} sizes`
          : unitLabel(product.unit)}
      </p>
      <div className="mt-2 space-y-2">
        <span className="flex items-baseline gap-1.5">
          {hasMultipleVariants ? (
            <span className="text-[10px] text-muted-foreground tracking-wide font-medium uppercase">
              from
            </span>
          ) : null}
          <span className="tabular-nums font-semibold text-base">
            {formatPriceFromPaise(cheapestEffective)}
          </span>
          {hasDiscount ? (
            <span className="tabular-nums text-xs text-muted-foreground line-through">
              {formatPriceFromPaise(cheapestList)}
            </span>
          ) : null}
        </span>
        {!product.isAvailable ? (
          <span className="block text-xs text-muted-foreground">Out of stock</span>
        ) : hasMultipleVariants ? (
          // IP-2: multi-variant — chip with chevron opens the picker.
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => setVariantSheetOpen(true)}
            aria-haspopup="dialog"
          >
            {inCart > 0 ? (
              <>
                <span className="tabular-nums">{inCart}</span>
                <span aria-hidden className="opacity-50 mx-1">·</span>
                Add more
              </>
            ) : (
              "Add"
            )}
            <ChevronDown className="size-3.5" />
          </Button>
        ) : defaultVariant === null ? (
          <span className="block text-xs text-muted-foreground">Unavailable</span>
        ) : (
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
                  onClick={() => cart.dec(defaultVariant.id)}
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
                  onClick={() => cart.inc(product, defaultVariant, storeId, storeName)}
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
                  onClick={() => cart.inc(product, defaultVariant, storeId, storeName)}
                >
                  <Plus className="size-3.5" />
                  Add
                </Button>
              </motion.div>
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
