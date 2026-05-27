"use client"

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react"
import { useAuthStore } from "./store"

/**
 * SSR-known auth state, surfaced to client components so first paint can
 * render the right UI without waiting for client-side getSession() bootstrap.
 *
 * The value is just a hint — set true when the server saw a
 * `kirana.session_token` cookie in the request. It's not authoritative;
 * the real session validation still happens client-side via the
 * AuthProvider's bootstrap getSession() call. But it's
 * enough to render the correct shell (avatar vs sign-in) on first paint and
 * eliminate the "logged out → logged in" flicker on refresh.
 *
 * Wired in from each app's root layout:
 *
 *   // app/layout.tsx (Server Component)
 *   const ssrAuthed = await readAuthCookieHint()
 *   return <Providers ssrAuthed={ssrAuthed}>{children}</Providers>
 *
 *   // components/providers.tsx (Client Component)
 *   <AuthHintProvider ssrAuthed={ssrAuthed}>
 *     <AuthProvider baseUrl={...}>{children}</AuthProvider>
 *   </AuthHintProvider>
 */
const AuthHintContext = createContext<boolean>(false)

interface AuthHintProviderProps {
  ssrAuthed: boolean
  children: ReactNode
}

export function AuthHintProvider({ ssrAuthed, children }: AuthHintProviderProps) {
  return <AuthHintContext.Provider value={ssrAuthed}>{children}</AuthHintContext.Provider>
}

/**
 * Returns whether the user is authenticated, biased so first paint matches
 * what the server rendered. During SSR and the first client render React
 * uses `getServerSnapshot` (the SSR cookie hint). After hydration it
 * switches to `getSnapshot` (the live Zustand store status). This avoids
 * the hydration mismatch you'd get from reading the store directly —
 * server has no localStorage, so the store starts in "loading", but the
 * cookie hint can already say "authenticated".
 */
export function useIsAuthenticated(): boolean {
  const ssrAuthed = useContext(AuthHintContext)
  return useSyncExternalStore(
    (cb) => useAuthStore.subscribe(cb),
    () => useAuthStore.getState().status === "authenticated",
    () => ssrAuthed,
  )
}
