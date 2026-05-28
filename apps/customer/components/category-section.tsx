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
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {section.products.map((p) => (
          <ProductCard key={p.id} product={p} storeId={storeId} />
        ))}
      </div>
    </section>
  )
}
