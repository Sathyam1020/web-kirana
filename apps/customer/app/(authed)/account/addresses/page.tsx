"use client"

import { ApiError, type Address } from "@workspace/api-client"
import { useApi } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { ConfirmButton } from "@workspace/ui/components/confirm-button"
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
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import {
  ArrowLeft,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"
import { describeApiError } from "@/lib/format"

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
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Address | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

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
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((prev) => ({
          ...prev,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }))
      },
      () => toast.error("Couldn't read your location"),
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
              <Field
                id="label"
                label="Label"
                value={form.label}
                onChange={(v) => setForm({ ...form, label: v })}
                placeholder="Home, Office"
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
                label="Address line 2 (optional)"
                value={form.line2}
                onChange={(v) => setForm({ ...form, line2: v })}
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
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Coordinates</Label>
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
                    type="number"
                    step="0.000001"
                    placeholder="Latitude"
                    value={form.latitude}
                    onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                    className="tabular-nums"
                    required
                  />
                  <Input
                    type="number"
                    step="0.000001"
                    placeholder="Longitude"
                    value={form.longitude}
                    onChange={(e) =>
                      setForm({ ...form, longitude: e.target.value })
                    }
                    className="tabular-nums"
                    required
                  />
                </div>
              </div>
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
