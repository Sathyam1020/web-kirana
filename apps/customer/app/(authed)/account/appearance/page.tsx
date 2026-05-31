"use client"

/**
 * Appearance settings — theme picker (Light / Dark / System).
 *
 * Built on next-themes (already wired via the Providers wrapper). The
 * existing ThemeToggle in @workspace/ui is a header popover; this page
 * is the full-screen radio-card variant the design's Preferences row
 * leads into. System mode follows the OS preference and live-updates
 * when the OS changes.
 *
 * Reduced-motion + dark-mode tokens already flip via globals.css, so
 * choosing dark here instantly retones every other surface in the app.
 */

import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/toaster"
import { ArrowLeft, Check, Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

import { useSmartBack } from "@/lib/use-smart-back"
import { cn } from "@workspace/ui/lib/utils"

type Mode = "light" | "dark" | "system"

const MODES: Array<{
  value: Mode
  label: string
  description: string
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
}> = [
  {
    value: "light",
    label: "Light",
    description: "Crisp, daytime palette",
    Icon: Sun,
  },
  {
    value: "dark",
    label: "Dark",
    description: "Easier on the eyes at night",
    Icon: Moon,
  },
  {
    value: "system",
    label: "System",
    description: "Follow your device preference",
    Icon: Monitor,
  },
]

export default function AppearancePage() {
  const onBack = useSmartBack("/account")
  const { theme, setTheme, resolvedTheme } = useTheme()
  // Hydration guard — next-themes can't know the user's choice until the
  // client mounts; rendering before then would flash the wrong selection.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  function pickMode(next: Mode) {
    setTheme(next)
    toast.success(
      next === "system"
        ? "Following your device theme"
        : `${next === "dark" ? "Dark" : "Light"} mode on`,
    )
  }

  return (
    <div className="min-h-svh bg-background pb-28">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border/40">
        <div className="max-w-md mx-auto flex items-center gap-2 px-4 py-3">
          <Button
            variant="secondary"
            size="icon"
            aria-label="Back"
            onClick={onBack}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="text-base font-semibold flex-1">Appearance</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-5 space-y-4">
        <section>
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 px-1">
            Theme
          </h2>
          <div className="rounded-[var(--radius-md)] border border-border bg-card overflow-hidden divide-y divide-border-soft">
            {MODES.map(({ value, label, description, Icon }) => {
              const active = mounted ? theme === value : false
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => pickMode(value)}
                  aria-pressed={active}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-3 text-left",
                    "hover:bg-surface-soft active:bg-surface-soft transition-colors",
                    "focus-visible:outline-none focus-visible:bg-surface-soft",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "inline-flex size-9 items-center justify-center rounded-full shrink-0",
                      active
                        ? "bg-primary/15 text-primary"
                        : "bg-surface-soft text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span
                      className={cn(
                        "block text-sm font-semibold leading-tight",
                        active ? "text-primary" : "text-foreground",
                      )}
                    >
                      {label}
                    </span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {description}
                    </span>
                  </span>
                  {active ? (
                    <Check
                      className="size-4 text-primary shrink-0"
                      aria-hidden
                    />
                  ) : null}
                </button>
              )
            })}
          </div>
          {mounted && theme === "system" ? (
            <p className="text-[11px] text-muted-foreground mt-2 px-1">
              Currently showing the{" "}
              <span className="font-semibold text-foreground">
                {resolvedTheme}
              </span>{" "}
              theme based on your device.
            </p>
          ) : null}
        </section>
      </main>
    </div>
  )
}
