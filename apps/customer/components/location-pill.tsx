"use client"

import { Loader2, MapPin } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"

interface Props {
  status: "idle" | "requesting" | "ready" | "denied"
  label: string
  onClick: () => void
  className?: string
}

export function LocationPill({ status, label, onClick, className }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 h-10 rounded-full px-4 bg-surface-soft text-foreground text-sm font-medium border border-border",
        "hover:bg-surface-strong transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {status === "requesting" ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <MapPin className="size-4 text-primary" />
      )}
      <span className="truncate max-w-[12rem]">{label}</span>
    </button>
  )
}
