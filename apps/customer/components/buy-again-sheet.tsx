"use client"

/**
 * Buy-again review sheet — opens from the home's "Reorder last order" pill.
 *
 * Two ways to act on the last order:
 *   1. **Reorder all** (the prominent, visually-distinct primary CTA at the
 *      top of the sheet body). Bulk-adds every still-buyable item from the
 *      order to the cart. If the cart already has items from a different
 *      store, falls through to the existing cart-switch confirm.
 *   2. Per-item compact tiles in a vertical list below — each has its own
 *      `+` / stepper for incremental re-adds.
 *
 * Empty state: when the order's items are all deleted/unavailable (productId
 * went null), the Reorder All button hides and we show a small explainer.
 */

import type {
  OrderItemView,
  OrderView,
  ProductPublicView,
  Unit,
} from "@workspace/api-client"
import { UNIT_LABELS } from "@workspace/api-client"
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
} from "@workspace/ui/components/bottom-sheet"
import { ProgressiveImage } from "@workspace/ui/components/image"
import { toast } from "@workspace/ui/components/toaster"
import { Minus, Plus, RefreshCw, ShoppingBag } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useState } from "react"

import { NoOrdersIllustration } from "@/components/illustrations"
import { useCart } from "@/lib/cart"
import { formatPriceFromPaise } from "@/lib/format"
import { cn } from "@workspace/ui/lib/utils"
import { springs, tapScale, useMotionPreset } from "@workspace/ui/lib/motion"

interface BuyAgainSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Last order to review. Sheet renders empty-state when null. */
  order: OrderView | null
  storeId: string
  storeName: string
}

type ReorderableItem = OrderItemView & { productId: string }
function isReorderable(i: OrderItemView): i is ReorderableItem {
  return i.productId !== null
}

/**
 * Reconstruct a minimal ProductPublicView from an order item snapshot so
 * the cart-add flow doesn't need a second products fetch. Cart cares
 * about: id, name, image, unit, pricePaise, effectivePricePaise.
 */
function itemToProduct(
  item: ReorderableItem,
  storeId: string,
): ProductPublicView {
  return {
    id: item.productId,
    storeId,
    subcategoryId: "",
    subcategoryName: "",
    categoryId: "",
    categoryName: "",
    departmentId: "",
    departmentName: "",
    name: item.nameSnapshot,
    description: null,
    pricePaise: item.unitPricePaiseSnapshot,
    effectivePricePaise: item.unitPricePaiseSnapshot,
    discountType: null,
    discountValue: null,
    discountValidUntil: null,
    unit: item.unitSnapshot,
    imageUrl: item.imageUrlSnapshot,
    isAvailable: true,
    isFeatured: false,
    featuredOrder: null,
  }
}

export function BuyAgainSheet({
  open,
  onOpenChange,
  order,
  storeId,
  storeName,
}: BuyAgainSheetProps) {
  const reorderable = order ? order.items.filter(isReorderable) : []
  const droppedCount = order ? order.items.length - reorderable.length : 0

  const cart = useCart()
  const tap = useMotionPreset(springs.tap)
  const [bulkAdding, setBulkAdding] = useState(false)

  // Bulk re-add: walks the order items and calls cart.inc for each. The
  // existing single-store guard in the cart will surface the switch dialog
  // on the first item if the cart is currently from a different store; the
  // user confirms once and the rest queue naturally on subsequent ticks.
  function handleReorderAll() {
    if (reorderable.length === 0) return
    setBulkAdding(true)
    let addedItems = 0
    let addedUnits = 0
    for (const item of reorderable) {
      const product = itemToProduct(item, storeId)
      for (let q = 0; q < item.quantity; q++) {
        cart.inc(product, storeId, storeName)
      }
      addedItems += 1
      addedUnits += item.quantity
    }
    // The cart switch guard sets pendingSwitch instead of adding when stores
    // don't match — addedUnits reflects intent, not success. The cart store's
    // own confirm flow is the source of truth. Show a "preparing" toast that
    // doesn't lie if it gets cancelled.
    setTimeout(() => {
      setBulkAdding(false)
      onOpenChange(false)
      toast.success(`Re-added ${addedItems} item${addedItems === 1 ? "" : "s"}`, {
        description: `${addedUnits} unit${addedUnits === 1 ? "" : "s"} from your last order at ${storeName}`,
      })
    }, 150)
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent>
        <BottomSheetHeader>
          <BottomSheetTitle>Your last order at {storeName}</BottomSheetTitle>
          {order ? (
            <p className="text-xs text-muted-foreground">
              {new Date(order.placedAt).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
              })}{" "}
              · {order.items.length} item{order.items.length === 1 ? "" : "s"} ·{" "}
              <span className="tabular-nums">
                {formatPriceFromPaise(order.totalPaise)}
              </span>
            </p>
          ) : null}
        </BottomSheetHeader>

        {order === null || reorderable.length === 0 ? (
          <EmptyBody storeName={storeName} />
        ) : (
          <div className="flex flex-col min-h-0 overflow-hidden">
            {/* Distinguishable primary action — Rausch, full-width, larger
                hit target than the per-item +. Stays visible above the scroll. */}
            <div className="px-4 pb-3">
              <motion.button
                type="button"
                onClick={handleReorderAll}
                whileTap={{ scale: tapScale }}
                transition={tap}
                disabled={bulkAdding}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-4 py-3.5",
                  "rounded-[var(--radius-md)] bg-primary text-primary-foreground shadow-card",
                  "hover:bg-primary-active transition-colors",
                  "disabled:opacity-70 disabled:cursor-not-allowed",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                )}
              >
                <span className="flex items-center gap-3">
                  <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary-foreground/15">
                    <RefreshCw className="size-4" aria-hidden />
                  </span>
                  <span className="text-left">
                    <span className="block text-sm font-semibold leading-tight">
                      Reorder all
                    </span>
                    <span className="block text-xs text-primary-foreground/85 mt-0.5">
                      {reorderable.length} item
                      {reorderable.length === 1 ? "" : "s"} ·{" "}
                      <span className="tabular-nums">
                        {formatPriceFromPaise(order.totalPaise)}
                      </span>
                    </span>
                  </span>
                </span>
                <span className="text-sm font-semibold">Add to cart</span>
              </motion.button>
              {droppedCount > 0 ? (
                <p className="mt-2 text-[11px] text-warning-foreground">
                  {droppedCount} item{droppedCount === 1 ? " is" : "s are"} no
                  longer available and won&rsquo;t be re-added.
                </p>
              ) : null}
            </div>

            <div className="px-4 pb-4 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Or add one at a time
            </div>

            <ul className="flex-1 overflow-y-auto divide-y divide-border-soft px-2 pb-6">
              {reorderable.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  storeId={storeId}
                  storeName={storeName}
                />
              ))}
            </ul>
          </div>
        )}
      </BottomSheetContent>
    </BottomSheet>
  )
}

function ItemRow({
  item,
  storeId,
  storeName,
}: {
  item: ReorderableItem
  storeId: string
  storeName: string
}) {
  const cart = useCart()
  const product = itemToProduct(item, storeId)
  const inCart = cart.itemCount(item.productId)
  const tap = useMotionPreset(springs.tap)

  return (
    <li className="px-2 py-2.5 flex items-center gap-3">
      <ProgressiveImage
        src={item.imageUrlSnapshot}
        alt={item.nameSnapshot}
        aspect="aspect-square"
        rounded="rounded-[var(--radius-md)]"
        className="w-14 shrink-0"
        fallback={<ShoppingBag className="size-5 text-muted-foreground" />}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight line-clamp-1">
          {item.nameSnapshot}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {unitLabel(item.unitSnapshot)}
          {" · "}
          <span className="tabular-nums">
            {formatPriceFromPaise(item.unitPricePaiseSnapshot)}
          </span>
          {" · "}
          <span>last: {item.quantity}</span>
        </p>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {inCart > 0 ? (
          <motion.div
            key="stepper"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={tap}
            className="flex items-center h-8 rounded-full bg-primary text-primary-foreground shadow-card overflow-hidden shrink-0"
          >
            <motion.button
              type="button"
              onClick={() => cart.dec(item.productId)}
              whileTap={{ scale: tapScale }}
              aria-label={`Remove one ${item.nameSnapshot}`}
              className="size-8 inline-flex items-center justify-center"
            >
              <Minus className="size-3.5" />
            </motion.button>
            <motion.span
              key={inCart}
              initial={{ y: -3, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 3, opacity: 0 }}
              transition={tap}
              className="tabular-nums text-xs font-semibold min-w-[1.25rem] text-center"
            >
              {inCart}
            </motion.span>
            <motion.button
              type="button"
              onClick={() => cart.inc(product, storeId, storeName)}
              whileTap={{ scale: tapScale }}
              aria-label={`Add one more ${item.nameSnapshot}`}
              className="size-8 inline-flex items-center justify-center"
            >
              <Plus className="size-3.5" />
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
            aria-label={`Add ${item.nameSnapshot}`}
            className="inline-flex h-8 px-3 items-center gap-1 rounded-full border border-primary text-primary text-xs font-semibold hover:bg-primary/5 transition-colors shrink-0"
          >
            <Plus className="size-3.5" strokeWidth={3} />
            Add
          </motion.button>
        )}
      </AnimatePresence>
    </li>
  )
}

function EmptyBody({ storeName }: { storeName: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 pb-8 pt-2 text-center">
      <NoOrdersIllustration className="w-40" />
      <h4 className="text-sm font-semibold">No previous orders to reorder</h4>
      <p className="text-xs text-muted-foreground max-w-xs">
        The items from your last order at {storeName} are no longer available.
        Browse the store to pick something fresh.
      </p>
    </div>
  )
}

function unitLabel(u: Unit): string {
  return `Per ${UNIT_LABELS[u]}`
}
