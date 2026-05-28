"use client"

import { useApi, useAuthStore } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { ThemeToggle } from "@workspace/ui/components/theme-toggle"
import {
  Building2,
  LayoutDashboard,
  LogOut,
  TicketPercent,
  Sparkles,
  Tags,
  Users,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { BrandMark } from "./brand-mark"

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/owners", label: "Owners", icon: Users },
  // Phase 6.6 — taxonomy admin: Departments (L1) above Categories (L2).
  { href: "/departments", label: "Departments", icon: Building2 },
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/coupons", label: "Coupons", icon: TicketPercent },
  { href: "/promotions", label: "Promotions", icon: Sparkles },
] as const

export function AdminShell({ children }: { children: React.ReactNode }) {
  const api = useApi()
  const router = useRouter()
  const pathname = usePathname() ?? "/"
  const user = useAuthStore((s) => s.user)
  const clear = useAuthStore((s) => s.clear)
  const [loggingOut, setLoggingOut] = useState(false)

  async function logout() {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await api.auth.logout()
    } catch {
      // continue
    }
    clear()
    router.replace("/login")
  }

  return (
    <div className="min-h-svh bg-background">
      <div className="flex">
        <aside className="hidden md:flex w-64 shrink-0 min-h-svh flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
          <div className="px-5 py-5 border-b border-sidebar-border">
            <BrandMark />
          </div>
          <nav className="flex-1 p-3 space-y-1">
            {NAV.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 h-10 px-3 rounded-[var(--radius-lg)] text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
          <div className="p-3 border-t border-sidebar-border">
            <div className="px-2 mb-2 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Signed in</p>
                <p className="text-sm font-medium truncate">{user?.name}</p>
              </div>
              <ThemeToggle size="icon-sm" />
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={logout}
              disabled={loggingOut}
            >
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <header className="md:hidden sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border px-4 py-3 flex items-center justify-between">
            <BrandMark className="text-lg" />
            <ThemeToggle />
          </header>
          <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  )
}
