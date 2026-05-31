"use client"

/**
 * Toaster — single mount point for the app's transient messages. Built on
 * `sonner` (the de-facto choice in the shadcn ecosystem) but wrapped so
 * consumers import a system-themed Toaster + a `toast()` API that's already
 * configured with our defaults.
 *
 * Mount once at the root of each app:
 *
 *   <Toaster />
 *
 * Then call `toast.success("Saved")`, `toast.error("Failed")`, etc.
 *
 * Variants map to globals.css semantic tokens (success / warning / info /
 * destructive) — never raw hex.
 */

import { Toaster as SonnerToaster, toast } from "sonner"
import { useTheme } from "next-themes"

type ToasterProps = React.ComponentProps<typeof SonnerToaster>

function Toaster(props: ToasterProps) {
  const { theme } = useTheme()

  return (
    <SonnerToaster
      data-slot="toaster"
      // next-themes returns "system" sometimes — sonner accepts that.
      theme={theme as ToasterProps["theme"]}
      position="top-center"
      visibleToasts={3}
      richColors={false}
      closeButton={false}
      offset={16}
      // Map sonner's themed slots to our tokens so success/error/info match
      // the rest of the system. Tailwind classes are applied via the
      // `toastOptions.classNames` API (preferred over inline styles in v2).
      toastOptions={{
        unstyled: false,
        classNames: {
          toast: [
            "group toast pointer-events-auto",
            "flex w-full items-start gap-3",
            "rounded-[var(--radius-md)] border border-border bg-card text-foreground",
            "shadow-card px-4 py-3 text-sm",
          ].join(" "),
          title: "text-sm font-medium leading-snug",
          description: "text-sm text-muted-foreground leading-snug",
          actionButton:
            "bg-primary text-primary-foreground hover:bg-primary-active rounded-md px-3 py-1.5 text-xs font-medium",
          cancelButton:
            "bg-surface-soft text-foreground hover:bg-surface-strong rounded-md px-3 py-1.5 text-xs font-medium",
          success:
            "!border-success/30 !bg-success-soft !text-foreground [&_[data-icon]]:!text-success",
          error:
            "!border-destructive/30 !bg-destructive/10 !text-foreground [&_[data-icon]]:!text-destructive",
          warning:
            "!border-warning/30 !bg-warning-soft !text-foreground [&_[data-icon]]:!text-warning",
          info: "!border-info/30 !bg-info-soft !text-foreground [&_[data-icon]]:!text-info",
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast }
