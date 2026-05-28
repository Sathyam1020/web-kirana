"use client"

import { ApiError, type Department, uploadToCloudinary } from "@workspace/api-client"
import { useApi } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { ImageUpload } from "@workspace/ui/components/image-upload"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { ErrorState } from "@workspace/ui/components/error-state"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { SafeImage } from "@workspace/ui/components/safe-image"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { Building2, Loader2, Pencil, Plus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { describeApiError } from "@/lib/format"

interface FormState {
  name: string
  displayOrder: string
  iconUrl: string
  iconPublicId: string | null
}

const EMPTY: FormState = { name: "", displayOrder: "0", iconUrl: "", iconPublicId: null }

/**
 * Phase 6.6 — admin CRUD for Departments (L1 taxonomy).
 *
 * Same shape as the Categories page but without a parent picker. Owners
 * + customers see every Department live across all stores; this page is
 * where the top-level marketplace shelves are managed.
 *
 * No DELETE in 6.6: every Category FKs Restrict to Department, so an
 * explicit delete would fail anyway. Soft-delete / archive lands in a
 * later moderation phase.
 */
export default function DepartmentsPage() {
  const api = useApi()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Department | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)

  const list = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.departments.list(),
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["departments"] })
    // Categories page reads departments too — refresh both keys.
    queryClient.invalidateQueries({ queryKey: ["categories"] })
  }

  const save = useMutation({
    mutationFn: async () => {
      const trimmedIcon = form.iconUrl.trim()
      const displayOrder = Number(form.displayOrder) || 0
      if (editing) {
        return api.departments.adminUpdate(editing.id, {
          name: form.name.trim(),
          displayOrder,
          iconUrl: trimmedIcon === "" ? null : trimmedIcon,
          iconPublicId: trimmedIcon === "" ? null : form.iconPublicId,
        })
      }
      return api.departments.adminCreate({
        name: form.name.trim(),
        displayOrder,
        iconUrl: trimmedIcon === "" ? undefined : trimmedIcon,
        iconPublicId: form.iconPublicId ?? undefined,
      })
    },
    onSuccess: () => {
      invalidate()
      setOpen(false)
      setEditing(null)
      setForm(EMPTY)
      toast.success(editing ? "Department updated" : "Department created")
    },
    onError: (err) => {
      if (err instanceof ApiError) toast.error(err.message)
      else toast.error(describeApiError(err))
    },
  })

  function openCreate() {
    setEditing(null)
    setForm(EMPTY)
    setOpen(true)
  }

  function openEdit(d: Department) {
    setEditing(d)
    setForm({
      name: d.name,
      displayOrder: String(d.displayOrder),
      iconUrl: d.iconUrl ?? "",
      iconPublicId: d.iconPublicId ?? null,
    })
    setOpen(true)
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Departments</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Top-level marketplace shelves (L1). Categories live under these.
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o)
            if (!o) setEditing(null)
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="size-4" />
              New
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit department" : "New department"}
              </DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                save.mutate()
              }}
              className="space-y-4"
            >
              <div>
                <Label htmlFor="name" className="mb-2 block">
                  Name
                </Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, name: e.target.value }))
                  }
                  required
                  maxLength={80}
                  placeholder="e.g. Grocery & Kitchen"
                />
              </div>
              <div>
                <Label htmlFor="order" className="mb-2 block">
                  Display order
                </Label>
                <Input
                  id="order"
                  type="number"
                  inputMode="numeric"
                  value={form.displayOrder}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, displayOrder: e.target.value }))
                  }
                  className="tabular-nums"
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Lower numbers surface first in the customer department grid.
                </p>
              </div>
              <ImageUpload
                label="Icon (optional)"
                aspect="square"
                value={form.iconUrl || null}
                onUpload={(file) => uploadToCloudinary(api, "department", file)}
                onChange={(result) =>
                  setForm((p) => ({
                    ...p,
                    iconUrl: result?.url ?? "",
                    iconPublicId: result?.publicId ?? null,
                  }))
                }
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending && (
                    <Loader2 className="size-4 animate-spin" />
                  )}
                  {editing ? "Save" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {list.isError && (
        <ErrorState
          title="Couldn't load departments"
          description="Try again in a moment."
          retry={() => list.refetch()}
        />
      )}

      {list.data && list.data.length === 0 && (
        <EmptyState
          icon={<Building2 className="size-5" />}
          title="No departments yet"
          description="Create your first department to start building the catalogue."
          action={<Button onClick={openCreate}>Create department</Button>}
        />
      )}

      {(list.isPending || (list.data && list.data.length > 0)) && (
        <Card className="divide-y divide-border/50 overflow-hidden">
          {list.isPending &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-4">
                <Skeleton className="size-10 rounded-[var(--radius-md)] shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="size-10 rounded-full" />
              </div>
            ))}
          {list.data?.map((d) => (
            <div key={d.id} className="flex items-center gap-3 p-4">
              <div className="size-10 rounded-[var(--radius-md)] bg-muted overflow-hidden shrink-0">
                <SafeImage
                  src={d.iconUrl}
                  alt={d.name}
                  className="object-contain"
                  fallback={<Building2 className="size-4" />}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{d.name}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  order {d.displayOrder}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => openEdit(d)}
                aria-label="Edit"
              >
                <Pencil className="size-4" />
              </Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
