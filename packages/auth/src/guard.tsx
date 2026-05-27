"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { useAuthStore } from "./store"

interface AuthGuardOpts {
  requiredRole: "CUSTOMER" | "OWNER" | "ADMIN"
  redirectTo?: string
  /** Where to send authed users whose role doesn't match. */
  wrongRoleRedirect?: string
}

export function useAuthGuard(opts: AuthGuardOpts): {
  status: "loading" | "ok" | "redirecting"
} {
  const router = useRouter()
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    if (status === "loading") return
    if (status === "anonymous") {
      router.replace(opts.redirectTo ?? "/login")
      return
    }
    if (user && user.role !== opts.requiredRole) {
      router.replace(opts.wrongRoleRedirect ?? "/")
    }
  }, [status, user, router, opts.redirectTo, opts.requiredRole, opts.wrongRoleRedirect])

  if (status === "loading") return { status: "loading" }
  if (status === "anonymous") return { status: "redirecting" }
  if (user && user.role !== opts.requiredRole) return { status: "redirecting" }
  return { status: "ok" }
}
