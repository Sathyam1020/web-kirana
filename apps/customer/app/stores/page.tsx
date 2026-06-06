"use client"

/**
 * Customer home — store-first layout (DP-1).
 *
 * Order of sections (mockup-locked):
 *   1. Header (deliver-to + bell + account + search)
 *   2. Primary store hero (with trust stats + favorite + change)
 *   3. Shop by category at {store} (4-col grid)
 *   4. Buy again from {store} (reorder pill + tiles; opens BuyAgainSheet)
 *   5. Featured at {store} (horizontal compact-tile rail)
 *   6. Offers for you (live coupons: admin GLOBAL + this store's STORE)
 *   7. Other nearby stores (vertical rows)
 *
 * Data sources:
 *   - /v1/stores/nearby           — all nearby stores; first-load drives auto-pick
 *   - /v1/stores/:primary         — departments, featuredProducts, banner, stats
 *   - /v1/orders?storeId=primary  — Buy again (authed only)
 *   - /v1/coupons/active?storeId  — coupon carousel (anonymous OK)
 */

import type {
  OrderItemView,
  ProductPublicView,
} from "@workspace/api-client"
import { useApi, useAuthStore } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { ErrorState } from "@workspace/ui/components/error-state"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useQuery } from "@tanstack/react-query"
import { motion } from "motion/react"
import { useEffect, useState } from "react"

import { BuyAgainRail } from "@/components/buy-again-rail"
import { ChooseStoreSheet } from "@/components/choose-store-sheet"
import { CouponCarousel } from "@/components/coupon-carousel"
import { DepartmentSections } from "@/components/department-sections"
import { ExpiringOfferRibbon } from "@/components/expiring-offer-ribbon"
import { HomeHeader } from "@/components/home-header"
import {
  NoLocationIllustration,
  NoStoresIllustration,
} from "@/components/illustrations"
import { MinOrderStrip } from "@/components/min-order-strip"
import { OtherStoresRail } from "@/components/other-stores-rail"
import { PrimaryStoreHero } from "@/components/primary-store-hero"
import { ProductRail } from "@/components/product-rail"
import { useCart } from "@/lib/cart"
import { useDeliveryContext } from "@/lib/delivery-context"
import { useUserLocation } from "@/lib/location"
import { useSelectedStore } from "@/lib/selected-store"
import { tweens, useMotionPreset } from "@workspace/ui/lib/motion"

// Items whose underlying product was deleted have productId=null and
// can't be re-added from a snapshot alone.
type ReorderableItem = OrderItemView & { productId: string }

/** Reconstruct ProductPublicView shape from an order item snapshot. */
function itemToProduct(
  item: ReorderableItem,
  storeId: string,
): ProductPublicView {
  return {
    id: item.productId,
    storeId,
    subcategoryId: "",
    subcategoryName: "",
    categoryId: "",
    categoryName: "",
    departmentId: "",
    departmentName: "",
    name: item.nameSnapshot,
    description: null,
    pricePaise: item.unitPricePaiseSnapshot,
    effectivePricePaise: item.unitPricePaiseSnapshot,
    discountType: null,
    discountValue: null,
    discountValidUntil: null,
    unit: item.unitSnapshot,
    imageUrl: item.imageUrlSnapshot,
    isAvailable: true,
    isFeatured: false,
    featuredOrder: null,
    // IP-2: Buy-Again shim. Order snapshots don't carry the full variant
    // list (only the one the customer bought). The reorder rail re-adds
    // that specific variant via the existing add-to-cart flow against
    // the variantId stored on the order item; no chips needed here.
    variants: [],
  }
}

export default function HomePage() {
  const api = useApi()
  const authStatus = useAuthStore((s) => s.status)
  const {
    location,
    status: locStatus,
    request: requestLocation,
  } = useUserLocation()
  // IP-4 — coords priority:
  //   1. delivery context (saved address picked OR GPS committed via picker)
  //   2. live GPS as the implicit default for first-run customers
  // The home re-fires the nearby query when EITHER changes; the picker
  // also invalidates `["stores","nearby"]` on commit so the swap is
  // immediate and not gated on this effect re-running.
  const ctx = useDeliveryContext()
  const effectiveCoords =
    ctx.coords ?? (location !== null ? { lat: location.lat, lng: location.lng } : null)

  const selected = useSelectedStore()
  const cart = useCart()
  const [chooseStoreOpen, setChooseStoreOpen] = useState(false)
  const fadeIn = useMotionPreset(tweens.fast)

  // --- Nearby query (every store within delivery reach) -------------------
  const nearbyQuery = useQuery({
    queryKey: ["stores", "nearby", effectiveCoords?.lat, effectiveCoords?.lng],
    enabled: effectiveCoords !== null,
    queryFn: () =>
      api.stores.nearby({
        lat: effectiveCoords!.lat,
        lng: effectiveCoords!.lng,
        radiusMeters: 50_000,
        limit: 30,
        includeClosed: true,
      }),
    staleTime: 60_000,
  })

  // Auto-derive primary store on first load; prefer nearest open.
  useEffect(() => {
    if (!nearbyQuery.data) return
    const items = nearbyQuery.data.items
    if (items.length === 0) return
    const preferOpen = items.find((s) => s.isOpen) ?? items[0]
    if (preferOpen) selected.hydrateIfEmpty(preferOpen.id)
  }, [nearbyQuery.data, selected])

  const allStores = nearbyQuery.data?.items ?? []
  const primaryStore =
    selected.storeId !== null
      ? allStores.find((s) => s.id === selected.storeId)
      : undefined
  const otherStores = allStores.filter((s) => s.id !== primaryStore?.id)

  // --- Primary store detail ------------------------------------------------
  const detailQuery = useQuery({
    queryKey: ["stores", "detail", primaryStore?.id],
    enabled: primaryStore !== undefined,
    queryFn: () => api.stores.detail(primaryStore!.id),
    staleTime: 60_000,
  })

  // --- Buy again — last order from this store, filtered server-side -------
  const ordersQuery = useQuery({
    queryKey: ["orders", "by-store", primaryStore?.id],
    enabled: authStatus === "authenticated" && primaryStore !== undefined,
    queryFn: () => api.orders.list({ storeId: primaryStore!.id, limit: 10 }),
    staleTime: 30_000,
  })
  const lastOrderAtPrimary = ordersQuery.data?.items.find(
    (o) => o.status === "DELIVERED" || o.status === "OUT_FOR_DELIVERY",
  ) ?? null

  // Build the compact-tile dataset by deduplicating across the recent
  // orders' items — buys the user a richer rail than only the very last
  // order's contents. Falls back to just the last order's items when there's
  // only one to look at.
  const recentReorderable: ProductPublicView[] = (() => {
    if (!ordersQuery.data) return []
    const seen = new Set<string>()
    const out: ProductPublicView[] = []
    for (const order of ordersQuery.data.items) {
      if (order.store.id !== primaryStore?.id) continue
      for (const item of order.items) {
        if (item.productId === null) continue
        if (seen.has(item.productId)) continue
        seen.add(item.productId)
        out.push(itemToProduct(item as ReorderableItem, order.store.id))
        if (out.length >= 12) return out
      }
    }
    return out
  })()

  // --- Coupons (anonymous-accessible) -------------------------------------
  const couponsQuery = useQuery({
    queryKey: ["coupons", "active", primaryStore?.id],
    queryFn: () =>
      api.coupons.active(
        primaryStore !== undefined ? { storeId: primaryStore.id } : {},
      ),
    staleTime: 5 * 60_000,
  })

  // --- Switch-store flow ---------------------------------------------------
  function handlePickStore(storeId: string) {
    if (storeId === selected.storeId) {
      setChooseStoreOpen(false)
      return
    }
    const cartHasOtherStore =
      cart.storeId !== null && cart.storeId !== storeId && cart.totalItems() > 0
    if (cartHasOtherStore) {
      const ok = window.confirm(
        "Your cart has items from a different store. Switching will clear your cart. Continue?",
      )
      if (!ok) return
      cart.clear()
    }
    selected.select(storeId)
    setChooseStoreOpen(false)
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }

  // --- Render buckets -----------------------------------------------------
  // The home reveals progressively rather than behind a full-page gate:
  //   1. Location not yet shared       → "Where are you?" empty state
  //   2. First nearby fetch in flight  → HomeSkeleton (section-shaped)
  //   3. Primary store derived         → hero + rails; each rail skeletons
  //                                       itself off its own query so the
  //                                       store paints the moment its id
  //                                       is known, not after every query.
  return (
    <div className="min-h-svh bg-background pb-32">
      <HomeHeader />

      {/* Min-order strip sits between the sticky header and the page
          body — sticky-feeling by virtue of being attached to a sticky
          header above and showing only when relevant. */}
      {primaryStore ? (
        <MinOrderStrip
          storeId={primaryStore.id}
          minOrderPaise={primaryStore.minOrderPaise}
          freeDeliveryThresholdPaise={primaryStore.freeDeliveryThresholdPaise}
        />
      ) : null}

      {/* Quick-commerce is mobile-first by nature. On tablet+, center a
          phone-shaped column rather than stretching content edge-to-edge.
          max-w-md ≈ 448px keeps the feel of the design intact at every
          viewport. */}
      <main className="max-w-md mx-auto px-4 py-5 space-y-4">
        {/* No location → ask for it. Only when context is empty AND GPS
            hasn't resolved AND we're not mid-request. */}
        {effectiveCoords === null && locStatus !== "requesting" ? (
          <div className="rounded-[var(--radius-md)] border border-border bg-card py-8 px-4 flex flex-col items-center gap-3 text-center">
            <NoLocationIllustration className="w-44" />
            <h2 className="text-base font-semibold">Where are you?</h2>
            <p className="text-sm text-muted-foreground max-w-xs">
              Share your location so we can show kirana stores delivering to you.
            </p>
            <Button onClick={requestLocation} className="mt-1">
              Share location
            </Button>
          </div>
        ) : null}

        {/* Loading the first nearby fetch → section-shaped skeleton. */}
        {nearbyQuery.isPending && effectiveCoords !== null ? <HomeSkeleton /> : null}

        {/* Network errored */}
        {nearbyQuery.isError ? (
          <ErrorState
            title="Couldn't load nearby stores"
            description="Check your connection and try again."
            retry={() => nearbyQuery.refetch()}
          />
        ) : null}

        {/* No stores in zone */}
        {nearbyQuery.data && allStores.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-border bg-card py-8 px-4 flex flex-col items-center gap-3 text-center">
            <NoStoresIllustration className="w-44" />
            <h2 className="text-base font-semibold">
              No kirana stores in your area yet
            </h2>
            <p className="text-sm text-muted-foreground max-w-xs">
              We&rsquo;re expanding to more neighbourhoods soon. Check back later.
            </p>
          </div>
        ) : null}

        {/* Primary store hero + everything below — renders as soon as the
            primary store id is known; each rail skeletons itself off its
            own query so the store paints fast. */}
        {primaryStore ? (
          <motion.div
            key={primaryStore.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={fadeIn}
            className="space-y-4"
          >
            {/* Above-the-fold urgency: soonest-expiring coupon (≤48h).
                Silent when nothing is expiring soon. */}
            <ExpiringOfferRibbon coupons={couponsQuery.data?.items} />

            <PrimaryStoreHero
              store={primaryStore}
              stats={detailQuery.data?.stats}
              nearbyCount={allStores.length}
              onChangeStore={() => setChooseStoreOpen(true)}
            />

            {/* Categories — above Buy again per user-locked design order.
                Grouped by department (department header → 4-col grid of
                category tiles), matching the /stores/[id] pattern. */}
            <DepartmentSections
              storeId={primaryStore.id}
              departments={detailQuery.data?.departments}
              isLoading={detailQuery.isPending}
            />

            {/* Buy again — hidden when no history. */}
            <BuyAgainRail
              storeId={primaryStore.id}
              storeName={primaryStore.name}
              lastOrder={lastOrderAtPrimary}
              recentProducts={recentReorderable}
              isLoading={authStatus === "authenticated" && ordersQuery.isPending}
            />

            <ProductRail
              title="Featured"
              products={detailQuery.data?.featuredProducts}
              storeId={primaryStore.id}
              storeName={primaryStore.name}
              isLoading={detailQuery.isPending}
              skeletonCount={4}
            />

            {/* Per-category product rails — mirrors /stores/[id]'s
                categorySections so the home becomes a one-screen browse
                of the store's catalogue, not just a featured-only teaser. */}
            {detailQuery.data?.categorySections.map((section) =>
              section.products.length === 0 ? null : (
                <ProductRail
                  key={section.category.id}
                  title={section.category.name}
                  products={section.products}
                  storeId={primaryStore.id}
                  storeName={primaryStore.name}
                  skeletonCount={3}
                />
              ),
            )}

            <CouponCarousel
              storeName={primaryStore.name}
              coupons={couponsQuery.data?.items}
              isLoading={couponsQuery.isPending}
            />

            <OtherStoresRail
              stores={otherStores}
              isLoading={nearbyQuery.isPending}
              onPickStore={handlePickStore}
            />
          </motion.div>
        ) : null}
      </main>

      <ChooseStoreSheet
        open={chooseStoreOpen}
        onOpenChange={setChooseStoreOpen}
        stores={allStores}
        selectedStoreId={selected.storeId}
        onPick={handlePickStore}
      />
    </div>
  )
}

/**
 * Section-shaped first-paint skeleton for the customer home — mirrors the
 * real layout (hero → category grid → product rail → coupon → other
 * stores) so the page settles in place instead of popping. Shown only
 * while the first nearby fetch is in flight; once the primary store id is
 * known the real sections take over and each rail handles its own
 * lower-level loading state.
 */
function HomeSkeleton() {
  return (
    <div className="space-y-4">
      {/* Hero card */}
      <div className="rounded-[var(--radius-lg)] border border-border bg-card p-3 flex gap-3">
        <Skeleton className="size-16 sm:size-20 rounded-[var(--radius-md)]" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
          <div className="flex gap-1.5 mt-1.5">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </div>
      </div>
      {/* Category grid skeleton (4-col) */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-1/3" />
        <div className="grid grid-cols-4 gap-x-3 gap-y-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-square w-full rounded-[var(--radius-lg)]" />
              <Skeleton className="h-3 w-3/4 mx-auto" />
            </div>
          ))}
        </div>
      </div>
      {/* Product rail skeleton (horizontal scroll) */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-1/2" />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="w-[8.5rem] sm:w-[10rem] shrink-0 space-y-2">
              <Skeleton className="aspect-square w-full rounded-[var(--radius-md)]" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
      {/* Coupon carousel skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="w-full h-28 rounded-[var(--radius-md)]" />
      </div>
      {/* Other stores skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-1/3" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[var(--radius-md)] border border-border bg-card p-2.5 flex items-center gap-3"
            >
              <Skeleton className="size-16 rounded-[var(--radius-md)] shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
