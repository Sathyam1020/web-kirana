"use client"

/**
 * "Buy again from {store}" — the retention workhorse on the home screen.
 *
 * Layout:
 *   1. Primary Rausch pill "↻ Reorder last order — N items — ₹total"
 *      tappable → opens the BuyAgainSheet (review + bulk-reorder + per-item
 *      re-add). The pill itself never bulk-adds directly so the customer
 *      always gets a chance to review before the cart is mutated.
 *   2. Below: horizontal scroll of compact product tiles for one-tap
 *      individual re-adds.
 *
 * Hidden entirely when there's no order history at the primary store —
 * a brand-new customer doesn't need to see an empty rail.
 *
 * Data: consumes /v1/orders?storeId=primary&limit=20 (DP-1 backend addition)
 * and reconstructs minimal ProductPublicView shapes from the order item
 * snapshots so the cart-add flow doesn't require a second products fetch.
 */

import type {
  OrderItemView,
  OrderView,
  ProductPublicView,
} from "@workspace/api-client"
import { RefreshCw } from "lucide-react"
import { motion } from "motion/react"

import { BuyAgainSheet } from "@/components/buy-again-sheet"
import { ProductRail } from "@/components/product-rail"
import { formatPriceFromPaise } from "@/lib/format"
import { cn } from "@workspace/ui/lib/utils"
import { springs, tapScale, useMotionPreset } from "@workspace/ui/lib/motion"
import { useState } from "react"

interface BuyAgainRailProps {
  storeId: string
  storeName: string
  /** Last delivered/in-progress order from this store, if any. */
  lastOrder: OrderView | null
  /** Aggregated buyable products from recent orders at this store. */
  recentProducts: ProductPublicView[]
  isLoading: boolean
}

/**
 * Type-guard: items whose underlying product was deleted have productId=null
 * and can't be re-added to cart from a snapshot alone.
 */
type ReorderableItem = OrderItemView & { productId: string }
function isReorderable(i: OrderItemView): i is ReorderableItem {
  return i.productId !== null
}

export function BuyAgainRail({
  storeId,
  storeName,
  lastOrder,
  recentProducts,
  isLoading,
}: BuyAgainRailProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const tap = useMotionPreset(springs.tap)

  // Hide the whole section while loading the first time (no skeleton — we
  // don't want a "Buy again" placeholder for users who have never ordered;
  // it would feel like a broken promise). Show only when we know there's
  // history to surface.
  if (isLoading) return null
  if (lastOrder === null || recentProducts.length === 0) return null

  const reorderableItems = lastOrder.items.filter(isReorderable)
  const reorderable = reorderableItems.length > 0
  const itemCount = reorderableItems.length
  const total = lastOrder.totalPaise

  return (
    <section aria-label={`Buy again from ${storeName}`} className="space-y-3">
      <div className="flex items-end justify-between">
        <h3 className="text-base font-semibold">
          Buy again from <span className="text-primary">{storeName}</span>
        </h3>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          See all
        </button>
      </div>

      {/* Primary reorder pill — opens the sheet (does not bulk-add). */}
      {reorderable ? (
        <motion.button
          type="button"
          onClick={() => setSheetOpen(true)}
          whileTap={{ scale: tapScale }}
          transition={tap}
          className={cn(
            "flex w-full items-center justify-between gap-3 px-4 py-3",
            "rounded-[var(--radius-md)] bg-primary text-primary-foreground shadow-card",
            "text-left transition-colors hover:bg-primary-active",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          )}
        >
          <span className="flex items-center gap-3 min-w-0">
            <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary-foreground/15 shrink-0">
              <RefreshCw className="size-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-tight">
                Reorder last order
              </span>
              <span className="block text-xs text-primary-foreground/85 mt-0.5 truncate">
                {itemCount} item{itemCount === 1 ? "" : "s"} ·{" "}
                <span className="tabular-nums">{formatPriceFromPaise(total)}</span>
              </span>
            </span>
          </span>
          <span className="text-xs font-medium shrink-0">Review</span>
        </motion.button>
      ) : null}

      {/* Compact tiles for one-tap individual re-adds */}
      <ProductRail
        title={null}
        products={recentProducts}
        storeId={storeId}
        storeName={storeName}
        skeletonCount={4}
      />

      <BuyAgainSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        order={lastOrder}
        storeId={storeId}
        storeName={storeName}
      />
    </section>
  )
}

// Re-export so the parent home page can open the sheet from elsewhere.
export { BuyAgainSheet }
