"use client"

import type { AuthUser } from "@workspace/api-client"
import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

/**
 * Phase 6.5: the session lives in an httpOnly cookie set by better-auth.
 * The store no longer carries any token material — it caches the user
 * row for snappy first paint, and tracks lifecycle status. The cookie
 * (read on every backend request via `withCredentials`) is the only
 * authoritative auth signal.
 */
interface AuthState {
  user: AuthUser | null
  /**
   * loading      — bootstrap getSession() is in-flight
   * anonymous    — bootstrap completed; no valid session
   * authenticated — getSession returned a user
   */
  status: "loading" | "anonymous" | "authenticated"
  setUser: (user: AuthUser) => void
  clear: () => void
  markAnonymous: () => void
}

interface PersistedAuthState {
  user: AuthUser | null
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      status: "loading",
      setUser: (user) => set({ user, status: "authenticated" }),
      clear: () => set({ user: null, status: "anonymous" }),
      markAnonymous: () => set({ status: "anonymous" }),
    }),
    {
      name: "kirana.auth",
      storage: createJSONStorage(() => localStorage),
      // Persist user only — the actual session lives in the cookie. Caching
      // the user here gives an authed first paint while getSession() runs
      // in the background; if the cookie expired the bootstrap demotes
      // status to anonymous via clear().
      partialize: (state): PersistedAuthState => ({ user: state.user }),
      // Bring status forward to "authenticated" if a cached user hydrates,
      // so the shell renders correctly without a flash of logged-out UI.
      merge: (persistedState, currentState): AuthState => {
        const persisted = (persistedState ?? {}) as Partial<PersistedAuthState>
        const merged: AuthState = {
          ...currentState,
          user: persisted.user ?? currentState.user,
        }
        if (merged.user !== null) {
          merged.status = "authenticated"
        }
        return merged
      },
    },
  ),
)
