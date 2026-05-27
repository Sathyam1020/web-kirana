"use client"

import { useAuthGuard, useIsAuthenticated } from "@workspace/auth"
import { Loader2 } from "lucide-react"
import { AdminShell } from "@/components/admin-shell"

export default function AuthedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // ssrAuthed reflects the kirana.session_token cookie seen on the SSR request. When
  // true, render the shell immediately so a returning admin doesn't see a
  // spinner on every hard refresh while the client validates the session.
  // useAuthGuard continues to run; if getSession bootstrap fails, the
  // store transitions to "anonymous" and the guard redirects to /login.
  const ssrAuthed = useIsAuthenticated()
  const { status } = useAuthGuard({
    requiredRole: "ADMIN",
    redirectTo: "/login",
  })

  const showShell = status === "ok" || (ssrAuthed && status === "loading")
  if (!showShell) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return <AdminShell>{children}</AdminShell>
}
