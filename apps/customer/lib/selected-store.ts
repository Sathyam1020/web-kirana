"use client"

/**
 * Selected primary store — the kirana the customer is currently shopping at.
 *
 * The home screen pivots around this: the hero card, category rail, featured
 * rail, "buy again" rail are all relative to it. "Other nearby stores" lists
 * the rest. The user can switch via the choose-store sheet or by tapping a
 * card in the other-stores rail (with a cart-clear confirm if the cart has
 * items from a different store).
 *
 * Storage: `localStorage["kirana.selected-store"]` — persisted so a refresh
 * doesn't bounce the user back to "no store" while the nearby query refetches.
 *
 * Default: derived from `/v1/stores/nearby` results — nearest **open** store,
 * with a fallback to the nearest overall when nothing is open. The derivation
 * runs in the home page once the query lands; this slice only stores the user's
 * choice + a hydration helper.
 */

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

interface SelectedStoreState {
  /** Currently selected store id, or null until the first nearby query lands. */
  storeId: string | null
  /**
   * True after the user has manually picked a store. Once true, auto-derive
   * stops overriding their pick when the nearby query refreshes (e.g., they
   * picked a slightly-farther store on purpose; don't snap back).
   */
  userPicked: boolean

  /** Manual selection via the choose-store sheet or "Visit store" tap. */
  select: (storeId: string) => void
  /**
   * Auto-derive (called by the home page once nearby loads). No-op if the
   * user has explicitly picked.
   */
  hydrateIfEmpty: (storeId: string) => void
  /** Reset to "no selection" — used when the user clears location. */
  reset: () => void
}

export const useSelectedStore = create<SelectedStoreState>()(
  persist(
    (set, get) => ({
      storeId: null,
      userPicked: false,
      select: (storeId) => set({ storeId, userPicked: true }),
      hydrateIfEmpty: (storeId) => {
        const state = get()
        if (state.userPicked) return
        if (state.storeId === storeId) return
        set({ storeId, userPicked: false })
      },
      reset: () => set({ storeId: null, userPicked: false }),
    }),
    {
      name: "kirana.selected-store",
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
