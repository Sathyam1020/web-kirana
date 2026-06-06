"use client"

import { ApiError, type Address } from "@workspace/api-client"
import { useApi } from "@workspace/auth"
import { AddressAutocomplete } from "@workspace/ui/components/address-autocomplete"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { ConfirmButton } from "@workspace/ui/components/confirm-button"
import { MapPinRefine } from "@workspace/ui/components/map-pin-refine"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { ErrorState } from "@workspace/ui/components/error-state"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { reverseGeocode } from "@workspace/ui/lib/reverse-geocode"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import {
  ArrowLeft,
  Loader2,
  Map as MapIcon,
  MapPin,
  Navigation,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { describeApiError } from "@/lib/format"
import { useUserLocation } from "@/lib/location"

const MAX_ADDRESSES = 20

interface FormState {
  label: string
  line1: string
  line2: string
  city: string
  pincode: string
  latitude: string
  longitude: string
}

const EMPTY_FORM: FormState = {
  label: "",
  line1: "",
  line2: "",
  city: "",
  pincode: "",
  latitude: "",
  longitude: "",
}

function addressToForm(a: Address): FormState {
  return {
    label: a.label,
    line1: a.line1,
    line2: a.line2 ?? "",
    city: a.city,
    pincode: a.pincode,
    latitude: a.latitude,
    longitude: a.longitude,
  }
}

export default function AddressesPage() {
  const api = useApi()
  const queryClient = useQueryClient()
  const { location } = useUserLocation()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Address | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  // IP-3.5 — drag-the-pin refinement on top of the autocomplete /
  // GPS pick. Sheet opens with the current lat/lng as initial.
  const [pinOpen, setPinOpen] = useState(false)

  const list = useQuery({
    queryKey: ["addresses"],
    queryFn: () => api.addresses.list(),
  })

  const createOrUpdate = useMutation({
    mutationFn: async () => {
      const lat = Number(form.latitude)
      const lng = Number(form.longitude)
      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        throw new ApiError({
          code: "VALIDATION_ERROR",
          message: "Pin a location first",
          status: 400,
        })
      }
      if (editing) {
        return api.addresses.update(editing.id, {
          label: form.label.trim(),
          line1: form.line1.trim(),
          line2: form.line2.trim() === "" ? null : form.line2.trim(),
          city: form.city.trim(),
          pincode: form.pincode.trim(),
          latitude: lat,
          longitude: lng,
        })
      }
      return api.addresses.create({
        label: form.label.trim(),
        line1: form.line1.trim(),
        line2: form.line2.trim() === "" ? undefined : form.line2.trim(),
        city: form.city.trim(),
        pincode: form.pincode.trim(),
        latitude: lat,
        longitude: lng,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addresses"] })
      setEditorOpen(false)
      setEditing(null)
      setForm(EMPTY_FORM)
      toast.success(editing ? "Address updated" : "Address added")
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "MAX_ADDRESSES_REACHED") {
        toast.warning(`You can save up to ${MAX_ADDRESSES} addresses`)
        return
      }
      toast.error(describeApiError(err))
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.addresses.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addresses"] })
      toast.success("Address removed")
    },
    onError: (err) => toast.error(describeApiError(err)),
  })

  const setDefault = useMutation({
    mutationFn: (id: string) => api.addresses.setDefault(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["addresses"] })
      toast.success("Default address updated")
    },
    onError: (err) => toast.error(describeApiError(err)),
  })

  function startCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setEditorOpen(true)
  }

  function startEdit(addr: Address) {
    setEditing(addr)
    setForm(addressToForm(addr))
    setEditorOpen(true)
  }

  function detectLocation() {
    if (!navigator.geolocation) {
      toast.error("Geolocation isn't available in this browser")
      return
    }
    // IP-3: capture coords, then reverse-geocode to also prefill
    // line1 / city / pincode — same shape the autocomplete onSelect
    // produces. Without this, tapping "Use my GPS instead" left the
    // address fields blank and the form was still un-submittable.
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
          // Only overwrite fields the user hasn't typed into. If they
          // already partly filled the form, we add to it rather than
          // replace their work.
          line1:
            prev.line1.trim() === ""
              ? result?.label ?? prev.line1
              : prev.line1,
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
          toast.warning("Got your coords but couldn't read the address — fill it in below.")
        } else {
          toast.success("Location captured")
        }
      },
      (err) => {
        toast.dismiss(toastId)
        if (err.code === err.PERMISSION_DENIED) {
          toast.error("Allow location access to use this.")
        } else {
          toast.error("Couldn't read your location")
        }
      },
    )
  }

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border/40 flex items-center justify-between px-4 sm:px-6 py-3">
        <Link href="/account" aria-label="Back">
          <Button variant="secondary" size="icon">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <h1 className="text-lg font-semibold">Saved addresses</h1>
        <Dialog
          open={editorOpen}
          onOpenChange={(o) => {
            setEditorOpen(o)
            if (!o) setEditing(null)
          }}
        >
          <DialogTrigger asChild>
            <Button
              size="icon"
              onClick={startCreate}
              disabled={list.data && list.data.length >= MAX_ADDRESSES}
            >
              <Plus className="size-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit address" : "New address"}</DialogTitle>
              <DialogDescription>
                Pin a precise location so drivers find you.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                createOrUpdate.mutate()
              }}
              className="space-y-3"
            >
              {/* IP-3 — Blinkit-style location-picker block.
                  Three coexisting paths to set the pin:
                  1. Autocomplete search (fastest for known addresses)
                  2. "Use current GPS" (one-tap for "deliver to where I
                     am right now")
                  3. "Select on map" (drag the pin anywhere — covers
                     ambiguous addresses, gated buildings, etc.)
                  All three live above the form fields so the customer
                  picks ONE method, then refines the auto-filled details
                  below. */}
              <div className="space-y-2.5">
                <Label className="block">Search address</Label>
                <AddressAutocomplete
                  currentLocation={
                    location !== null
                      ? { lat: location.lat, lng: location.lng }
                      : null
                  }
                  onSelect={(resolved) => {
                    setForm((prev) => ({
                      ...prev,
                      line1: resolved.line1,
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
              </div>
              <Field
                id="label"
                label="Label"
                value={form.label}
                onChange={(v) => setForm({ ...form, label: v })}
                placeholder="Home, Office, Mom's house"
                required
                maxLength={50}
              />
              <Field
                id="line1"
                label="Address line 1"
                value={form.line1}
                onChange={(v) => setForm({ ...form, line1: v })}
                required
                maxLength={200}
              />
              <Field
                id="line2"
                label="Landmark / floor (optional)"
                value={form.line2}
                onChange={(v) => setForm({ ...form, line2: v })}
                placeholder="Above Sharma Sweets, 3rd floor"
                maxLength={200}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  id="city"
                  label="City"
                  value={form.city}
                  onChange={(v) => setForm({ ...form, city: v })}
                  required
                  maxLength={100}
                />
                <Field
                  id="pincode"
                  label="Pincode"
                  value={form.pincode}
                  onChange={(v) => setForm({ ...form, pincode: v })}
                  required
                  maxLength={20}
                  className="tabular-nums"
                />
              </div>
              {/* IP-3 — visual confirmation that a pin is set. Shows
                  the resolved coords with a "re-pin" affordance, so
                  the customer knows they have a valid location set
                  AND can adjust without scrolling back up. */}
              {form.latitude !== "" && form.longitude !== "" ? (
                <button
                  type="button"
                  onClick={() => setPinOpen(true)}
                  className={cn(
                    "flex items-center gap-2 w-full text-left p-2.5 rounded-[var(--radius-md)]",
                    "border border-success/30 bg-success-soft text-foreground",
                    "hover:border-success/50 transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                >
                  <MapPin className="size-4 text-success shrink-0" aria-hidden />
                  <span className="text-[12px] flex-1 min-w-0 truncate">
                    Pin set — tap to adjust
                  </span>
                  <span className="text-[11px] text-success font-semibold shrink-0">
                    Edit
                  </span>
                </button>
              ) : null}
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditorOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createOrUpdate.isPending}>
                  {createOrUpdate.isPending && (
                    <Loader2 className="size-4 animate-spin" />
                  )}
                  {editing ? "Save" : "Add address"}
                </Button>
              </DialogFooter>
            </form>
            {/* IP-3.5 — pin refinement. Always mounted; on first
                open we seed with whatever's most useful:
                  1. Existing form lat/lng (refinement of a pick)
                  2. User's current GPS (fresh "select on map" path)
                  3. Bengaluru center as a last-resort default so the
                     sheet has SOMETHING to render — customer pans
                     from there to their actual neighborhood. */}
            <MapPinRefine
              open={pinOpen}
              onOpenChange={setPinOpen}
              initial={
                form.latitude !== "" && form.longitude !== ""
                  ? {
                      lat: Number(form.latitude),
                      lng: Number(form.longitude),
                    }
                  : location !== null
                    ? { lat: location.lat, lng: location.lng }
                    : { lat: 12.9716, lng: 77.5946 }
              }
              onConfirm={(result) => {
                setForm((prev) => ({
                  ...prev,
                  latitude: result.lat.toFixed(6),
                  longitude: result.lng.toFixed(6),
                  // Reverse-geocode fills line1/city/pincode when the
                  // form is otherwise empty (fresh "select on map"
                  // flow). When the customer is refining an existing
                  // pick, we only overwrite city + pincode (they
                  // change when the pin crosses a boundary) — line1
                  // stays the customer's edited text.
                  line1:
                    prev.line1.trim() === ""
                      ? result.resolved?.label ?? prev.line1
                      : prev.line1,
                  city: result.resolved?.components.locality ?? prev.city,
                  pincode:
                    result.resolved?.components.postalCode ?? prev.pincode,
                }))
                toast.success("Pin set")
              }}
            />
          </DialogContent>
        </Dialog>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-3">
        {list.isPending && (
          <>
            {Array.from({ length: 2 }).map((_, i) => (
              <Card key={i} className="p-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="size-10 rounded-full shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                    <div className="flex gap-2 pt-2">
                      <Skeleton className="h-7 w-20" />
                      <Skeleton className="h-7 w-12" />
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </>
        )}
        {list.isError && (
          <ErrorState
            title="Couldn't load your addresses"
            description="Try again in a moment."
            retry={() => list.refetch()}
          />
        )}
        {list.data && list.data.length === 0 && (
          <EmptyState
            icon={<MapPin className="size-5" />}
            title="No saved addresses"
            description="Add an address to speed up checkout."
            action={<Button onClick={startCreate}>Add address</Button>}
          />
        )}
        {list.data?.map((addr) => (
          <Card key={addr.id} className="p-4">
            <div className="flex items-start gap-3">
              <span className="size-10 rounded-full bg-muted inline-flex items-center justify-center">
                <MapPin className="size-4" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold truncate">{addr.label}</h3>
                  {addr.isDefault && (
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold bg-primary text-primary-foreground rounded-full px-2 py-0.5">
                      <Star className="size-3" />
                      Default
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {addr.line1}
                  {addr.line2 && <>, {addr.line2}</>}, {addr.city} — {addr.pincode}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {!addr.isDefault && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setDefault.mutate(addr.id)}
                      disabled={setDefault.isPending}
                    >
                      Set default
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => startEdit(addr)}
                  >
                    <Pencil className="size-3.5" /> Edit
                  </Button>
                  <ConfirmButton
                    size="sm"
                    variant="ghost"
                    onConfirm={() => remove.mutate(addr.id)}
                    title="Remove this address?"
                    description={`This will delete "${addr.label}" from your saved addresses.`}
                    confirmLabel="Remove"
                    destructive
                    disabled={remove.isPending}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </ConfirmButton>
                </div>
              </div>
            </div>
          </Card>
        ))}
        {list.data && list.data.length >= MAX_ADDRESSES && (
          <p className="text-xs text-muted-foreground text-center">
            You&apos;ve hit the {MAX_ADDRESSES} address cap. Delete one to add another.
          </p>
        )}
      </main>
    </div>
  )
}

interface FieldProps {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
  maxLength?: number
  className?: string
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  required,
  maxLength,
  className,
}: FieldProps) {
  return (
    <div>
      <Label htmlFor={id} className="mb-2 block">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        className={className}
      />
    </div>
  )
}
