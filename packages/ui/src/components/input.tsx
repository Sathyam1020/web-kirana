import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-14 w-full rounded-[var(--radius)] border border-input bg-background px-4 py-2 text-base transition-colors",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        "placeholder:text-muted-foreground/60",
        "selection:bg-primary/30 selection:text-foreground",
        "focus-visible:outline-none focus-visible:border-2 focus-visible:border-input-focus",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface-soft",
        "aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
