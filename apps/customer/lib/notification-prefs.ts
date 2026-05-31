"use client"

/**
 * Notification preferences — localStorage-persisted map of channel/scope
 * toggles the user controls on the Notifications settings page.
 *
 * Schema is purposely flat (one key per row in the design) so consumers
 * just read `prefs[key]` and dispatch updates without coordinating with
 * a backend. When a real per-user notification-prefs table lands, this
 * slice can hydrate from the server on mount with the same public API.
 *
 * Defaults follow the design's "ON by default for everything except
 * marketing" intent. Marketing toggles start OFF — opt-in only.
 */

import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

export type NotificationPrefKey =
  // Push channel
  | "push.orderUpdates"
  | "push.deliveryAlerts"
  | "push.promotionalOffers"
  // WhatsApp channel
  | "wa.orderStatusUpdates"
  | "wa.marketingMessages"
  // Email channel
  | "email.orderReceipts"
  | "email.newsletter"

const DEFAULTS: Record<NotificationPrefKey, boolean> = {
  "push.orderUpdates": true,
  "push.deliveryAlerts": true,
  "push.promotionalOffers": false,
  "wa.orderStatusUpdates": true,
  "wa.marketingMessages": false,
  "email.orderReceipts": true,
  "email.newsletter": false,
}

interface NotificationPrefsState {
  prefs: Record<NotificationPrefKey, boolean>
  set: (key: NotificationPrefKey, value: boolean) => void
  toggle: (key: NotificationPrefKey) => void
  /** Reset everything to the DEFAULTS table — exposed for tests + future "factory reset" UX. */
  reset: () => void
}

export const useNotificationPrefs = create<NotificationPrefsState>()(
  persist(
    (set) => ({
      prefs: DEFAULTS,
      set: (key, value) =>
        set((prev) => ({ prefs: { ...prev.prefs, [key]: value } })),
      toggle: (key) =>
        set((prev) => ({ prefs: { ...prev.prefs, [key]: !prev.prefs[key] } })),
      reset: () => set({ prefs: DEFAULTS }),
    }),
    {
      name: "kirana.notification-prefs",
      storage: createJSONStorage(() => localStorage),
      // Migrate forwards: if we ever add a new key to DEFAULTS, fall back
      // to the default rather than dropping it from the persisted state.
      merge: (persisted, current) => {
        const persistedAny = persisted as { prefs?: Partial<Record<NotificationPrefKey, boolean>> } | undefined
        return {
          ...current,
          prefs: { ...DEFAULTS, ...(persistedAny?.prefs ?? {}) },
        }
      },
    },
  ),
)
