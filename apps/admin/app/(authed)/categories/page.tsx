"use client"

import { ApiError, type Category, uploadToCloudinary } from "@workspace/api-client"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { Loader2, Pencil, Plus, Tag } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { describeApiError } from "@/lib/format"

interface FormState {
  name: string
  displayOrder: string
  iconUrl: string
  iconPublicId: string | null
  // Phase 6.6 — every category must live under an admin Department.
  departmentId: string
}

const EMPTY: FormState = {
  name: "",
  displayOrder: "0",
  iconUrl: "",
  iconPublicId: null,
  departmentId: "",
}

export default function CategoriesPage() {
  const api = useApi()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Category | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)

  const list = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.categories.list(),
  })

  // Phase 6.6 — admin needs the Department list for both:
  //   (1) the create-form picker (cascade categoryId under a department), and
  //   (2) the list view, to display "under: <department name>" per row.
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.departments.list(),
  })

  // Build a fast lookup so each category row can resolve its parent dept name.
  const deptById = new Map(departments.data?.map((d) => [d.id, d]) ?? [])

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["categories"] })
  }

  const save = useMutation({
    mutationFn: async () => {
      const trimmedIcon = form.iconUrl.trim()
      const displayOrder = Number(form.displayOrder) || 0
      if (editing) {
        return api.admin.updateCategory(editing.id, {
          name: form.name.trim(),
          displayOrder,
          iconUrl: trimmedIcon === "" ? null : trimmedIcon,
          iconPublicId: trimmedIcon === "" ? null : form.iconPublicId,
        })
      }
      if (form.departmentId === "") {
        throw new Error("Pick a department first")
      }
      return api.admin.createCategory({
        departmentId: form.departmentId,
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
      toast.success(editing ? "Category updated" : "Category created")
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

  function openEdit(c: Category) {
    setEditing(c)
    setForm({
      name: c.name,
      displayOrder: String(c.displayOrder),
      iconUrl: c.iconUrl ?? "",
      iconPublicId: c.iconPublicId ?? null,
      departmentId: c.departmentId,
    })
    setOpen(true)
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Categories</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Used across all stores. Owners pick a category for every product.
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
                {editing ? "Edit category" : "New category"}
              </DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                save.mutate()
              }}
              className="space-y-4"
            >
              {/* Department picker — only required at create. Reparenting
                  an existing Category is intentionally NOT supported. */}
              {!editing && (
                <div>
                  <Label htmlFor="department" className="mb-2 block">
                    Department
                  </Label>
                  <Select
                    value={form.departmentId}
                    onValueChange={(v) =>
                      setForm((p) => ({ ...p, departmentId: v }))
                    }
                  >
                    <SelectTrigger id="department">
                      <SelectValue placeholder="Pick a department" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.data?.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
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
              </div>
              <ImageUpload
                label="Icon (optional)"
                aspect="square"
                value={form.iconUrl || null}
                onUpload={(file) => uploadToCloudinary(api, "category", file)}
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
          title="Couldn't load categories"
          description="Try again in a moment."
          retry={() => list.refetch()}
        />
      )}

      {list.data && list.data.length === 0 && (
        <EmptyState
          icon={<Tag className="size-5" />}
          title="No categories yet"
          description="Create your first category to let owners list products."
          action={<Button onClick={openCreate}>Create category</Button>}
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
          {list.data?.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-4">
              <div className="size-10 rounded-[var(--radius-md)] bg-muted overflow-hidden shrink-0">
                <SafeImage
                  src={c.iconUrl}
                  alt={c.name}
                  className="object-contain"
                  fallback={<Tag className="size-4" />}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {deptById.get(c.departmentId)?.name ?? "—"}
                  <span className="tabular-nums"> · order {c.displayOrder}</span>
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => openEdit(c)}
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
