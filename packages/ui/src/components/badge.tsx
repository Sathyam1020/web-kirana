import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@workspace/ui/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold leading-none",
  {
    variants: {
      variant: {
        default: "bg-card text-foreground shadow-md",
        outline: "border border-border text-foreground",
        success: "bg-primary text-primary-foreground",
        destructive: "bg-destructive/15 text-destructive",
        muted: "bg-surface-strong text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
)

interface BadgeProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
