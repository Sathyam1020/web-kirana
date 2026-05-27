import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Shared empty-state primitive. Use whenever a fetch succeeds with zero
 * results. Defaults to a soft muted card with a centred icon, headline,
 * one-line description, and an optional primary action — sibling pages
 * stay visually consistent without each one inventing its own treatment.
 */
interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "bg-muted rounded-[var(--radius-lg)] p-8 sm:p-12 text-center",
        className,
      )}
    >
      {icon !== undefined && (
        <div className="mb-3 inline-flex size-12 items-center justify-center rounded-full bg-background/60 text-muted-foreground">
          {icon}
        </div>
      )}
      <h2 className="text-base sm:text-lg font-semibold mb-1">{title}</h2>
      {description !== undefined && (
        <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-5">
          {description}
        </p>
      )}
      {action}
    </div>
  )
}
