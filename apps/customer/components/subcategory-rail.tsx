"use client"

import type { SubcategoryPublicView } from "@workspace/api-client"

/**
 * Left rail on the category page (Blinkit image #4). A full-height, fixed
 * (sticky), independently-scrollable column of the store's subcategories
 * within the current admin Category, plus an "All" pseudo-entry. Selecting
 * one filters the product pane on the right.
 *
 * `top-14` / `h-[calc(100svh-3.5rem)]` are paired to the page header's `h-14`
 * (56px) so the rail spans the entire viewport below the header regardless of
 * how many products the pane renders.
 */
export function SubcategoryRail({
  subcategories,
  selected,
  onSelect,
}: {
  subcategories: SubcategoryPublicView[]
  selected: string | null
  onSelect: (subcategoryId: string | null) => void
}) {
  return (
    <aside
      aria-label="Subcategories"
      className="sticky top-14 h-[calc(100svh-3.5rem)] w-20 sm:w-28 md:w-48 lg:w-56 shrink-0 overflow-y-auto border-r border-border/60 bg-surface-soft/40"
    >
      <ul className="py-1">
        <RailItem label="All" active={selected === null} onClick={() => onSelect(null)} />
        {subcategories.map((sub) => (
          <RailItem
            key={sub.id}
            label={sub.name}
            count={sub.productCount}
            active={selected === sub.id}
            onClick={() => onSelect(sub.id)}
          />
        ))}
      </ul>
    </aside>
  )
}

function RailItem({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count?: number
  active: boolean
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "true" : undefined}
        className={
          "relative w-full text-left px-2.5 sm:px-3 py-3 text-xs sm:text-sm leading-tight transition-colors " +
          (active
            ? "bg-background font-semibold text-foreground"
            : "text-muted-foreground hover:bg-background/60 hover:text-foreground")
        }
      >
        {active && (
          <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-primary" />
        )}
        <span className="line-clamp-2">{label}</span>
        {count !== undefined && count > 0 && (
          <span className="block mt-0.5 text-[10px] text-muted-foreground tabular-nums">
            {count}
          </span>
        )}
      </button>
    </li>
  )
}
