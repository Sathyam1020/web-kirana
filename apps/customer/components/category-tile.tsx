"use client"

import { SafeImage } from "@workspace/ui/components/safe-image"
import { motion } from "motion/react"
import Link from "next/link"

import { tweens, useMotionPreset } from "@workspace/ui/lib/motion"

/**
 * A single tappable category tile in the department grid. Routes to the
 * dual-pane category page. iconUrl is usually null today (admins haven't
 * uploaded category art yet), so we fall back to a coloured monogram derived
 * from the category name — stable per name, so the same category always gets
 * the same colour.
 */
export function CategoryTile({
  storeId,
  category,
}: {
  storeId: string
  category: { id: string; name: string; iconUrl: string | null }
}) {
  const hover = useMotionPreset(tweens.fast)
  return (
    <motion.div whileHover={{ y: -2 }} transition={hover}>
      <Link
        href={`/stores/${storeId}/categories/${category.id}`}
        className="flex flex-col items-center gap-2 group"
      >
        <div className="aspect-square w-full rounded-[var(--radius-lg)] bg-surface-soft border border-border overflow-hidden flex items-center justify-center group-hover:shadow-md transition-shadow">
          {category.iconUrl ? (
            <SafeImage
              src={category.iconUrl}
              alt={category.name}
              fallback={<Monogram name={category.name} />}
            />
          ) : (
            <Monogram name={category.name} />
          )}
        </div>
        <span className="text-xs font-medium text-center line-clamp-2 leading-tight">
          {category.name}
        </span>
      </Link>
    </motion.div>
  )
}

const MONOGRAM_TONES = [
  "bg-primary/10 text-primary",
  "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  "bg-rose-500/10 text-rose-600 dark:text-rose-400",
]

function Monogram({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join("")
    .toUpperCase()
  // Stable colour from a simple char-sum hash so re-renders don't flicker.
  let sum = 0
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i)
  const tone = MONOGRAM_TONES[sum % MONOGRAM_TONES.length]
  return (
    <div className={`size-full flex items-center justify-center text-lg font-semibold ${tone}`}>
      {initials}
    </div>
  )
}
