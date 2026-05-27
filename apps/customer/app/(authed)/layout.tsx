"use client"

import { useAuthGuard, useIsAuthenticated } from "@workspace/auth"
import { Loader2 } from "lucide-react"

export default function AuthedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // See apps/admin/app/(authed)/layout.tsx for the rationale on showing
  // children immediately when the SSR cookie hint is present.
  const ssrAuthed = useIsAuthenticated()
  const { status } = useAuthGuard({
    requiredRole: "CUSTOMER",
    redirectTo: "/login",
  })

  const showChildren = status === "ok" || (ssrAuthed && status === "loading")
  if (!showChildren) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return <>{children}</>
}
