"use client"

import type { CategorySection as CategorySectionData } from "@workspace/api-client"
import { ChevronRight } from "lucide-react"
import Link from "next/link"
import { ProductCard } from "@/components/product-card"

/**
 * A store-home product section grouped by admin Category. Shows a preview
 * (the top products the backend returned) with a "See all" affordance when
 * the category has more than the preview — tapping the header or "See all"
 * lands on the dual-pane category page.
 */
export function CategorySection({
  storeId,
  section,
}: {
  storeId: string
  section: CategorySectionData
}) {
  if (section.products.length === 0) return null

  const href = `/stores/${storeId}/categories/${section.category.id}`

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <Link href={href} className="group inline-flex items-center gap-1 min-w-0">
          <h2 className="text-base font-semibold truncate">{section.category.name}</h2>
          <ChevronRight className="size-4 text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </Link>
        {section.hasMore && (
          <Link
            href={href}
            className="text-sm font-medium text-primary hover:text-primary-active shrink-0 tabular-nums"
          >
            See all {section.totalCount}
          </Link>
        )}
      </div>
      {/* Horizontal scroll row so each category stays one swipe tall instead
          of pushing the page down. Edge-bleed (-mx + px) lets cards scroll to
          the screen edge on mobile. Fixed narrow widths keep the cards small. */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {section.products.map((p) => (
          <div key={p.id} className="w-36 sm:w-40 shrink-0 snap-start">
            <ProductCard product={p} storeId={storeId} />
          </div>
        ))}
      </div>
    </section>
  )
}
