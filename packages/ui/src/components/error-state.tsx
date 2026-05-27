"use client"

import * as React from "react"
import { AlertCircle } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Shared error-state primitive for failed queries. Pair with the `retry`
 * prop wired to your react-query `refetch` so the user always has a way
 * out. Use one of these on every query — silently rendering nothing on
 * error is worse than any explicit failure UI.
 */
interface ErrorStateProps {
  title?: string
  description?: React.ReactNode
  retry?: () => void
  retryLabel?: string
  className?: string
}

export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this just now. Try again in a moment.",
  retry,
  retryLabel = "Retry",
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "bg-destructive/5 border border-destructive/20 rounded-[var(--radius-lg)] p-6 sm:p-8 text-center",
        className,
      )}
    >
      <div className="mb-3 inline-flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertCircle className="size-5" />
      </div>
      <p className="font-semibold mb-1">{title}</p>
      {description !== undefined && (
        <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-4">
          {description}
        </p>
      )}
      {retry !== undefined && (
        <Button onClick={retry} size="sm">
          {retryLabel}
        </Button>
      )}
    </div>
  )
}
