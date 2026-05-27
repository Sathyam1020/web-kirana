"use client"

import { useApi, useAuthGuard, useIsAuthenticated } from "@workspace/auth"
import { ErrorState } from "@workspace/ui/components/error-state"
import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { ApiError } from "@workspace/api-client"
import { OwnerShell } from "@/components/owner-shell"

export default function AuthedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // See apps/admin/app/(authed)/layout.tsx for the auth-cookie-hint pattern.
  const ssrAuthed = useIsAuthenticated()
  const { status } = useAuthGuard({
    requiredRole: "OWNER",
    redirectTo: "/login",
  })
  const api = useApi()
  const router = useRouter()

  const authOk = status === "ok" || (ssrAuthed && status === "loading")

  // Probe for an existing store. If 404 STORE_NOT_CREATED → onboard.
  // Enabled once we believe the user is authed (either guard says ok, or
  // we have the SSR cookie hint while client revalidates).
  const storeQuery = useQuery({
    queryKey: ["stores", "me"],
    queryFn: () => api.stores.getMine(),
    enabled: authOk,
    retry: (count, err) => {
      if (err instanceof ApiError && err.code === "STORE_NOT_CREATED") return false
      return count < 2
    },
  })

  useEffect(() => {
    if (!authOk) return
    if (storeQuery.isError) {
      const err = storeQuery.error
      if (err instanceof ApiError && err.code === "STORE_NOT_CREATED") {
        router.replace("/onboarding")
      }
    }
  }, [authOk, storeQuery.isError, storeQuery.error, router])

  if (!authOk) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (storeQuery.isPending) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (storeQuery.isError) {
    if (storeQuery.error instanceof ApiError && storeQuery.error.code === "STORE_NOT_CREATED") {
      return (
        <div className="min-h-svh flex items-center justify-center bg-background">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )
    }
    return (
      <div className="min-h-svh flex items-center justify-center bg-background p-6">
        <ErrorState
          className="max-w-md w-full"
          title="Couldn't load your store"
          description="Try again in a moment. If this persists, check your connection."
          retry={() => storeQuery.refetch()}
        />
      </div>
    )
  }

  return <OwnerShell store={storeQuery.data}>{children}</OwnerShell>
}
