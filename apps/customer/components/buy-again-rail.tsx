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

  return (
    <section aria-label="Buy again" className="space-y-3">
      {/* Section header — title left, single Reorder chip right. Tap
          opens the BuyAgainSheet (which shows item list + Reorder all
          CTA). Dropped the separate "See all" link — it did the same
          thing, so two affordances was redundant. */}
      <div className="flex items-end justify-between gap-2">
        <h3 className="text-[15px] font-semibold min-w-0 truncate">
          Buy again
        </h3>
        {reorderable ? (
          <motion.button
            type="button"
            onClick={() => setSheetOpen(true)}
            whileTap={{ scale: tapScale }}
            transition={tap}
            className={cn(
              "inline-flex items-center gap-1.5 h-7 px-3 rounded-full shrink-0",
              "border border-primary text-primary text-[11px] font-semibold tracking-wide",
              "bg-card hover:bg-primary/5 transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
            aria-label="Reorder your previous order"
          >
            <RefreshCw className="size-3" strokeWidth={2.5} aria-hidden />
            Reorder previous order
          </motion.button>
        ) : null}
      </div>

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
