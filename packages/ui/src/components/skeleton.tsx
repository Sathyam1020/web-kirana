import { cn } from "@workspace/ui/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-pulse rounded-[var(--radius-lg)] bg-muted",
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
