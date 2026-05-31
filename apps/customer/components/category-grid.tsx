"use client"

/**
 * Home "Shop by category at {store}" — 4-column grid (not horizontally
 * scrollable). Shows up to 8 categories the primary store actually
 * carries, surfaces a "See all" link to the full store page when there
 * are more.
 *
 * Reuses the existing CategoryTile so its drilldown routing
 * (/stores/:id/categories/:categoryId) stays consistent across surfaces.
 */

import type { StoreDetailDepartmentView } from "@workspace/api-client"
import { Skeleton } from "@workspace/ui/components/skeleton"
import Link from "next/link"

import { CategoryTile } from "@/components/category-tile"
import { EmptyCategoryIllustration } from "@/components/illustrations"

interface CategoryGridProps {
  storeId: string
  storeName: string
  departments: StoreDetailDepartmentView[] | undefined
  isLoading: boolean
}

// 2 rows × 4 cols = max 8 categories shown before "See all" appears.
const VISIBLE = 8

export function CategoryGrid({
  storeId,
  storeName,
  departments,
  isLoading,
}: CategoryGridProps) {
  const categories = (departments ?? [])
    .flatMap((d) => d.categories)
    .filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i)

  if (!isLoading && categories.length === 0) {
    return (
      <section className="space-y-3">
        <RailHeader storeName={storeName} />
        <div className="rounded-[var(--radius-md)] border border-border bg-card py-8 px-4 flex flex-col items-center gap-3 text-center">
          <EmptyCategoryIllustration className="w-32" />
          <p className="text-sm text-muted-foreground">
            {storeName} hasn&rsquo;t added any categories yet.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section aria-label={`Shop by category at ${storeName}`} className="space-y-3">
      <RailHeader
        storeName={storeName}
        seeAllHref={
          !isLoading && categories.length > VISIBLE ? `/stores/${storeId}` : undefined
        }
      />

      <div className="grid grid-cols-4 gap-x-3 gap-y-4">
        {isLoading
          ? Array.from({ length: VISIBLE }).map((_, i) => (
              <SkeletonTile key={`skel-${i}`} />
            ))
          : categories.slice(0, VISIBLE).map((c) => (
              <CategoryTile key={c.id} storeId={storeId} category={c} />
            ))}
      </div>
    </section>
  )
}

function RailHeader({
  storeName,
  seeAllHref,
}: {
  storeName: string
  seeAllHref?: string
}) {
  return (
    <div className="flex items-end justify-between">
      <h3 className="text-base font-semibold">
        Shop by category at <span className="text-primary">{storeName}</span>
      </h3>
      {seeAllHref ? (
        <Link
          href={seeAllHref}
          className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          See all
        </Link>
      ) : null}
    </div>
  )
}

function SkeletonTile() {
  return (
    <div className="space-y-2">
      <Skeleton className="aspect-square w-full rounded-[var(--radius-lg)]" />
      <Skeleton className="h-3 w-3/4 mx-auto" />
    </div>
  )
}
