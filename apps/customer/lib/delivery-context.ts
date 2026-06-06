"use client"

/**
 * IP-4 — Deliver-to context.
 *
 * Decouples "where the customer's phone is" (GPS) from "where this order
 * goes." A customer in Bengaluru ordering for "Mom in Mumbai" needs to
 * tell the app which address they're targeting so the home discovers
 * Mumbai stores, not Bengaluru stores.
 *
 * Selection model:
 *   - selectedAddressId = "addr_xxx"  → coords come from that saved address
 *   - selectedAddressId = null + isGPS true → fall back to live GPS coords
 *   - selectedAddressId = null + isGPS false → no selection yet
 *
 * Denormalisation: we snapshot {coords, label} into the slice so the UI
 * paints instantly on hydration without re-fetching the addresses list.
 * The picker is the only writer; consumers read via `useDeliveryCoords`
 * and `useDeliveryLabel`.
 *
 * Storage: `localStorage["kirana.delivery-context"]` — survives reloads
 * so the customer doesn't have to re-pick on every session.
 */

import type { Address } from "@workspace/api-client"
import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

export interface DeliveryCoords {
  lat: number
  lng: number
}

interface DeliveryContextState {
  /** "addr_xxx" if a saved address is selected; null when using GPS or
   *  before the user has made any choice. */
  selectedAddressId: string | null
  /** True when the active source is the device GPS (not a saved address). */
  isGPS: boolean
  /** Denormalised so the UI can paint without round-tripping. */
  coords: DeliveryCoords | null
  /** Human label for the pill ("Home — MG Road", "Current location"). */
  label: string | null

  /** Set the active address. Reads coords from the address record. */
  selectAddress: (address: Address) => void
  /** Switch to GPS mode. Caller passes the freshly resolved coords + label. */
  useGPS: (coords: DeliveryCoords, label: string | null) => void
  /**
   * Light refresh used by the picker after the addresses list reloads —
   * if our `selectedAddressId` no longer exists server-side (deleted on
   * another device), drop it so the app falls back to GPS.
   */
  reconcile: (addresses: ReadonlyArray<Address>) => void
  /** Hard reset — used on logout. */
  clear: () => void
}

function addressCoords(a: Address): DeliveryCoords {
  return { lat: Number(a.latitude), lng: Number(a.longitude) }
}

function addressLabel(a: Address): string {
  // "Home — MG Road, Whitefield". Short enough to fit in the header pill;
  // truncation is the consumer's job.
  return `${a.label} — ${a.line1}`
}

export const useDeliveryContext = create<DeliveryContextState>()(
  persist(
    (set, get) => ({
      selectedAddressId: null,
      isGPS: false,
      coords: null,
      label: null,

      selectAddress: (address) =>
        set({
          selectedAddressId: address.id,
          isGPS: false,
          coords: addressCoords(address),
          label: addressLabel(address),
        }),

      useGPS: (coords, label) =>
        set({
          selectedAddressId: null,
          isGPS: true,
          coords,
          label: label ?? "Current location",
        }),

      reconcile: (addresses) => {
        const state = get()
        if (state.selectedAddressId === null) return
        const stillExists = addresses.find(
          (a) => a.id === state.selectedAddressId,
        )
        if (stillExists !== undefined) {
          // Re-snapshot in case the saved address was edited (line1 changed,
          // pin nudged) — keeps the pill label fresh.
          set({
            coords: addressCoords(stillExists),
            label: addressLabel(stillExists),
          })
          return
        }
        // Saved address no longer exists (deleted from another device).
        // Drop the selection — the home will fall back to GPS via the
        // useGPS path the next time the customer's coords resolve.
        set({
          selectedAddressId: null,
          isGPS: false,
          coords: null,
          label: null,
        })
      },

      clear: () =>
        set({
          selectedAddressId: null,
          isGPS: false,
          coords: null,
          label: null,
        }),
    }),
    {
      name: "kirana.delivery-context",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
)
