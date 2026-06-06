"use client"

/**
 * Customer cart slice — keyed by VARIANT id, not product id.
 *
 * IP-2 migrated this from product-keyed to variant-keyed because a
 * product can now have multiple sizes (variants) and the customer can
 * buy more than one size of the same product in a single order. Without
 * variant-keying, picking a 1 kg pack would overwrite a 500 g pack
 * already in the cart.
 *
 * Each CartItem snapshots the product + variant identity + the effective
 * price at add time. The server re-validates on placement so a stale
 * snapshot can't actually charge the customer the wrong amount.
 */

import type { ProductPublicView, ProductPublicVariantView } from "@workspace/api-client"
import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

/**
 * One line item in the customer's cart. The KEY in the `items` dict is
 * the variant id; this shape carries everything the UI needs to render
 * the row without re-fetching the product (cart page, cart pill).
 */
export interface CartItem {
  variantId: string
  productId: string
  productName: string
  variantName: string
  /** Numeric quantity in the variant's `unit` (e.g. 500 for "500 g"). */
  unitValue: string
  unit: ProductPublicView["unit"]
  /** Effective price per unit at add time (product discount applied). */
  pricePaise: number
  imageUrl: string | null
  quantity: number
}

/** Surfaced when the user tries to add from a store different from cart.storeId. */
export interface StoreSwitchPrompt {
  pendingProduct: ProductPublicView
  pendingVariant: ProductPublicVariantView
  pendingStoreId: string
  pendingStoreName: string | null
}

interface CartState {
  storeId: string | null
  storeName: string | null
  items: Record<string, CartItem>
  pendingSwitch: StoreSwitchPrompt | null
  inc: (
    product: ProductPublicView,
    variant: ProductPublicVariantView,
    storeId: string,
    storeName?: string,
  ) => void
  /** Step up an already-in-cart variant by its variantId. No-op if missing. */
  incVariant: (variantId: string) => void
  dec: (variantId: string) => void
  remove: (variantId: string) => void
  clear: () => void
  cancelSwitch: () => void
  confirmSwitch: () => void
  /** Quantity of a SPECIFIC variant in the cart. */
  variantCount: (variantId: string) => number
  /** Aggregate quantity of ANY variant of a given product. Drives the
   *  "N · Add more" badge on multi-variant cards. */
  productCount: (productId: string) => number
  totalItems: () => number
  subtotalPaise: () => number
}

function buildItem(
  product: ProductPublicView,
  variant: ProductPublicVariantView,
  quantity: number,
): CartItem {
  return {
    variantId: variant.id,
    productId: product.id,
    productName: product.name,
    variantName: variant.name,
    unitValue: variant.unitValue,
    unit: variant.unit,
    // effectivePricePaise on the variant already has the product-level
    // discount applied (see effectiveVariantPricePaise on the server).
    pricePaise: variant.effectivePricePaise,
    imageUrl: variant.imageUrl ?? product.imageUrl,
    quantity,
  }
}

function addOne(
  items: Record<string, CartItem>,
  product: ProductPublicView,
  variant: ProductPublicVariantView,
): Record<string, CartItem> {
  const existing = items[variant.id]
  return {
    ...items,
    [variant.id]: buildItem(product, variant, (existing?.quantity ?? 0) + 1),
  }
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      storeId: null,
      storeName: null,
      items: {},
      pendingSwitch: null,
      inc: (product, variant, storeId, storeName) => {
        const state = get()
        if (state.storeId !== null && state.storeId !== storeId) {
          set({
            pendingSwitch: {
              pendingProduct: product,
              pendingVariant: variant,
              pendingStoreId: storeId,
              pendingStoreName: storeName ?? null,
            },
          })
          return
        }
        set({
          items: addOne(state.items, product, variant),
          storeId,
          storeName: state.storeName ?? storeName ?? null,
        })
      },
      incVariant: (variantId) =>
        set((prev) => {
          const existing = prev.items[variantId]
          if (!existing) return prev
          return {
            items: {
              ...prev.items,
              [variantId]: { ...existing, quantity: existing.quantity + 1 },
            },
          }
        }),
      dec: (variantId) =>
        set((prev) => {
          const existing = prev.items[variantId]
          if (!existing) return prev
          const next = { ...prev.items }
          if (existing.quantity <= 1) delete next[variantId]
          else next[variantId] = { ...existing, quantity: existing.quantity - 1 }
          const cleared = Object.keys(next).length === 0
          return cleared
            ? { items: {}, storeId: null, storeName: null }
            : { items: next }
        }),
      remove: (variantId) =>
        set((prev) => {
          const next = { ...prev.items }
          delete next[variantId]
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
            items: addOne({}, prev.pendingSwitch.pendingProduct, prev.pendingSwitch.pendingVariant),
            storeId: prev.pendingSwitch.pendingStoreId,
            storeName: prev.pendingSwitch.pendingStoreName,
            pendingSwitch: null,
          }
        }),
      variantCount: (variantId) => get().items[variantId]?.quantity ?? 0,
      productCount: (productId) => {
        let n = 0
        for (const item of Object.values(get().items)) {
          if (item.productId === productId) n += item.quantity
        }
        return n
      },
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
      // Bumped to 2 in IP-2: items used to be keyed by productId with a
      // smaller CartItem shape. The cheapest correct migration is to
      // clear the cart on first load after the deploy and let the
      // customer re-add — anything else requires async product lookups
      // we don't have available inside the migrate fn. UX impact is
      // small: most customers aren't in the middle of an in-progress
      // cart between deploys, and Buy Again surfaces past purchases.
      version: 2,
      migrate: (_persistedState, version) => {
        if (version < 2) {
          return { storeId: null, storeName: null, items: {} }
        }
        return _persistedState as { storeId: null; storeName: null; items: {} }
      },
      // Don't persist the transient prompt state.
      partialize: (state) => ({
        storeId: state.storeId,
        storeName: state.storeName,
        items: state.items,
      }),
    },
  ),
)
