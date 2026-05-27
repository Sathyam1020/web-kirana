import { cn } from "@workspace/ui/lib/utils"

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "text-2xl font-bold tracking-tight text-primary",
        className,
      )}
    >
      kirana
      <span className="text-foreground">/admin</span>
    </span>
  )
}
