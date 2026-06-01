"use client"

/**
 * Horizontal-scroll product rail. Used by the home screen for:
 *   - "Buy again from {store}" (last-order items)
 *   - "Featured at {store}" (owner-pinned)
 *   - "Bestsellers" (placeholder — sorted by sortOrder until real metric)
 *
 * Wraps the existing ProductCard so the add-to-cart morph + cart pill wiring
 * stay consistent with the grid views. Snap-scrolling + lazy fade-in of
 * cards as they enter view.
 */

import type { ProductPublicView } from "@workspace/api-client"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { motion } from "motion/react"

import { ProductCardCompact } from "@/components/product-card-compact"
import { cn } from "@workspace/ui/lib/utils"
import { tweens, useMotionPreset } from "@workspace/ui/lib/motion"

// DP-6 density pass: ~3 full cards visible on a 375-390px viewport with a
// sliver of a 4th as the scroll affordance. Matches Blinkit/Zepto's actual
// rail density — tighter than DP-1's 2.5-card layout, which was reading too
// editorial for a commerce surface.
const CARD_WIDTH_CLASS = "w-[7.25rem] sm:w-[8.5rem]"

interface ProductRailProps {
  /**
   * Section title. Pass `null` to suppress the header entirely (useful when
   * a wrapping rail — e.g., BuyAgainRail — has already rendered its own
   * header above the scroll container).
   */
  title: React.ReactNode | null
  subtitle?: React.ReactNode
  products: ProductPublicView[] | undefined
  storeId: string
  /** Snapshot store name passed to the cart on add — drives the cart pill subline. */
  storeName?: string
  isLoading?: boolean
  /** Cards per skeleton placeholder while loading. */
  skeletonCount?: number
  /** Optional empty-state node when products is empty (vs loading). */
  emptyState?: React.ReactNode
  className?: string
}

export function ProductRail({
  title,
  subtitle,
  products,
  storeId,
  storeName,
  isLoading = false,
  skeletonCount = 4,
  emptyState,
  className,
}: ProductRailProps) {
  const fade = useMotionPreset(tweens.fast)

  if (!isLoading && (!products || products.length === 0)) {
    if (!emptyState) return null
    return (
      <section className={cn("space-y-3", className)}>
        {title !== null ? <RailHeader title={title} subtitle={subtitle} /> : null}
        {emptyState}
      </section>
    )
  }

  return (
    <section className={cn("space-y-3", className)}>
      {title !== null ? (
        <RailHeader title={title} subtitle={subtitle} />
      ) : null}

      <div
        className="-mx-4 px-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollSnapType: "x mandatory" }}
      >
        <div className="flex gap-2">
          {isLoading
            ? Array.from({ length: skeletonCount }).map((_, i) => (
                <ProductSkeleton key={`skel-${i}`} />
              ))
            : products?.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...fade, delay: Math.min(i * 0.03, 0.18) }}
                  className={cn(CARD_WIDTH_CLASS, "shrink-0")}
                  style={{ scrollSnapAlign: "start" }}
                >
                  <ProductCardCompact
                    product={p}
                    storeId={storeId}
                    storeName={storeName}
                  />
                </motion.div>
              ))}
        </div>
      </div>
    </section>
  )
}

function RailHeader({
  title,
  subtitle,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <h3 className="text-[15px] font-semibold truncate">{title}</h3>
      {subtitle ? (
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      ) : null}
    </div>
  )
}

function ProductSkeleton() {
  return (
    <div className={cn(CARD_WIDTH_CLASS, "shrink-0 space-y-2")}>
      <Skeleton className="aspect-square w-full rounded-[var(--radius-md)]" />
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  )
}
