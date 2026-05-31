"use client"

/**
 * Home search bar — a "fake" input that navigates to /search on focus/tap.
 * Real search lives at /search with autocomplete + recent + categories;
 * on home we just render the affordance so the user knows they can search.
 *
 * Subtle visual: tap-down scale-down using DP-0 tap spring.
 */

import { Search } from "lucide-react"
import { motion } from "motion/react"
import { useRouter } from "next/navigation"

import { cn } from "@workspace/ui/lib/utils"
import { springs, tapScale, useMotionPreset } from "@workspace/ui/lib/motion"

interface HomeSearchBarProps {
  /** Cycled hint text — e.g., "milk, atta, eggs..." */
  placeholder?: string
  className?: string
}

export function HomeSearchBar({
  placeholder = "Search for milk, atta, eggs…",
  className,
}: HomeSearchBarProps) {
  const router = useRouter()
  const tap = useMotionPreset(springs.tap)

  return (
    <motion.button
      type="button"
      onClick={() => router.push("/search")}
      whileTap={{ scale: tapScale }}
      transition={tap}
      className={cn(
        "flex w-full items-center gap-3 h-12 rounded-[var(--radius-md)]",
        "bg-surface-soft border border-border px-4",
        "text-left text-sm text-muted-foreground",
        "hover:bg-surface-strong transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      aria-label="Search for products and stores"
    >
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate">{placeholder}</span>
    </motion.button>
  )
}
