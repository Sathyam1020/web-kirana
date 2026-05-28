"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { useAuthStore } from "./store"

interface AuthGuardOpts {
  requiredRole: "CUSTOMER" | "OWNER" | "ADMIN"
  redirectTo?: string
  /**
   * Where to send users whose role doesn't match. Defaults to `/login`
   * (NOT `/`) — defaulting to `/` would loop because `/` lives inside the
   * same `(authed)` group that owns this guard. The login page sits
   * outside the guard's scope, so /login is always safe.
   */
  wrongRoleRedirect?: string
}

export function useAuthGuard(opts: AuthGuardOpts): {
  status: "loading" | "ok" | "redirecting"
} {
  const router = useRouter()
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)
  const clear = useAuthStore((s) => s.clear)

  useEffect(() => {
    if (status === "loading") return
    if (status === "anonymous") {
      router.replace(opts.redirectTo ?? "/login")
      return
    }
    if (user && user.role !== opts.requiredRole) {
      // Wrong-role visitor: drop the local user so this app stops
      // showing them in a half-authed state, then route them out of
      // the (authed) tree to /login. The session cookie itself is left
      // alone — the same cookie is valid on the role-correct app
      // (localhost ports share cookies in dev; same eTLD+1 in prod),
      // so signing in as ADMIN over there won't require fresh creds.
      clear()
      router.replace(opts.wrongRoleRedirect ?? "/login")
    }
  }, [status, user, router, clear, opts.redirectTo, opts.requiredRole, opts.wrongRoleRedirect])

  if (status === "loading") return { status: "loading" }
  if (status === "anonymous") return { status: "redirecting" }
  if (user && user.role !== opts.requiredRole) return { status: "redirecting" }
  return { status: "ok" }
}
