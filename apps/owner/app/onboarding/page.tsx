"use client"

import { useApi, useAuthGuard } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { PhoneInput } from "@workspace/ui/components/phone-input"
import { composePhone, findDialCode } from "@workspace/ui/lib/phone"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
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
}

export default function OnboardingPage() {
  const api = useApi()
  const router = useRouter()
  const queryClient = useQueryClient()
  const guard = useAuthGuard({ requiredRole: "OWNER", redirectTo: "/login" })
  const [form, setForm] = useState<StoreFormState>(INITIAL)

  const create = useMutation({
    mutationFn: () => {
      const lat = Number(form.latitude)
      const lng = Number(form.longitude)
      const radius = Math.max(500, Math.min(15000, Number(form.deliveryRadiusMeters) || 3000))
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
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((prev) => ({
          ...prev,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }))
        toast.success("Location captured")
      },
      () => toast.error("We couldn't read your location"),
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
            <Field
              id="addressLine"
              label="Address"
              value={form.addressLine}
              onChange={(v) => set("addressLine", v)}
              required
              maxLength={200}
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

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">
                  Map location
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={detectLocation}
                >
                  Use my location
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  id="latitude"
                  type="number"
                  step="0.000001"
                  placeholder="Latitude"
                  value={form.latitude}
                  onChange={(e) => set("latitude", e.target.value)}
                  className="tabular-nums"
                  required
                />
                <Input
                  id="longitude"
                  type="number"
                  step="0.000001"
                  placeholder="Longitude"
                  value={form.longitude}
                  onChange={(e) => set("longitude", e.target.value)}
                  className="tabular-nums"
                  required
                />
              </div>
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
                helper="Between 500 and 15,000"
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

            <Field
              id="imageUrl"
              label="Store image URL (optional)"
              value={form.imageUrl}
              onChange={(v) => set("imageUrl", v)}
              placeholder="https://"
              maxLength={500}
              helper="Image uploads land in Phase 12. Paste a URL for now."
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
