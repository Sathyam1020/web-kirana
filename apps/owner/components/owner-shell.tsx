"use client"

import { useApi, useAuthStore } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/switch"
import { ThemeToggle } from "@workspace/ui/components/theme-toggle"
import type { StoreOwnerView } from "@workspace/api-client"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  Home,
  LogOut,
  Package,
  Ticket,
  Star,
  Loader2,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { BrandMark } from "./brand-mark"

const NAV = [
  { href: "/", label: "Today", icon: Home },
  { href: "/products", label: "Products", icon: Package },
  { href: "/featured", label: "Featured", icon: Star },
  { href: "/coupons", label: "Coupons", icon: Ticket },
] as const

interface Props {
  store: StoreOwnerView
  children: React.ReactNode
}

export function OwnerShell({ store, children }: Props) {
  const api = useApi()
  const queryClient = useQueryClient()
  const router = useRouter()
  const pathname = usePathname() ?? "/"
  const user = useAuthStore((s) => s.user)
  const clear = useAuthStore((s) => s.clear)
  const [loggingOut, setLoggingOut] = useState(false)

  const toggleOpen = useMutation({
    mutationFn: (next: boolean) => api.stores.toggleOpen(next),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: ["stores", "me"] })
      const previous = queryClient.getQueryData<StoreOwnerView>([
        "stores",
        "me",
      ])
      if (previous) {
        queryClient.setQueryData<StoreOwnerView>(["stores", "me"], {
          ...previous,
          isOpen: next,
        })
      }
      return { previous }
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(["stores", "me"], ctx.previous)
      }
      toast.error("Couldn't update store status")
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["stores", "me"], data)
      toast.success(data.isOpen ? "You're open" : "Store closed")
    },
  })

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
    <div className="min-h-svh bg-background pb-24">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border/40 px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <BrandMark className="text-xl" />
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {store.name}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 h-10 rounded-full bg-muted">
              <span className="text-xs font-medium text-muted-foreground">
                {store.isOpen ? "Open" : "Closed"}
              </span>
              {toggleOpen.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Switch
                  checked={store.isOpen}
                  onCheckedChange={(v) => toggleOpen.mutate(v)}
                />
              )}
            </div>
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              disabled={loggingOut}
              aria-label="Log out"
              title={`Signed in as ${user?.name ?? ""}`}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 py-6">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 z-30 bg-background/90 backdrop-blur-md border-t border-border/40">
        <div className="max-w-2xl mx-auto grid grid-cols-4">
          {NAV.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-1 py-3 text-xs font-medium ${
                  active ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                <Icon className={`size-5 ${active ? "" : "opacity-70"}`} />
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
