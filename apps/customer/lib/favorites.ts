"use client"

/**
 * Favorite stores — localStorage-persisted set of storeIds the customer has
 * starred on the home hero / store-detail page.
 *
 * Local-only for DP-4 (no backend favorites table yet — when that lands,
 * this slice swaps to a server-hydrated source without changing the
 * consumer API). Until then, favorites travel with the device.
 *
 * Methods kept tiny — toggle is the entire public surface plus `has`/`list`.
 */

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

interface FavoritesState {
  /** storeIds the user has favorited, in insertion order (newest last). */
  storeIds: string[]
  has: (storeId: string) => boolean
  toggle: (storeId: string) => void
  add: (storeId: string) => void
  remove: (storeId: string) => void
  clear: () => void
}

export const useFavorites = create<FavoritesState>()(
  persist(
    (set, get) => ({
      storeIds: [],
      has: (storeId) => get().storeIds.includes(storeId),
      toggle: (storeId) =>
        set((prev) => ({
          storeIds: prev.storeIds.includes(storeId)
            ? prev.storeIds.filter((id) => id !== storeId)
            : [...prev.storeIds, storeId],
        })),
      add: (storeId) =>
        set((prev) =>
          prev.storeIds.includes(storeId)
            ? prev
            : { storeIds: [...prev.storeIds, storeId] },
        ),
      remove: (storeId) =>
        set((prev) => ({
          storeIds: prev.storeIds.filter((id) => id !== storeId),
        })),
      clear: () => set({ storeIds: [] }),
    }),
    {
      name: "kirana.favorites",
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
