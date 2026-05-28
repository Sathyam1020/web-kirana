"use client"

import { buildApi, createApiClient, type Api } from "@workspace/api-client"
import { createContext, useContext, useEffect, useMemo } from "react"
import { useAuthStore } from "./store"

interface ProviderProps {
  baseUrl: string
  children: React.ReactNode
}

const ApiContext = createContext<Api | null>(null)

/**
 * Phase 6.5: bootstrap calls /v1/auth/get-session once on mount. If the
 * httpOnly session cookie is present and valid, the response carries the
 * user; we hydrate the store. If not, we mark anonymous. No token
 * juggling, no refresh interceptor — the cookie does all the work.
 */
export function AuthProvider({ baseUrl, children }: ProviderProps) {
  const setUser = useAuthStore((s) => s.setUser)
  const clear = useAuthStore((s) => s.clear)
  const markAnonymous = useAuthStore((s) => s.markAnonymous)

  const { api } = useMemo(() => {
    const httpInstance = createApiClient({ baseURL: baseUrl })
    return { api: buildApi(httpInstance) }
  }, [baseUrl])

  useEffect(() => {
    let cancelled = false

    async function bootstrap(): Promise<void> {
      try {
        const session = await api.auth.getSession()
        if (cancelled) return
        if (session !== null && session.user !== null) {
          setUser(session.user)
        } else {
          // No live session — clear() not markAnonymous() so any stale
          // persisted user (left over from a prior signin with a different
          // role, or pre-6.5 schema) gets wiped. Otherwise the auth guard
          // would see the stale user + status=anonymous and either flag a
          // wrong role or, worse, the persist `merge` hook would re-mark
          // status=authenticated on the next reload, looping.
          clear()
        }
      } catch (err) {
        if (cancelled) return
        // Only treat a definite UNAUTHORIZED as "log them out". Network
        // blips, 500s, CORS errors, etc. leave the persisted user intact
        // so the UI keeps working until the next genuine signout — we
        // were previously signing the user out on any error, which made
        // the app look like it logged itself out every time Neon hiccupped
        // or the dev server briefly restarted.
        const e = err as { status?: number; code?: string } | undefined
        const isUnauthorized =
          e?.status === 401 || e?.code === "UNAUTHORIZED"
        if (isUnauthorized) {
          clear()
        } else {
          // Best-effort: keep whatever the persist layer hydrated, and
          // demote loading → anonymous only if we have no user at all
          // (so the guard still routes to /login instead of spinning
          // forever).
          if (useAuthStore.getState().user === null) {
            markAnonymous()
          }
        }
      }
    }

    // Wait for persist hydration before bootstrap — without this we'd race
    // localStorage and could mark anonymous before the cached user lands.
    const unsub = useAuthStore.persist.onFinishHydration(() => {
      void bootstrap()
    })
    if (useAuthStore.persist.hasHydrated()) {
      void bootstrap()
    }
    return () => {
      cancelled = true
      unsub()
    }
  }, [api, setUser, clear, markAnonymous])

  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
}

export function useApi(): Api {
  const ctx = useContext(ApiContext)
  if (ctx === null) {
    throw new Error("useApi must be used inside <AuthProvider>")
  }
  return ctx
}
