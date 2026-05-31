"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import { Check, Loader2 } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"

import { cn } from "@workspace/ui/lib/utils"
import { springs, tapScale, useMotionPreset } from "@workspace/ui/lib/motion"

const buttonVariants = cva(
  [
    "group/button relative inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition-colors outline-none select-none",
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

type ButtonState = "idle" | "loading" | "success"

interface ButtonOwnProps {
  asChild?: boolean
  /**
   * Lifecycle state of the button beyond `disabled`.
   *  - `idle`    — normal interactive.
   *  - `loading` — spinner replaces label; width preserved (no CLS); not clickable.
   *  - `success` — brief checkmark, then caller is responsible for flipping back.
   *
   * For convenience the boolean `loading` prop is treated as `state="loading"`.
   */
  state?: ButtonState
  /** Shortcut for `state="loading"`. */
  loading?: boolean
  /**
   * Disable the tap-scale animation. Default: enabled for interactive variants.
   * The `link` variant skips it automatically since text shouldn't scale.
   */
  noPress?: boolean
}

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> &
  ButtonOwnProps

/**
 * Button with full lifecycle state matrix: idle / pressed / loading / success /
 * disabled. Backwards compatible — `<Button>Label</Button>` keeps working.
 *
 * Width is preserved across state swaps (no layout shift). Reduced motion is
 * honored automatically via the motion preset hook.
 *
 * When `asChild` is true (Radix Slot), state-driven UI (spinner, checkmark,
 * tap-scale) is disabled because the underlying child doesn't necessarily
 * accept those props. Callers wanting state animations should not pass asChild.
 */
function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  state,
  loading,
  noPress,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const resolvedState: ButtonState = state ?? (loading ? "loading" : "idle")
  const isBusy = resolvedState === "loading"
  const isSuccess = resolvedState === "success"

  const tapTransition = useMotionPreset(springs.tap)

  if (asChild) {
    return (
      <Slot.Root
        data-slot="button"
        data-variant={variant}
        data-size={size}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        {children}
      </Slot.Root>
    )
  }

  const allowPress = !noPress && variant !== "link" && !disabled && !isBusy

  return (
    <motion.button
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-state={resolvedState}
      aria-busy={isBusy || undefined}
      disabled={disabled || isBusy}
      whileTap={allowPress ? { scale: tapScale } : undefined}
      transition={tapTransition}
      className={cn(buttonVariants({ variant, size, className }))}
      {...(props as React.ComponentProps<typeof motion.button>)}
    >
      {/* Label slot — hidden but width-preserving while busy/success.
          This prevents the button shrinking when its label is swapped for
          a spinner or checkmark. */}
      <span
        aria-hidden={isBusy || isSuccess}
        className={cn(
          "inline-flex items-center gap-2 transition-opacity duration-150",
          (isBusy || isSuccess) && "opacity-0",
        )}
      >
        {children}
      </span>

      {/* Overlay slot — absolutely centered so it doesn't push width. */}
      <AnimatePresence initial={false}>
        {(isBusy || isSuccess) && (
          <motion.span
            key={resolvedState}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={tapTransition}
            className="absolute inset-0 inline-flex items-center justify-center gap-2"
          >
            {isBusy && <Loader2 className="size-4 animate-spin" />}
            {isSuccess && <Check className="size-4" />}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

export { Button, buttonVariants }
export type { ButtonProps, ButtonState }
