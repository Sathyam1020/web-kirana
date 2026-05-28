"use client"

import { useApi, useAuthStore } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { ArrowLeft, ChevronRight, LogOut, MapPin } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useState } from "react"

export default function AccountPage() {
  const api = useApi()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const clear = useAuthStore((s) => s.clear)
  const [loggingOut, setLoggingOut] = useState(false)

  async function logout() {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      await api.auth.logout()
    } catch {
      // even if the server call fails, drop client state
    }
    clear()
    toast.success("Logged out")
    router.replace("/")
  }

  return (
    <div className="min-h-svh bg-background pb-28">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border/40 flex items-center justify-between px-4 sm:px-6 py-3">
        <Link href="/stores" aria-label="Back">
          <Button variant="secondary" size="icon">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <h1 className="text-lg font-semibold">Account</h1>
        <div className="size-10" />
      </header>

      <main className="px-4 sm:px-6 py-6 max-w-2xl mx-auto space-y-4">
        <Card className="p-6">
          <p className="text-sm text-muted-foreground mb-1">Signed in as</p>
          <p className="text-2xl font-semibold">{user?.name}</p>
          <p className="text-sm text-muted-foreground tabular-nums mt-1">
            {user?.phone}
          </p>
        </Card>

        <Link
          href="/account/addresses"
          className="flex items-center justify-between p-4 rounded-[var(--radius-md)] bg-card border border-border/40 shadow-md hover:bg-muted transition-colors"
        >
          <span className="flex items-center gap-3">
            <span className="size-10 rounded-full bg-muted inline-flex items-center justify-center">
              <MapPin className="size-4" />
            </span>
            <span className="font-medium">Saved addresses</span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>

        <Button
          variant="ghost"
          className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={logout}
          disabled={loggingOut}
        >
          <LogOut className="size-4" />
          {loggingOut ? "Logging out…" : "Log out"}
        </Button>
      </main>
    </div>
  )
}
