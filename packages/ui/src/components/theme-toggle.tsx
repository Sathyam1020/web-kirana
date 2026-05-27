"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Moon, Sun, Monitor } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const

export function ThemeToggle({
  className,
  size = "icon",
}: {
  className?: string
  size?: "icon" | "icon-sm"
}) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  // Render a placeholder so SSR markup matches client render. Avoids hydration
  // mismatch on the icon (server can't know user's localStorage preference).
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size={size}
        className={className}
        aria-label="Theme"
      >
        <Sun className="size-4" />
      </Button>
    )
  }

  const current = resolvedTheme === "dark" ? "dark" : "light"
  const Icon = current === "dark" ? Moon : Sun

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size={size}
          className={className}
          aria-label="Switch theme"
        >
          <Icon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-1">
        {OPTIONS.map((opt) => {
          const active = theme === opt.value
          const ItemIcon = opt.icon
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTheme(opt.value)}
              className={cn(
                "w-full flex items-center gap-2 px-2.5 py-2 rounded-[var(--radius-md)] text-sm font-medium",
                active
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted",
              )}
            >
              <ItemIcon className="size-4" />
              {opt.label}
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}
