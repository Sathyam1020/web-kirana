import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@workspace/ui/lib/utils"

const buttonVariants = cva(
  [
    "group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition-colors outline-none select-none",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary-active active:bg-primary-active",
        secondary:
          "bg-background text-foreground border border-foreground hover:bg-surface-soft",
        ghost: "text-foreground hover:bg-surface-soft",
        outline:
          "border border-border bg-background hover:bg-surface-soft text-foreground",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive-hover",
        link: "text-primary underline-offset-4 hover:underline hover:text-primary-active h-auto p-0",
        pill:
          "bg-primary text-primary-foreground hover:bg-primary-active rounded-full",
      },
      size: {
        default: "h-12 rounded-md px-6 text-base gap-2",
        sm: "h-9 rounded-md px-4 text-sm gap-1.5",
        xs: "h-7 rounded-sm px-3 text-xs gap-1",
        lg: "h-14 rounded-md px-8 text-base gap-2",
        icon: "h-10 w-10 rounded-full",
        "icon-sm": "h-8 w-8 rounded-full",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
