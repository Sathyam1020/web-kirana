"use client"

/**
 * Home-flavoured department list — replaces the previous flat 4-col
 * CategoryGrid. Matches the /stores/[id] DepartmentGrid pattern (department
 * header → grid of category tiles) but locks the grid at 4 columns so it
 * looks right inside the home's narrow max-w-md column at every viewport.
 *
 * Empty / loading handled by the home page; this component just renders
 * the layout when departments exist.
 */

import type { StoreDetailDepartmentView } from "@workspace/api-client"
import { Skeleton } from "@workspace/ui/components/skeleton"
import Link from "next/link"

import { CategoryTile } from "@/components/category-tile"
import { EmptyCategoryIllustration } from "@/components/illustrations"

interface DepartmentSectionsProps {
  storeId: string
  storeName: string
  departments: StoreDetailDepartmentView[] | undefined
  isLoading: boolean
}

export function DepartmentSections({
  storeId,
  storeName,
  departments,
  isLoading,
}: DepartmentSectionsProps) {
  const hasContent = !isLoading && (departments?.length ?? 0) > 0

  return (
    <section aria-label={`Shop by category at ${storeName}`} className="space-y-4">
      <div className="flex items-end justify-between">
        <h3 className="text-base font-semibold">
          Shop by category at <span className="text-primary">{storeName}</span>
        </h3>
        {hasContent ? (
          <Link
            href={`/stores/${storeId}`}
            className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            See all
          </Link>
        ) : null}
      </div>

      {isLoading ? (
        <DepartmentSkeleton />
      ) : !departments || departments.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-border bg-card py-8 px-4 flex flex-col items-center gap-3 text-center">
          <EmptyCategoryIllustration className="w-32" />
          <p className="text-sm text-muted-foreground">
            {storeName} hasn&rsquo;t added any categories yet.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {departments.map((dept) => (
            <div key={dept.id} className="space-y-2.5">
              <h4 className="text-[13px] font-semibold text-muted-foreground">
                {dept.name}
              </h4>
              <div className="grid grid-cols-4 gap-x-3 gap-y-4">
                {dept.categories.map((cat) => (
                  <CategoryTile
                    key={cat.id}
                    storeId={storeId}
                    category={cat}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function DepartmentSkeleton() {
  return (
    <div className="space-y-5">
      {Array.from({ length: 2 }).map((_, d) => (
        <div key={d} className="space-y-2.5">
          <Skeleton className="h-4 w-32" />
          <div className="grid grid-cols-4 gap-x-3 gap-y-4">
            {Array.from({ length: 4 }).map((_, c) => (
              <div key={c} className="space-y-2">
                <Skeleton className="aspect-square w-full rounded-[var(--radius-lg)]" />
                <Skeleton className="h-3 w-3/4 mx-auto" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
