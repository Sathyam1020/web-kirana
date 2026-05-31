"use client"

/**
 * Choose-a-store bottom sheet. Opened from:
 *   - the "Change" link on the primary store hero
 *   - the "See all" link on the other-stores rail
 *
 * Surfaces every nearby store from the existing /v1/stores/nearby query (the
 * same data the home page already loaded), with quick filter chips and a
 * search field that filters in-memory. Picking a store calls onPick — the
 * parent handles the actual selection + cart-clear confirm flow.
 */

import type { StoreNearbyHit } from "@workspace/api-client"
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
} from "@workspace/ui/components/bottom-sheet"
import { ProgressiveImage } from "@workspace/ui/components/image"
import { Search, Star, Store as StoreIcon, X } from "lucide-react"
import { motion } from "motion/react"
import { useMemo, useState } from "react"

import { cn } from "@workspace/ui/lib/utils"
import { springs, tapScale, useMotionPreset } from "@workspace/ui/lib/motion"
import { formatDistance, formatEta } from "@/lib/format"

type Filter = "all" | "open" | "fastest" | "lowest-min"

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "open", label: "Open now" },
  { id: "fastest", label: "Fastest delivery" },
  { id: "lowest-min", label: "Lowest min" },
]

interface ChooseStoreSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stores: StoreNearbyHit[]
  selectedStoreId: string | null
  onPick: (storeId: string) => void
}

export function ChooseStoreSheet({
  open,
  onOpenChange,
  stores,
  selectedStoreId,
  onPick,
}: ChooseStoreSheetProps) {
  const [filter, setFilter] = useState<Filter>("all")
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = stores
    if (q.length > 0) {
      list = list.filter((s) => s.name.toLowerCase().includes(q))
    }
    if (filter === "open") {
      list = list.filter((s) => s.isOpen)
    } else if (filter === "fastest") {
      list = [...list].sort((a, b) => a.distanceMeters - b.distanceMeters)
    } else if (filter === "lowest-min") {
      list = [...list].sort(
        (a, b) => (a.minOrderPaise ?? 0) - (b.minOrderPaise ?? 0),
      )
    }
    return list
  }, [stores, filter, search])

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent>
        <BottomSheetHeader>
          <BottomSheetTitle>Choose a store</BottomSheetTitle>
        </BottomSheetHeader>

        <div className="px-4 pb-3 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
              aria-hidden
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search nearby stores by name…"
              className={cn(
                "w-full h-11 pl-9 pr-9 rounded-[var(--radius-md)]",
                "bg-surface-soft border border-border text-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
              aria-label="Search nearby stores"
            />
            {search.length > 0 ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-surface-strong"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>

          {/* Filter chips */}
          <div
            className="-mx-4 px-4 overflow-x-auto scrollbar-thin"
            role="tablist"
            aria-label="Filter stores"
          >
            <div className="flex gap-2">
              {FILTERS.map((f) => (
                <FilterChip
                  key={f.id}
                  active={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  label={f.label}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="overflow-y-auto pb-6">
          {filtered.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                {search
                  ? "No stores match that search."
                  : "No stores in this filter."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border-soft">
              {filtered.map((store) => (
                <StoreRow
                  key={store.id}
                  store={store}
                  selected={store.id === selectedStoreId}
                  onPick={() => onPick(store.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </BottomSheetContent>
    </BottomSheet>
  )
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  const tap = useMotionPreset(springs.tap)
  return (
    <motion.button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      whileTap={{ scale: tapScale }}
      transition={tap}
      className={cn(
        "shrink-0 inline-flex items-center h-8 px-3.5 rounded-full text-xs font-medium",
        "border transition-colors",
        active
          ? "bg-foreground text-background border-foreground"
          : "bg-card text-foreground border-border hover:border-border-strong",
      )}
    >
      {label}
    </motion.button>
  )
}

function StoreRow({
  store,
  selected,
  onPick,
}: {
  store: StoreNearbyHit
  selected: boolean
  onPick: () => void
}) {
  const tap = useMotionPreset(springs.tap)
  return (
    <li>
      <motion.button
        type="button"
        onClick={onPick}
        whileTap={{ scale: 0.99 }}
        transition={tap}
        className={cn(
          "flex items-center gap-3 w-full text-left px-6 py-3",
          "hover:bg-surface-soft transition-colors",
          "focus-visible:outline-none focus-visible:bg-surface-soft",
        )}
      >
        <ProgressiveImage
          src={store.imageUrl}
          alt={store.name}
          aspect="aspect-square"
          className="w-14 shrink-0"
          fallback={<StoreIcon className="size-6" />}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm truncate">{store.name}</p>
            {selected ? (
              <Star
                className="size-3.5 shrink-0 text-primary fill-primary"
                aria-label="Currently selected"
              />
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
            <span className="tabular-nums">
              {formatDistance(store.distanceMeters)}
            </span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{formatEta(store.distanceMeters)}</span>
            <span aria-hidden>·</span>
            <span
              className={cn(
                "font-medium",
                store.isOpen ? "text-success" : "text-warning-foreground",
              )}
            >
              {store.isOpen ? "Open" : "Closed"}
            </span>
          </p>
          {store.minOrderPaise > 0 ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              Min ₹{(store.minOrderPaise / 100).toFixed(0)}
            </p>
          ) : null}
        </div>
      </motion.button>
    </li>
  )
}
