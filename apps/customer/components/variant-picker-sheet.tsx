"use client"

/**
 * IP-2 — Blinkit-style variant picker. Opens from a product card when
 * the product has multiple sizes. Each row binds to its OWN variantId
 * in the cart slice, so the customer can drop several sizes into the
 * cart from one sheet and each row's stepper reflects exactly that
 * variant's quantity.
 *
 * Cart-aware as of PR 2 #2: now that the cart slice keys by variantId,
 * the per-row stepper / count is independent. No more "variant B
 * overwrites variant A's price" — each variant is its own line item.
 */

import type { ProductPublicView, ProductPublicVariantView } from "@workspace/api-client"
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
} from "@workspace/ui/components/bottom-sheet"
import { ProgressiveImage } from "@workspace/ui/components/image"
import { Minus, Plus, ShoppingBag } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import { useCart } from "@/lib/cart"
import { formatPriceFromPaise } from "@/lib/format"
import { cn } from "@workspace/ui/lib/utils"
import { springs, tapScale, useMotionPreset } from "@workspace/ui/lib/motion"

interface VariantPickerSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: ProductPublicView
  storeId: string
  storeName?: string
}

export function VariantPickerSheet({
  open,
  onOpenChange,
  product,
  storeId,
  storeName,
}: VariantPickerSheetProps) {
  const available = product.variants.filter((v) => v.isAvailable)
  const unavailable = product.variants.filter((v) => !v.isAvailable)

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent>
        <BottomSheetHeader className="pb-2">
          <BottomSheetTitle className="text-base font-semibold leading-tight">
            {product.name}
          </BottomSheetTitle>
        </BottomSheetHeader>

        <div className="px-4 pb-6 space-y-2">
          {available.map((variant) => (
            <VariantRow
              key={variant.id}
              product={product}
              variant={variant}
              storeId={storeId}
              storeName={storeName}
            />
          ))}
          {unavailable.length > 0 ? (
            <div className="pt-2">
              <p className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase mb-2">
                Out of stock
              </p>
              <div className="space-y-2">
                {unavailable.map((variant) => (
                  <VariantRow
                    key={variant.id}
                    product={product}
                    variant={variant}
                    storeId={storeId}
                    storeName={storeName}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </BottomSheetContent>
    </BottomSheet>
  )
}

function VariantRow({
  product,
  variant,
  storeId,
  storeName,
}: {
  product: ProductPublicView
  variant: ProductPublicVariantView
  storeId: string
  storeName?: string
}) {
  const cart = useCart()
  // Cart-aware: count is the quantity of THIS specific variant, not
  // the aggregate across the whole product. Each variant has its own
  // line item in the cart now.
  const inCart = cart.variantCount(variant.id)
  const tap = useMotionPreset(springs.tap)

  const hasDiscount = variant.effectivePricePaise < variant.pricePaise
  const oos = !variant.isAvailable

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-md)] border border-border-soft bg-card p-2.5",
        oos && "opacity-60",
      )}
    >
      <ProgressiveImage
        src={variant.imageUrl}
        alt={variant.name}
        aspect="aspect-square"
        rounded="rounded-[var(--radius-sm)]"
        className="w-12 shrink-0"
        fallback={<ShoppingBag className="size-4 text-muted-foreground" />}
      />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold leading-tight truncate">
          {variant.name}
        </p>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className="tabular-nums text-[13px] font-bold text-foreground">
            {formatPriceFromPaise(variant.effectivePricePaise)}
          </span>
          {hasDiscount ? (
            <span className="tabular-nums text-[11px] text-muted-foreground line-through">
              {formatPriceFromPaise(variant.pricePaise)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="shrink-0">
        {oos ? (
          <button
            type="button"
            disabled
            className="inline-flex items-center justify-center h-9 px-4 rounded-full text-[12px] font-bold text-muted-foreground border border-border bg-surface-soft"
          >
            Notify
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
                className="flex items-center justify-between h-9 rounded-full overflow-hidden bg-card border border-primary text-primary min-w-[5.25rem]"
              >
                <motion.button
                  type="button"
                  onClick={() => cart.dec(variant.id)}
                  whileTap={{ scale: tapScale }}
                  transition={tap}
                  aria-label={`Remove one ${variant.name}`}
                  className="h-9 px-2.5 inline-flex items-center justify-center"
                >
                  <Minus className="size-3.5" strokeWidth={2.5} />
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
                  onClick={() => cart.incVariant(variant.id)}
                  whileTap={{ scale: tapScale }}
                  transition={tap}
                  aria-label={`Add one more ${variant.name}`}
                  className="h-9 px-2.5 inline-flex items-center justify-center"
                >
                  <Plus className="size-3.5" strokeWidth={2.5} />
                </motion.button>
              </motion.div>
            ) : (
              <motion.button
                key="add"
                type="button"
                onClick={() => cart.inc(product, variant, storeId, storeName)}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                whileTap={{ scale: tapScale }}
                transition={tap}
                aria-label={`Add ${variant.name} to cart`}
                className="inline-flex items-center justify-center h-9 px-5 rounded-full bg-card border border-primary text-primary font-bold text-[12px] tracking-wide hover:bg-primary/5 transition-colors"
              >
                Add
              </motion.button>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
