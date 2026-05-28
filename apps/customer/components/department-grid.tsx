"use client"

import type { StoreDetailDepartmentView } from "@workspace/api-client"
import { CategoryTile } from "@/components/category-tile"

/**
 * Blinkit-style department blocks: each department is a header followed by a
 * grid of its category tiles. Departments with no categories the store carries
 * are filtered out upstream (the backend only returns departments that have at
 * least one stocked category), so we render whatever arrives.
 */
export function DepartmentGrid({
  storeId,
  departments,
}: {
  storeId: string
  departments: StoreDetailDepartmentView[]
}) {
  if (departments.length === 0) return null

  return (
    <div className="space-y-7">
      {departments.map((dept) => (
        <section key={dept.id}>
          <h2 className="text-base font-semibold mb-3">{dept.name}</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 sm:gap-4">
            {dept.categories.map((cat) => (
              <CategoryTile key={cat.id} storeId={storeId} category={cat} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
