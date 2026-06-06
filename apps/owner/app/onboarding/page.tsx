"use client"

import { uploadToCloudinary } from "@workspace/api-client"
import { useApi, useAuthGuard } from "@workspace/auth"
import { reverseGeocode } from "@workspace/ui/lib/reverse-geocode"
import { AddressAutocomplete } from "@workspace/ui/components/address-autocomplete"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { ImageUpload } from "@workspace/ui/components/image-upload"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { MapPinRefine } from "@workspace/ui/components/map-pin-refine"
import { PhoneInput } from "@workspace/ui/components/phone-input"
import { composePhone, findDialCode } from "@workspace/ui/lib/phone"
import { cn } from "@workspace/ui/lib/utils"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, Map as MapIcon, MapPin, Navigation } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { BrandMark } from "@/components/brand-mark"
import { describeApiError, rupeesToPaise } from "@/lib/format"

interface StoreFormState {
  name: string
  description: string
  phoneLocal: string
  phoneCountry: string
  addressLine: string
  city: string
  pincode: string
  latitude: string
  longitude: string
  deliveryRadiusMeters: string
  minOrderRupees: string
  imageUrl: string
  imagePublicId: string | null
}

const INITIAL: StoreFormState = {
  name: "",
  description: "",
  phoneLocal: "",
  phoneCountry: "IN",
  addressLine: "",
  city: "",
  pincode: "",
  latitude: "",
  longitude: "",
  deliveryRadiusMeters: "3000",
  minOrderRupees: "0",
  imageUrl: "",
  imagePublicId: null,
}

export default function OnboardingPage() {
  const api = useApi()
  const router = useRouter()
  const queryClient = useQueryClient()
  const guard = useAuthGuard({ requiredRole: "OWNER", redirectTo: "/login" })
  const [form, setForm] = useState<StoreFormState>(INITIAL)
  // IP-3.5 — owner refines the store pin once Maps has a starting
  // position. Riders navigate to this exact pin, so granularity matters
  // even more than for customers.
  const [pinOpen, setPinOpen] = useState(false)

  const create = useMutation({
    mutationFn: () => {
      const lat = Number(form.latitude)
      const lng = Number(form.longitude)
      // IP-1 bumped the cap from 15k → 25k server-side; mirror here.
      const radius = Math.max(500, Math.min(25_000, Number(form.deliveryRadiusMeters) || 3000))
      const minOrderPaise = rupeesToPaise(form.minOrderRupees || "0")
      const dial = findDialCode(form.phoneCountry)
      return api.stores.createMine({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        phone: composePhone(dial.dial, form.phoneLocal),
        latitude: lat,
        longitude: lng,
        deliveryRadiusMeters: radius,
        minOrderPaise,
        addressLine: form.addressLine.trim(),
        city: form.city.trim(),
        pincode: form.pincode.trim(),
        imageUrl: form.imageUrl.trim() || undefined,
        imagePublicId: form.imagePublicId ?? undefined,
      })
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["stores", "me"], data)
      toast.success("Store created. Open up when you're ready!")
      router.replace("/dashboard")
    },
    onError: (err) => {
      toast.error(describeApiError(err))
    },
  })

  function detectLocation() {
    if (!navigator.geolocation) {
      toast.error("Geolocation isn't available in this browser")
      return
    }
    // IP-3 — capture GPS coords then reverse-geocode so addressLine,
    // city, pincode all prefill from the captured spot. Without the
    // reverse step, "Use my GPS" left the owner staring at empty
    // text fields after granting permission.
    const toastId = toast.loading("Reading your location…")
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        const result = await reverseGeocode({ lat, lng })
        setForm((prev) => ({
          ...prev,
          latitude: lat.toFixed(6),
          longitude: lng.toFixed(6),
          addressLine:
            prev.addressLine.trim() === ""
              ? result?.label ?? prev.addressLine
              : prev.addressLine,
          city:
            prev.city.trim() === ""
              ? result?.components.locality ?? prev.city
              : prev.city,
          pincode:
            prev.pincode.trim() === ""
              ? result?.components.postalCode ?? prev.pincode
              : prev.pincode,
        }))
        toast.dismiss(toastId)
        if (result === null) {
          toast.warning(
            "Got your coords but couldn't read the address — fill it in below.",
          )
        } else {
          toast.success("Location captured")
        }
      },
      (err) => {
        toast.dismiss(toastId)
        if (err.code === err.PERMISSION_DENIED) {
          toast.error("Allow location access to use this.")
        } else {
          toast.error("We couldn't read your location")
        }
      },
    )
  }

  function set<K extends keyof StoreFormState>(key: K, value: StoreFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (create.isPending) return
    if (form.phoneLocal.length < 6) {
      toast.error("Enter the store's phone number")
      return
    }
    const lat = Number(form.latitude)
    const lng = Number(form.longitude)
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      toast.error("Pin a location to continue")
      return
    }
    if (form.imageUrl.trim() === "") {
      toast.error("Add a store cover image")
      return
    }
    create.mutate()
  }

  if (guard.status !== "ok") {
    return (
      <div className="min-h-svh flex items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-background px-4 sm:px-6 py-6">
      <header className="flex items-center justify-between mb-6">
        <BrandMark className="text-xl" />
      </header>

      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-semibold mb-2">Set up your store</h1>
        <p className="text-muted-foreground mb-6">
          A few details and you&apos;re live. You can edit any of these later.
        </p>

        <Card className="p-6">
          <form onSubmit={onSubmit} className="space-y-5">
            <Field
              id="name"
              label="Store name"
              value={form.name}
              onChange={(v) => set("name", v)}
              maxLength={120}
              required
            />
            <Field
              id="description"
              label="Tagline (optional)"
              value={form.description}
              onChange={(v) => set("description", v)}
              maxLength={500}
              placeholder="Daily essentials, fresh produce, & more"
            />
            <div>
              <Label htmlFor="phone" className="mb-2 block">
                Store phone
              </Label>
              <PhoneInput
                id="phone"
                value={form.phoneLocal}
                onValueChange={(v) => set("phoneLocal", v)}
                countryCode={form.phoneCountry}
                onCountryChange={(c) => set("phoneCountry", c)}
                required
                autoComplete="tel"
              />
            </div>
            {/* IP-3 — Blinkit-style location-picker block. Three paths
                to set the store's coordinates, all visible at once:
                  1. Search (fastest for known addresses / landmarks)
                  2. Use current GPS (one-tap "I'm here right now")
                  3. Select on map (drag the pin — critical for stores
                     in narrow lanes / above other shops where Google
                     can't resolve the exact entrance) */}
            <div className="space-y-2.5">
              <Label className="block">Find your store on the map</Label>
              <AddressAutocomplete
                onSelect={(resolved) => {
                  setForm((prev) => ({
                    ...prev,
                    addressLine: resolved.line1,
                    city: resolved.city,
                    pincode: resolved.pincode,
                    latitude: resolved.lat.toFixed(6),
                    longitude: resolved.lng.toFixed(6),
                  }))
                }}
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={detectLocation}
                  className={cn(
                    "flex items-start gap-2 p-2.5 rounded-[var(--radius-md)] border border-border bg-card",
                    "text-left hover:border-primary hover:bg-primary/5 transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                >
                  <Navigation className="size-4 text-primary mt-0.5 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold leading-tight text-foreground">
                      Use current GPS
                    </span>
                    <span className="block text-[10px] text-muted-foreground leading-tight mt-0.5">
                      Locate me now
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPinOpen(true)}
                  className={cn(
                    "flex items-start gap-2 p-2.5 rounded-[var(--radius-md)] border border-border bg-card",
                    "text-left hover:border-primary hover:bg-primary/5 transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                >
                  <MapIcon className="size-4 text-primary mt-0.5 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold leading-tight text-foreground">
                      Select on map
                    </span>
                    <span className="block text-[10px] text-muted-foreground leading-tight mt-0.5">
                      Drag the pin
                    </span>
                  </span>
                </button>
              </div>
              {/* Visual confirmation that a pin is set — and a quick
                  affordance to re-open the map for nudges. */}
              {form.latitude !== "" && form.longitude !== "" ? (
                <button
                  type="button"
                  onClick={() => setPinOpen(true)}
                  className={cn(
                    "flex items-center gap-2 w-full text-left p-2.5 rounded-[var(--radius-md)]",
                    "border border-success/30 bg-success-soft",
                    "hover:border-success/50 transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                >
                  <MapPin className="size-4 text-success shrink-0" aria-hidden />
                  <span className="text-[12px] flex-1 min-w-0 truncate">
                    Store pin set — tap to nudge
                  </span>
                  <span className="text-[11px] text-success font-semibold shrink-0">
                    Edit
                  </span>
                </button>
              ) : null}
            </div>
            <Field
              id="addressLine"
              label="Address line"
              value={form.addressLine}
              onChange={(v) => set("addressLine", v)}
              required
              maxLength={200}
              placeholder="e.g. above Sharma Sweets, opposite the metro exit"
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                id="city"
                label="City"
                value={form.city}
                onChange={(v) => set("city", v)}
                required
                maxLength={100}
              />
              <Field
                id="pincode"
                label="Pincode"
                value={form.pincode}
                onChange={(v) => set("pincode", v)}
                required
                maxLength={20}
                className="tabular-nums"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field
                id="radius"
                label="Delivery radius (m)"
                value={form.deliveryRadiusMeters}
                onChange={(v) => set("deliveryRadiusMeters", v)}
                type="number"
                inputMode="numeric"
                className="tabular-nums"
                helper="Between 500 and 25,000"
              />
              <Field
                id="minOrder"
                label="Min order (₹)"
                value={form.minOrderRupees}
                onChange={(v) => set("minOrderRupees", v)}
                type="number"
                inputMode="decimal"
                className="tabular-nums"
                helper="0 for none"
              />
            </div>

            <ImageUpload
              label="Store cover image (required)"
              aspect="wide"
              value={form.imageUrl || null}
              onUpload={(file) => uploadToCloudinary(api, "store", file)}
              onChange={(result) =>
                setForm((prev) => ({
                  ...prev,
                  imageUrl: result?.url ?? "",
                  imagePublicId: result?.publicId ?? null,
                }))
              }
            />

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={create.isPending}
            >
              {create.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              {create.isPending ? "Creating store" : "Create store"}
            </Button>
          </form>
        </Card>
      </div>
      {/* IP-3.5 — pin refinement. Always mounted; opens centered on
          whatever's most useful:
            1. Existing form lat/lng (refining a pick)
            2. Default to Bengaluru when nothing's set yet — the owner
               pans to their actual store from there. */}
      <MapPinRefine
        open={pinOpen}
        onOpenChange={setPinOpen}
        initial={
          form.latitude !== "" && form.longitude !== ""
            ? {
                lat: Number(form.latitude),
                lng: Number(form.longitude),
              }
            : { lat: 12.9716, lng: 77.5946 }
        }
        onConfirm={(result) => {
          setForm((prev) => ({
            ...prev,
            latitude: result.lat.toFixed(6),
            longitude: result.lng.toFixed(6),
            // Fresh-from-empty pin pick fills addressLine too. Owners
            // who already typed their store address keep their text.
            addressLine:
              prev.addressLine.trim() === ""
                ? result.resolved?.label ?? prev.addressLine
                : prev.addressLine,
            city: result.resolved?.components.locality ?? prev.city,
            pincode:
              result.resolved?.components.postalCode ?? prev.pincode,
          }))
          toast.success("Store pin set")
        }}
      />
    </div>
  )
}

interface FieldProps {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
  placeholder?: string
  required?: boolean
  maxLength?: number
  className?: string
  helper?: string
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  placeholder,
  required,
  maxLength,
  className,
  helper,
}: FieldProps) {
  return (
    <div>
      <Label htmlFor={id} className="mb-2 block">
        {label}
      </Label>
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        maxLength={maxLength}
        className={className}
      />
      {helper && (
        <p className="text-xs text-muted-foreground mt-1.5">{helper}</p>
      )}
    </div>
  )
}
