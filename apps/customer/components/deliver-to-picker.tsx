"use client"

/**
 * IP-4 — Deliver-to picker bottom sheet.
 *
 * Three sections, top-to-bottom:
 *   1. "Use current location" card (GPS) — single tap, always available
 *   2. Saved addresses list (signed-in only) — one tap selects
 *   3. "Add new address" CTA — routes to /account/addresses (which has
 *      the existing IP-3 Add Address dialog)
 *
 * Why route out for "Add new" instead of inlining the IP-3 dialog: the
 * dialog has a lot of state (autocomplete + GPS + map pin + form) and
 * pulling it into the sheet would duplicate that surface. The Addresses
 * page is the canonical Add/Edit screen. On return, the picker reopens
 * with the new address visible.
 *
 * Selection invalidates `["stores", "nearby"]` so the home re-queries
 * immediately with the new coords. Cart contents survive switches —
 * cart is store-scoped, not address-scoped.
 */

import type { Address } from "@workspace/api-client"
import { useApi, useIsAuthenticated } from "@workspace/auth"
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
} from "@workspace/ui/components/bottom-sheet"
import { cn } from "@workspace/ui/lib/utils"
import { springs, tapScale, useMotionPreset } from "@workspace/ui/lib/motion"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Check,
  Loader2,
  MapPin,
  Navigation,
  Plus,
  Star,
} from "lucide-react"
import { motion } from "motion/react"
import Link from "next/link"
import { useEffect, useRef } from "react"
import { toast } from "sonner"

import { useDeliveryContext } from "@/lib/delivery-context"
import { useResolvedLocation, useUserLocation, writeStoredLocation } from "@/lib/location"
import { useSelectedStore } from "@/lib/selected-store"

interface DeliverToPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeliverToPicker({ open, onOpenChange }: DeliverToPickerProps) {
  const api = useApi()
  const isAuthed = useIsAuthenticated()
  const queryClient = useQueryClient()
  const ctx = useDeliveryContext()
  // IP-4 — switching the deliver-to address means the customer is shopping
  // at a different region. Reset the persisted "primary store" pick so
  // the home auto-derives a fresh primary from the new region's nearby
  // list instead of trying to surface a stale Bengaluru store in Mumbai.
  const resetSelectedStore = useSelectedStore((s) => s.reset)
  const { location, status: locStatus, request: requestLocation } = useUserLocation()
  const { label: resolvedLabel, loading: resolvingLabel } =
    useResolvedLocation(location)

  // Saved addresses — only fetch for signed-in customers. The picker
  // shows a sign-in prompt for everyone else.
  const addresses = useQuery({
    queryKey: ["addresses"],
    queryFn: () => api.addresses.list(),
    enabled: isAuthed && open,
  })

  // Reconcile the slice with the server list. If the user deleted their
  // selected address on another device, drop the selection so the app
  // falls back to GPS.
  useEffect(() => {
    if (addresses.data === undefined) return
    ctx.reconcile(addresses.data)
    // ctx.reconcile is stable — Zustand actions don't change identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addresses.data])

  function invalidateNearby(): void {
    void queryClient.invalidateQueries({ queryKey: ["stores", "nearby"] })
    void queryClient.invalidateQueries({ queryKey: ["store"] })
  }

  function pickAddress(addr: Address): void {
    ctx.selectAddress(addr)
    resetSelectedStore()
    invalidateNearby()
    onOpenChange(false)
  }

  // GPS path needs the live coords. If status is "idle"/"denied", trigger
  // the permission prompt. Once coords land, the effect below commits
  // them to the slice + closes the sheet.
  const useGPSPending = locStatus === "requesting"
  // Tracks "did THIS picker mount just request GPS?" — so when the
  // coords land we commit + close, instead of auto-committing on every
  // unrelated coord refresh.
  const gpsRequestRef = useRef(false)
  function useGPS(): void {
    if (location !== null && locStatus === "ready") {
      ctx.useGPS(
        { lat: location.lat, lng: location.lng },
        resolvedLabel ?? location.label ?? "Current location",
      )
      writeStoredLocation({
        lat: location.lat,
        lng: location.lng,
        label: resolvedLabel ?? location.label,
      })
      resetSelectedStore()
      invalidateNearby()
      onOpenChange(false)
      return
    }
    if (locStatus === "denied") {
      toast.error("Allow location access in your browser to use this.")
      return
    }
    // Either idle or requesting — kick the prompt + flag so the effect
    // below commits as soon as it lands.
    gpsRequestRef.current = true
    requestLocation()
  }

  // Auto-commit once the requested coords resolve.
  useEffect(() => {
    if (!gpsRequestRef.current) return
    if (locStatus !== "ready" || location === null) return
    gpsRequestRef.current = false
    ctx.useGPS(
      { lat: location.lat, lng: location.lng },
      resolvedLabel ?? location.label ?? "Current location",
    )
    resetSelectedStore()
    invalidateNearby()
    onOpenChange(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locStatus, location, resolvedLabel])

  const setDefault = useMutation({
    mutationFn: (id: string) => api.addresses.setDefault(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["addresses"] })
    },
  })

  const list = addresses.data ?? []
  const sorted = [...list].sort(
    (a, b) => Number(b.isDefault) - Number(a.isDefault),
  )

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent>
        <BottomSheetHeader className="pb-2">
          <BottomSheetTitle>Deliver to</BottomSheetTitle>
        </BottomSheetHeader>

        <div className="px-4 pb-6 space-y-4 overflow-y-auto">
          {/* Section 1 — Use current location */}
          <GPSCard
            active={ctx.isGPS}
            label={
              ctx.isGPS && ctx.label
                ? ctx.label
                : resolvingLabel
                  ? "Resolving…"
                  : resolvedLabel ?? location?.label ?? "Tap to share location"
            }
            pending={useGPSPending}
            denied={locStatus === "denied"}
            onClick={useGPS}
          />

          {/* Section 2 — Saved addresses */}
          {isAuthed ? (
            <div className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1">
                Your saved addresses
              </h3>
              {addresses.isPending ? (
                <div className="py-4 text-center">
                  <Loader2 className="size-4 animate-spin inline text-muted-foreground" />
                </div>
              ) : sorted.length === 0 ? (
                <p className="text-xs text-muted-foreground px-1 py-2">
                  No saved addresses yet. Add one below to make checkout
                  faster.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {sorted.map((addr) => (
                    <AddressRow
                      key={addr.id}
                      address={addr}
                      active={ctx.selectedAddressId === addr.id}
                      onPick={() => pickAddress(addr)}
                      onSetDefault={() => setDefault.mutate(addr.id)}
                      settingDefault={
                        setDefault.isPending &&
                        setDefault.variables === addr.id
                      }
                    />
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="rounded-[var(--radius-md)] border border-border-soft bg-surface-soft px-4 py-3 text-center text-xs text-muted-foreground">
              <Link
                href="/login"
                className="font-semibold text-primary hover:underline"
                onClick={() => onOpenChange(false)}
              >
                Sign in
              </Link>{" "}
              to save addresses for one-tap delivery.
            </div>
          )}

          {/* Section 3 — Add new */}
          {isAuthed ? (
            <Link
              href="/account/addresses"
              onClick={() => onOpenChange(false)}
              className={cn(
                "flex items-center gap-3 w-full p-3 rounded-[var(--radius-md)]",
                "border border-dashed border-border bg-card hover:border-primary hover:bg-primary/5",
                "transition-colors text-left",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                <Plus className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">
                  Add new address
                </span>
                <span className="block text-[11px] text-muted-foreground mt-0.5">
                  Search, pin on map, or use your GPS
                </span>
              </span>
            </Link>
          ) : null}
        </div>
      </BottomSheetContent>
    </BottomSheet>
  )
}

function GPSCard({
  active,
  label,
  pending,
  denied,
  onClick,
}: {
  active: boolean
  label: string
  pending: boolean
  denied: boolean
  onClick: () => void
}) {
  const tap = useMotionPreset(springs.tap)
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: tapScale }}
      transition={tap}
      className={cn(
        "flex items-center gap-3 w-full p-3 rounded-[var(--radius-md)]",
        "border text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:border-primary hover:bg-primary/5",
      )}
      aria-pressed={active}
    >
      <span
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-full shrink-0",
          active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
        )}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Navigation className="size-4" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            Use current location
          </span>
          {active ? (
            <Check
              className="size-4 text-primary shrink-0"
              aria-label="Currently selected"
            />
          ) : null}
        </span>
        <span className="block text-[11px] text-muted-foreground mt-0.5 truncate">
          {denied ? "Location access blocked — enable in browser settings" : label}
        </span>
      </span>
    </motion.button>
  )
}

function AddressRow({
  address,
  active,
  onPick,
  onSetDefault,
  settingDefault,
}: {
  address: Address
  active: boolean
  onPick: () => void
  onSetDefault: () => void
  settingDefault: boolean
}) {
  const tap = useMotionPreset(springs.tap)
  return (
    <li>
      <motion.button
        type="button"
        onClick={onPick}
        whileTap={{ scale: 0.99 }}
        transition={tap}
        className={cn(
          "flex items-start gap-3 w-full p-3 rounded-[var(--radius-md)]",
          "border text-left transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active
            ? "border-primary bg-primary/5"
            : "border-border bg-card hover:border-primary/40",
        )}
        aria-pressed={active}
      >
        <span
          className={cn(
            "inline-flex size-9 items-center justify-center rounded-full shrink-0 mt-0.5",
            active ? "bg-primary text-primary-foreground" : "bg-surface-soft text-foreground",
          )}
        >
          <MapPin className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-foreground">
              {address.label}
            </span>
            {address.isDefault ? (
              <span className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wider font-semibold bg-primary/10 text-primary rounded-full px-1.5 py-0.5">
                <Star className="size-2.5" />
                Default
              </span>
            ) : null}
            {active ? (
              <Check className="size-4 text-primary ml-auto shrink-0" aria-label="Currently selected" />
            ) : null}
          </span>
          <span className="block text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-snug">
            {address.line1}
            {address.line2 ? `, ${address.line2}` : ""}, {address.city} — {address.pincode}
          </span>
          {!address.isDefault ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                onSetDefault()
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation()
                  onSetDefault()
                }
              }}
              className="inline-flex items-center gap-1 mt-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {settingDefault ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Star className="size-3" />
              )}
              Set as default
            </span>
          ) : null}
        </span>
      </motion.button>
    </li>
  )
}

