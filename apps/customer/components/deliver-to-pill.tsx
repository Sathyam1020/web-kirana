"use client"

/**
 * Header "Deliver to" pill — Blinkit-style address selector.
 *
 * Stacks the small "Deliver to" label above a larger primary address line
 * with a chevron, all left-aligned. Distinct from the generic `LocationPill`
 * which is a single-line action button used elsewhere.
 *
 * In DP-1 this is a layout placeholder: the chevron is rendered but the tap
 * does nothing (or opens the existing geolocation prompt). IP-4 wires the
 * real deliver-to picker bottom sheet (saved addresses + add new + current).
 */

import { ChevronDown, MapPin } from "lucide-react"
import { motion } from "motion/react"

import { cn } from "@workspace/ui/lib/utils"
import { springs, tapScale, useMotionPreset } from "@workspace/ui/lib/motion"

interface DeliverToPillProps {
  label: string
  status: "idle" | "requesting" | "ready" | "denied"
  onClick: () => void
  className?: string
}

export function DeliverToPill({
  label,
  status,
  onClick,
  className,
}: DeliverToPillProps) {
  const tap = useMotionPreset(springs.tap)
  const subline =
    status === "requesting"
      ? "Locating you…"
      : status === "denied"
        ? "Tap to set"
        : status === "ready"
          ? "Tap to change"
          : "Tap to enable"

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: tapScale }}
      transition={tap}
      className={cn(
        "flex items-center gap-2 text-left min-w-0 max-w-full",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md",
        className,
      )}
    >
      <MapPin className="size-5 shrink-0 text-primary" aria-hidden />
      <span className="flex flex-col min-w-0">
        <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground leading-none">
          Deliver to
        </span>
        <span className="flex items-center gap-1 mt-0.5">
          <span className="text-sm font-semibold text-foreground truncate">
            {label}
          </span>
          <ChevronDown
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        </span>
      </span>
      <span className="sr-only">{subline}</span>
    </motion.button>
  )
}
