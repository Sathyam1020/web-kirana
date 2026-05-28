"use client"

import { ApiError, type SubcategoryOwnerView } from "@workspace/api-client"
import { useApi } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { ConfirmButton } from "@workspace/ui/components/confirm-button"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Switch } from "@workspace/ui/components/switch"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FolderTree, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { describeApiError } from "@/lib/format"

/**
 * Phase 6.6 — owner-side L3 taxonomy management ("Aisles").
 *
 * Each subcategory lives under one admin Category and belongs to this
 * store. Customers see them in the dual-pane category page (left rail).
 *
 * Quick UX notes:
 *  - The "Available" toggle is the monsoon-morning kill switch — flipping
 *    it false hides every product in the sub from customer browse +
 *    search, without changing individual product availability flags.
 *  - DELETE only works on an empty sub (FK Restrict on Product). The
 *    confirm button is gated to disabled when productCount > 0.
 */
export default function SubcategoriesPage() {
  const api = useApi()
  const queryClient = useQueryClient()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<SubcategoryOwnerView | null>(null)

  // Form state for create/edit
  const [name, setName] = useState("")
  const [displayOrder, setDisplayOrder] = useState("0")
  const [categoryId, setCategoryId] = useState("")

  const list = useQuery({
    queryKey: ["subcategories", "owner"],
    queryFn: () => api.subcategories.ownerList(),
  })

  // Admin-published categories for the picker.
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.categories.list(),
  })

  // For "under: <category name>" labels on each row.
  const catById = new Map(categories.data?.map((c) => [c.id, c]) ?? [])

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["subcategories", "owner"] })
  }

  const save = useMutation({
    mutationFn: async () => {
      const order = Number(displayOrder) || 0
      if (editing) {
        return api.subcategories.ownerUpdate(editing.id, {
          name: name.trim(),
          displayOrder: order,
        })
      }
      if (!categoryId) {
        throw new Error("Pick a category first")
      }
      return api.subcategories.ownerCreate({
        categoryId,
        name: name.trim(),
        displayOrder: order,
      })
    },
    onSuccess: () => {
      invalidate()
      closeEditor()
      toast.success(editing ? "Aisle updated" : "Aisle created")
    },
    onError: (err) => {
      if (err instanceof ApiError) toast.error(err.message)
      else toast.error(describeApiError(err))
    },
  })

  const toggleAvailability = useMutation({
    mutationFn: ({ id, next }: { id: string; next: boolean }) =>
      api.subcategories.ownerSetAvailability(id, next),
    onSuccess: invalidate,
    onError: (err) => toast.error(describeApiError(err)),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.subcategories.ownerRemove(id),
    onSuccess: () => {
      invalidate()
      toast.success("Aisle deleted")
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "CONFLICT") {
        toast.error(err.message) // "has N product(s); move or delete them first"
      } else {
        toast.error(describeApiError(err))
      }
    },
  })

  function openCreate() {
    setEditing(null)
    setName("")
    setDisplayOrder("0")
    setCategoryId("")
    setEditorOpen(true)
  }

  function openEdit(s: SubcategoryOwnerView) {
    setEditing(s)
    setName(s.name)
    setDisplayOrder(String(s.displayOrder))
    setCategoryId(s.categoryId)
    setEditorOpen(true)
  }

  function closeEditor() {
    setEditorOpen(false)
    setEditing(null)
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-24 sm:pb-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Aisles</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your store&apos;s subcategories under each marketplace category.
            Customers browse products grouped by these.
          </p>
        </div>
        <Dialog
          open={editorOpen}
          onOpenChange={(o) => (o ? setEditorOpen(true) : closeEditor())}
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
                {editing ? "Edit aisle" : "New aisle"}
              </DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                save.mutate()
              }}
              className="space-y-4"
            >
              {/* Category picker — only on create. Re-parenting an aisle
                  between admin categories is intentionally NOT supported
                  (would invalidate every product's denormalized search
                  vector under the old category). */}
              {!editing && (
                <div>
                  <Label htmlFor="category" className="mb-2 block">
                    Category
                  </Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Pick a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.data?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Marketplace categories are admin-managed. Pick the one
                    your aisle fits under.
                  </p>
                </div>
              )}
              <div>
                <Label htmlFor="name" className="mb-2 block">
                  Aisle name
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={80}
                  placeholder="e.g. Basmati Rice"
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
                  value={displayOrder}
                  onChange={(e) => setDisplayOrder(e.target.value)}
                  className="tabular-nums"
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Lower numbers surface first in the customer left rail.
                </p>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={closeEditor}>
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
          title="Couldn't load aisles"
          description="Try again in a moment."
          retry={() => list.refetch()}
        />
      )}

      {list.data && list.data.length === 0 && (
        <EmptyState
          icon={<FolderTree className="size-5" />}
          title="No aisles yet"
          description="Create your first aisle to organize your products under one of the marketplace categories."
          action={<Button onClick={openCreate}>Create aisle</Button>}
        />
      )}

      {(list.isPending || (list.data && list.data.length > 0)) && (
        <Card className="divide-y divide-border/50 overflow-hidden">
          {list.isPending &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-4">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-6 w-10 rounded-full" />
              </div>
            ))}
          {list.data?.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 p-4 flex-wrap sm:flex-nowrap"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium flex items-center gap-2">
                  {s.name}
                  {!s.isAvailable && (
                    <span className="text-xs font-normal rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
                      hidden
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {catById.get(s.categoryId)?.name ?? "—"}
                  <span className="tabular-nums">
                    {" "}
                    · {s.productCount}{" "}
                    {s.productCount === 1 ? "product" : "products"} · order{" "}
                    {s.displayOrder}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    Available
                  </span>
                  <Switch
                    checked={s.isAvailable}
                    disabled={toggleAvailability.isPending}
                    onCheckedChange={(next) =>
                      toggleAvailability.mutate({ id: s.id, next })
                    }
                    aria-label="Toggle availability"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openEdit(s)}
                  aria-label="Edit"
                >
                  <Pencil className="size-4" />
                </Button>
                <ConfirmButton
                  variant="ghost"
                  size="icon"
                  aria-label="Delete"
                  disabled={s.productCount > 0 || remove.isPending}
                  title={
                    s.productCount > 0
                      ? "Move or delete the products first"
                      : "Delete aisle?"
                  }
                  description={
                    s.productCount > 0
                      ? `This aisle has ${s.productCount} product(s). Move or delete them first.`
                      : "This deletes the aisle. The action can't be undone."
                  }
                  confirmLabel="Delete"
                  onConfirm={() => remove.mutate(s.id)}
                >
                  <Trash2 className="size-4" />
                </ConfirmButton>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
