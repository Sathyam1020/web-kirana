"use client"

import { uploadToCloudinary, type StoreBanner, type StoreOwnerView } from "@workspace/api-client"
import { useApi } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { ImageUpload, type ImageUploadResult } from "@workspace/ui/components/image-upload"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { SafeImage } from "@workspace/ui/components/safe-image"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Switch } from "@workspace/ui/components/switch"
import { cn } from "@workspace/ui/lib/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Check, Clock, Image as ImageIcon, Loader2, MapPin, Trash2, Wallet } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { NotificationToggle } from "@/components/notification-toggle"
import { describeApiError } from "@/lib/format"

export default function SettingsPage() {
  const api = useApi()
  const queryClient = useQueryClient()

  const storeQuery = useQuery({
    queryKey: ["stores", "me"],
    queryFn: () => api.stores.getMine(),
  })
  const bannersQuery = useQuery({
    queryKey: ["banners", "me"],
    queryFn: () => api.stores.listBanners(),
  })

  const store = storeQuery.data

  // --- Store cover -------------------------------------------------------
  const coverMutation = useMutation({
    mutationFn: (result: ImageUploadResult | null) =>
      api.stores.updateMine({
        imageUrl: result?.url ?? null,
        imagePublicId: result?.publicId ?? null,
      }),
    onSuccess: (next: StoreOwnerView) => {
      queryClient.setQueryData(["stores", "me"], next)
      toast.success("Store cover updated")
    },
    onError: (err) => toast.error(describeApiError(err)),
  })

  // --- Daily availability reset (opt-in) ---------------------------------
  const availabilityMutation = useMutation({
    mutationFn: (next: boolean) => api.stores.updateMine({ autoResetAvailability: next }),
    onSuccess: (next: StoreOwnerView) => {
      queryClient.setQueryData(["stores", "me"], next)
      toast.success(
        next.autoResetAvailability
          ? "Daily availability reset on"
          : "Daily availability reset off",
      )
    },
    onError: (err) => toast.error(describeApiError(err)),
  })

  // --- Banners -----------------------------------------------------------
  const [newName, setNewName] = useState("")
  const [newImage, setNewImage] = useState<ImageUploadResult | null>(null)

  const createBanner = useMutation({
    mutationFn: () =>
      api.stores.createBanner({
        name: newName.trim(),
        imageUrl: newImage!.url,
        imagePublicId: newImage!.publicId,
      }),
    onSuccess: () => {
      setNewName("")
      setNewImage(null)
      void queryClient.invalidateQueries({ queryKey: ["banners", "me"] })
      toast.success("Banner added")
    },
    onError: (err) => toast.error(describeApiError(err)),
  })

  const setActive = useMutation({
    mutationFn: (bannerId: string | null) => api.stores.setActiveBanner(bannerId),
    onSuccess: (banners: StoreBanner[]) => {
      queryClient.setQueryData(["banners", "me"], banners)
    },
    onError: (err) => toast.error(describeApiError(err)),
  })

  const removeBanner = useMutation({
    mutationFn: (id: string) => api.stores.removeBanner(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["banners", "me"] })
      toast.success("Banner removed")
    },
    onError: (err) => toast.error(describeApiError(err)),
  })

  const banners = bannersQuery.data ?? []
  const hasActive = banners.some((b) => b.isActive)
  const canAdd = newName.trim().length > 0 && newImage !== null && !createBanner.isPending

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Store settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your cover image and promotional banners.
        </p>
      </div>

      <NotificationToggle />

      {/* Daily availability reset (opt-in) */}
      {store && (
        <Card className="p-4 flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block font-medium">Reset stock availability daily</span>
            <span className="block text-sm text-muted-foreground">
              Re-enable all your products each morning so you re-check what's in stock.
            </span>
          </span>
          <Switch
            checked={store.autoResetAvailability}
            disabled={availabilityMutation.isPending}
            onCheckedChange={(next) => availabilityMutation.mutate(next)}
            aria-label="Reset stock availability daily"
          />
        </Card>
      )}

      {/* IP-1 — Delivery fees + minimum order. Three numeric fields with a
          live preview line so the owner sees exactly what the customer
          will read on the cart. Saved together in one PATCH. */}
      {store && <DeliveryFeesCard store={store} />}

      {/* IP-1 — Operating hours + manual override. Two HH:MM inputs (native
          mobile time pickers) + a toggle. Cron auto-flips `isOpen` against
          these hours every 15 min IST. */}
      {store && <OperatingHoursCard store={store} />}

      {/* IP-1 — Delivery radius. Range 500 m – 25 km. Owners on the edge
          of a service area reach the adjacent neighbourhood. */}
      {store && <DeliveryRadiusCard store={store} />}

      {/* Store cover */}
      <Card className="p-5 space-y-3">
        <div>
          <h2 className="font-semibold">Store cover</h2>
          <p className="text-sm text-muted-foreground">
            The main image at the top of your store page.
          </p>
        </div>
        {storeQuery.isPending ? (
          <Skeleton className="aspect-[16/9] max-w-md rounded-[var(--radius-md)]" />
        ) : (
          <ImageUpload
            label=""
            aspect="wide"
            value={store?.imageUrl ?? null}
            disabled={coverMutation.isPending}
            onUpload={(file) => uploadToCloudinary(api, "store", file)}
            onChange={(result) => coverMutation.mutate(result)}
          />
        )}
      </Card>

      {/* Banners */}
      <Card className="p-5 space-y-5">
        <div>
          <h2 className="font-semibold">Promotional banners</h2>
          <p className="text-sm text-muted-foreground">
            Upload banners and switch the active one anytime. The active banner
            shows at the top of your store page.
          </p>
        </div>

        {/* Add a new banner */}
        <div className="rounded-[var(--radius-md)] border border-dashed border-border p-4 space-y-3">
          <div>
            <Label htmlFor="banner-name" className="mb-1.5 block">
              Banner name
            </Label>
            <Input
              id="banner-name"
              placeholder="e.g. Diwali 50% off"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={80}
            />
          </div>
          <ImageUpload
            label="Banner image"
            aspect="wide"
            value={newImage?.url ?? null}
            onUpload={(file) => uploadToCloudinary(api, "banner", file)}
            onChange={(result) => setNewImage(result)}
          />
          <Button onClick={() => createBanner.mutate()} disabled={!canAdd}>
            {createBanner.isPending && <Loader2 className="size-4 animate-spin" />}
            Add banner
          </Button>
        </div>

        {/* Existing banners */}
        {bannersQuery.isPending ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-[var(--radius-md)]" />
            ))}
          </div>
        ) : banners.length === 0 ? (
          <EmptyState
            icon={<ImageIcon className="size-5" />}
            title="No banners yet"
            description="Add your first promotional banner above."
          />
        ) : (
          <div className="space-y-3">
            {hasActive && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setActive.mutate(null)}
                disabled={setActive.isPending}
              >
                Hide active banner
              </Button>
            )}
            {banners.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border p-3"
              >
                <div className="w-24 aspect-[16/9] shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-surface-soft">
                  <SafeImage src={b.imageUrl} alt={b.name} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{b.name}</p>
                  {b.isActive && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-primary mt-0.5">
                      <Check className="size-3" /> Active
                    </span>
                  )}
                </div>
                {b.isActive ? (
                  <span className="text-xs text-muted-foreground px-2">Showing</span>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setActive.mutate(b.id)}
                    disabled={setActive.isPending}
                  >
                    Set active
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${b.name}`}
                  onClick={() => removeBanner.mutate(b.id)}
                  disabled={removeBanner.isPending}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// IP-1 — Store config cards. Inline components so they share the parent's
// query-client invalidation pattern without prop-drilling api/queryClient.
// Each card holds its own form state seeded from `store` and resyncs when
// the server-side value changes (after a Save round-trip).
// ---------------------------------------------------------------------------

function useStoreFieldMutation(successMessage: string) {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: Parameters<typeof api.stores.updateMine>[0]) =>
      api.stores.updateMine(patch),
    onSuccess: (next: StoreOwnerView) => {
      queryClient.setQueryData(["stores", "me"], next)
      toast.success(successMessage)
    },
    onError: (err) => toast.error(describeApiError(err)),
  })
}

function paiseToRupeeString(p: number): string {
  // Display whole-rupee when the value is a clean multiple of 100; the
  // owner rarely cares about paise precision below ₹1 (delivery fees,
  // min orders are always rounded). Falls back to two-decimal otherwise.
  return p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2)
}

function rupeesToPaise(input: string): number | null {
  const trimmed = input.trim()
  if (trimmed === "") return 0
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

function DeliveryFeesCard({ store }: { store: StoreOwnerView }) {
  const mutation = useStoreFieldMutation("Delivery settings saved")
  const [minRs, setMinRs] = useState(paiseToRupeeString(store.minOrderPaise))
  const [feeRs, setFeeRs] = useState(paiseToRupeeString(store.baseDeliveryFeePaise))
  const [thresholdRs, setThresholdRs] = useState(
    paiseToRupeeString(store.freeDeliveryThresholdPaise),
  )

  // Resync local state if the server values change (another tab, mutation
  // completed). Without this, after Save the inputs would still show the
  // pre-rounded text the owner typed.
  useEffect(() => {
    setMinRs(paiseToRupeeString(store.minOrderPaise))
    setFeeRs(paiseToRupeeString(store.baseDeliveryFeePaise))
    setThresholdRs(paiseToRupeeString(store.freeDeliveryThresholdPaise))
  }, [store.minOrderPaise, store.baseDeliveryFeePaise, store.freeDeliveryThresholdPaise])

  const minPaise = rupeesToPaise(minRs)
  const feePaise = rupeesToPaise(feeRs)
  const thresholdPaise = rupeesToPaise(thresholdRs)
  const allValid = minPaise !== null && feePaise !== null && thresholdPaise !== null

  const dirty =
    allValid &&
    (minPaise !== store.minOrderPaise ||
      feePaise !== store.baseDeliveryFeePaise ||
      thresholdPaise !== store.freeDeliveryThresholdPaise)

  // Preview line — mirrors what the customer cart will render so the owner
  // can sanity-check the rule without leaving Settings.
  const preview = (() => {
    if (!allValid) return "Enter valid amounts to preview."
    const parts: string[] = []
    if (minPaise > 0) parts.push(`Min order ₹${minPaise / 100}`)
    if (feePaise === 0) {
      parts.push("Free delivery on every order")
    } else if (thresholdPaise > 0) {
      parts.push(`₹${feePaise / 100} delivery below ₹${thresholdPaise / 100}, free above`)
    } else {
      parts.push(`Flat ₹${feePaise / 100} delivery on every order`)
    }
    return `Customer sees: ${parts.join(" · ")}`
  })()

  function onSave() {
    if (!dirty || !allValid) return
    mutation.mutate({
      minOrderPaise: minPaise,
      baseDeliveryFeePaise: feePaise,
      freeDeliveryThresholdPaise: thresholdPaise,
    })
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Wallet className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="font-semibold">Delivery fees & minimum order</h2>
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        <RupeeField
          id="min-order"
          label="Min order"
          value={minRs}
          onChange={setMinRs}
          hint="0 = no minimum"
        />
        <RupeeField
          id="base-fee"
          label="Delivery fee"
          value={feeRs}
          onChange={setFeeRs}
          hint="Capped at ₹500"
        />
        <RupeeField
          id="free-threshold"
          label="Free above"
          value={thresholdRs}
          onChange={setThresholdRs}
          hint="0 = no free tier"
        />
      </div>
      <p
        className={cn(
          "text-xs leading-relaxed",
          allValid ? "text-muted-foreground" : "text-destructive",
        )}
      >
        {preview}
      </p>
      <Button onClick={onSave} disabled={!dirty || mutation.isPending} className="w-full sm:w-auto">
        {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
        Save changes
      </Button>
    </Card>
  )
}

function RupeeField({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  hint?: string
}) {
  return (
    <div>
      <Label htmlFor={id} className="mb-1.5 block">
        {label}
      </Label>
      <div className="relative">
        <span
          aria-hidden
          className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground tabular-nums"
        >
          ₹
        </span>
        <Input
          id={id}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pl-7 tabular-nums"
        />
      </div>
      {hint ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

function OperatingHoursCard({ store }: { store: StoreOwnerView }) {
  const mutation = useStoreFieldMutation("Operating hours saved")
  const manualMutation = useStoreFieldMutation(
    store.manualClosed ? "Store reopened" : "Store manually closed",
  )
  const [openTime, setOpenTime] = useState(store.openTime)
  const [closeTime, setCloseTime] = useState(store.closeTime)

  useEffect(() => {
    setOpenTime(store.openTime)
    setCloseTime(store.closeTime)
  }, [store.openTime, store.closeTime])

  const valid =
    /^([01]\d|2[0-3]):[0-5]\d$/.test(openTime) &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(closeTime) &&
    openTime !== closeTime
  const dirty = valid && (openTime !== store.openTime || closeTime !== store.closeTime)

  function onSaveHours() {
    if (!dirty || !valid) return
    mutation.mutate({ openTime, closeTime })
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Clock className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="font-semibold">Operating hours</h2>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="open-time" className="mb-1.5 block">
            Opens at
          </Label>
          <Input
            id="open-time"
            type="time"
            value={openTime}
            onChange={(e) => setOpenTime(e.target.value)}
            className="tabular-nums"
          />
        </div>
        <div>
          <Label htmlFor="close-time" className="mb-1.5 block">
            Closes at
          </Label>
          <Input
            id="close-time"
            type="time"
            value={closeTime}
            onChange={(e) => setCloseTime(e.target.value)}
            className="tabular-nums"
          />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Indian Standard Time. Customers see &ldquo;Open&rdquo; / &ldquo;Closed&rdquo; based on these
        hours automatically — checked every 15 minutes. Crossing midnight is fine
        (e.g. open 21:00, close 01:00).
      </p>
      {!valid && (openTime !== "" && closeTime !== "") ? (
        <p className="text-xs text-destructive">
          Opening and closing time must be different valid times.
        </p>
      ) : null}
      <Button onClick={onSaveHours} disabled={!dirty || mutation.isPending} className="w-full sm:w-auto">
        {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
        Save hours
      </Button>

      {/* Manual override — separate row + immediate save (toggle UX). */}
      <div className="border-t border-border-soft pt-4 flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block font-medium text-sm">Manually closed</span>
          <span className="block text-xs text-muted-foreground">
            Emergency override. Customers see closed regardless of the hours
            above.
          </span>
        </span>
        <Switch
          checked={store.manualClosed}
          disabled={manualMutation.isPending}
          onCheckedChange={(next) => manualMutation.mutate({ manualClosed: next })}
          aria-label="Manually closed"
        />
      </div>
    </Card>
  )
}

function DeliveryRadiusCard({ store }: { store: StoreOwnerView }) {
  const mutation = useStoreFieldMutation("Delivery radius saved")
  const [km, setKm] = useState(String(store.deliveryRadiusMeters / 1000))

  useEffect(() => {
    setKm(String(store.deliveryRadiusMeters / 1000))
  }, [store.deliveryRadiusMeters])

  const parsed = Number(km)
  const valid = Number.isFinite(parsed) && parsed >= 0.5 && parsed <= 25
  const meters = valid ? Math.round(parsed * 1000) : null
  const dirty = meters !== null && meters !== store.deliveryRadiusMeters

  function onSave() {
    if (!dirty || meters === null) return
    mutation.mutate({ deliveryRadiusMeters: meters })
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <MapPin className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="font-semibold">Delivery radius</h2>
      </div>
      <div className="space-y-2">
        <Label htmlFor="radius-km" className="block">
          How far you deliver (km)
        </Label>
        <div className="flex items-center gap-3">
          <Input
            id="radius-km"
            type="number"
            min={0.5}
            max={25}
            step={0.5}
            inputMode="decimal"
            value={km}
            onChange={(e) => setKm(e.target.value)}
            className="w-24 tabular-nums"
          />
          <input
            type="range"
            min={0.5}
            max={25}
            step={0.5}
            value={valid ? parsed : 0.5}
            onChange={(e) => setKm(e.target.value)}
            className="flex-1 accent-primary"
            aria-label="Delivery radius slider"
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          500 m – 25 km. Stores beyond this radius from a customer&rsquo;s
          location won&rsquo;t appear in their nearby list.
        </p>
        {!valid ? (
          <p className="text-xs text-destructive">
            Enter a value between 0.5 and 25 km.
          </p>
        ) : null}
      </div>
      <Button onClick={onSave} disabled={!dirty || mutation.isPending} className="w-full sm:w-auto">
        {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
        Save radius
      </Button>
    </Card>
  )
}
