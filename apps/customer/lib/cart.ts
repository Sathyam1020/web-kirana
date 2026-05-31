"use client"

import type { ProductPublicView } from "@workspace/api-client"
import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

export interface CartItem {
  productId: string
  name: string
  pricePaise: number
  imageUrl: string | null
  quantity: number
  unit: ProductPublicView["unit"]
}

/** Surfaced when the user tries to add from a store different from cart.storeId. */
export interface StoreSwitchPrompt {
  pendingProduct: ProductPublicView
  pendingStoreId: string
  pendingStoreName: string | null
}

interface CartState {
  storeId: string | null
  /** Snapshot of the store's display name at the time items were first added,
   *  so the cart pill can render "Hampi Kirani" without a second store fetch. */
  storeName: string | null
  items: Record<string, CartItem>
  /** Set when `inc` was blocked by single-store guard. UI shows a confirm dialog. */
  pendingSwitch: StoreSwitchPrompt | null
  inc: (product: ProductPublicView, storeId: string, storeName?: string) => void
  incById: (productId: string) => void
  dec: (productId: string) => void
  remove: (productId: string) => void
  clear: () => void
  cancelSwitch: () => void
  confirmSwitch: () => void
  itemCount: (productId: string) => number
  totalItems: () => number
  subtotalPaise: () => number
}

function addOne(
  items: Record<string, CartItem>,
  product: ProductPublicView,
): Record<string, CartItem> {
  const existing = items[product.id]
  return {
    ...items,
    [product.id]: {
      productId: product.id,
      name: product.name,
      // Phase 6.8 — store the discounted (effective) price so the cart total
      // reflects active product discounts. Order placement re-validates server-
      // side anyway.
      pricePaise: product.effectivePricePaise,
      imageUrl: product.imageUrl,
      unit: product.unit,
      quantity: (existing?.quantity ?? 0) + 1,
    },
  }
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      storeId: null,
      storeName: null,
      items: {},
      pendingSwitch: null,
      inc: (product, storeId, storeName) => {
        const state = get()
        if (state.storeId !== null && state.storeId !== storeId) {
          set({
            pendingSwitch: {
              pendingProduct: product,
              pendingStoreId: storeId,
              pendingStoreName: storeName ?? null,
            },
          })
          return
        }
        set({
          items: addOne(state.items, product),
          storeId,
          // Snapshot the name on the first add at this store so we don't
          // overwrite a known name with an undefined later call.
          storeName: state.storeName ?? storeName ?? null,
        })
      },
      incById: (productId) =>
        set((prev) => {
          const existing = prev.items[productId]
          if (!existing) return prev
          return {
            items: {
              ...prev.items,
              [productId]: { ...existing, quantity: existing.quantity + 1 },
            },
          }
        }),
      dec: (productId) =>
        set((prev) => {
          const existing = prev.items[productId]
          if (!existing) return prev
          const next = { ...prev.items }
          if (existing.quantity <= 1) delete next[productId]
          else next[productId] = { ...existing, quantity: existing.quantity - 1 }
          const cleared = Object.keys(next).length === 0
          return cleared
            ? { items: {}, storeId: null, storeName: null }
            : { items: next }
        }),
      remove: (productId) =>
        set((prev) => {
          const next = { ...prev.items }
          delete next[productId]
          const cleared = Object.keys(next).length === 0
          return cleared
            ? { items: {}, storeId: null, storeName: null }
            : { items: next }
        }),
      clear: () => set({ items: {}, storeId: null, storeName: null }),
      cancelSwitch: () => set({ pendingSwitch: null }),
      confirmSwitch: () =>
        set((prev) => {
          if (!prev.pendingSwitch) return prev
          return {
            items: addOne({}, prev.pendingSwitch.pendingProduct),
            storeId: prev.pendingSwitch.pendingStoreId,
            storeName: prev.pendingSwitch.pendingStoreName,
            pendingSwitch: null,
          }
        }),
      itemCount: (productId) => get().items[productId]?.quantity ?? 0,
      totalItems: () =>
        Object.values(get().items).reduce((acc, x) => acc + x.quantity, 0),
      subtotalPaise: () =>
        Object.values(get().items).reduce(
          (acc, x) => acc + x.quantity * x.pricePaise,
          0,
        ),
    }),
    {
      name: "kirana.cart",
      storage: createJSONStorage(() => localStorage),
      // Don't persist the transient prompt state.
      partialize: (state) => ({
        storeId: state.storeId,
        storeName: state.storeName,
        items: state.items,
      }),
    },
  ),
)
