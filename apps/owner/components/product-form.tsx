"use client"

import { useApi } from "@workspace/auth"
import type {
  CreateProductBody,
  ProductOwnerView,
  SubcategoryOwnerView,
  Unit,
  UpdateProductBody,
} from "@workspace/api-client"
import { uploadToCloudinary } from "@workspace/api-client"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { ImageUpload } from "@workspace/ui/components/image-upload"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Plus, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { describeApiError, rupeesToPaise, paiseToRupees } from "@/lib/format"

const UNITS: Unit[] = ["KG", "G", "L", "ML", "PIECE", "PACK", "DOZEN"]

/**
 * Phase 6.6 — only the Subcategory (L3) is picked; its parent Category
 * (L2) is implicit from Subcategory.categoryId. We show the parent name
 * as context on each option (e.g. "Basmati Rice — Atta, Rice & Dal") so
 * the owner still sees the marketplace shelf at a glance.
 */
// "" = no discount. The value field means percent (PERCENT) or rupees (FLAT).
type DiscountChoice = "" | "PERCENT" | "FLAT_PAISE"

interface FormState {
  name: string
  subcategoryId: string
  description: string
  priceRupees: string
  unit: Unit
  imageUrl: string
  imagePublicId: string | null
  isAvailable: boolean
  aliasInput: string
  searchAliases: string[]
  discountType: DiscountChoice
  discountValueInput: string
  discountValidUntil: string // "" or a YYYY-MM-DD date-input value
}

function emptyForm(): FormState {
  return {
    name: "",
    subcategoryId: "",
    description: "",
    priceRupees: "",
    unit: "PIECE",
    imageUrl: "",
    imagePublicId: null,
    isAvailable: true,
    aliasInput: "",
    searchAliases: [],
    discountType: "",
    discountValueInput: "",
    discountValidUntil: "",
  }
}

function fromProduct(p: ProductOwnerView): FormState {
  return {
    name: p.name,
    subcategoryId: p.subcategoryId,
    description: p.description ?? "",
    priceRupees: paiseToRupees(p.pricePaise),
    unit: p.unit,
    imageUrl: p.imageUrl ?? "",
    imagePublicId: p.imagePublicId ?? null,
    isAvailable: p.isAvailable,
    aliasInput: "",
    searchAliases: p.searchAliases,
    discountType: p.discountType ?? "",
    discountValueInput:
      p.discountValue === null
        ? ""
        : p.discountType === "FLAT_PAISE"
          ? paiseToRupees(p.discountValue)
          : String(p.discountValue),
    discountValidUntil: p.discountValidUntil ? p.discountValidUntil.slice(0, 10) : "",
  }
}

interface Props {
  product?: ProductOwnerView
  onSaved?: (next: ProductOwnerView) => void
}

export function ProductForm({ product, onSaved }: Props) {
  const api = useApi()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(
    product ? fromProduct(product) : emptyForm(),
  )

  // Phase 6.6 — pick directly from this store's aisles. Each aisle
  // already knows its parent admin Category (sub.categoryId), so no
  // cascading picker is needed; we just label each option with the parent
  // category for visual context.
  const subcategories = useQuery({
    queryKey: ["subcategories", "me"],
    queryFn: () => api.subcategories.ownerList(),
  })

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.categories.list(),
  })

  // Lookup so the option label can render "<aisle> — <category>".
  const catNameById = new Map(
    categories.data?.map((c) => [c.id, c.name]) ?? [],
  )

  // Sort aisles so options are grouped together by parent category, then
  // by displayOrder, then alphabetically. (shadcn Select doesn't support
  // visual groups out of the box; this ordering keeps related aisles
  // adjacent in the list.)
  const sortedSubs = (subcategories.data ?? [])
    .slice()
    .sort((a, b) => {
      const ac = catNameById.get(a.categoryId) ?? ""
      const bc = catNameById.get(b.categoryId) ?? ""
      if (ac !== bc) return ac.localeCompare(bc)
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder
      return a.name.localeCompare(b.name)
    })

  // Phase 6.6 — inline "Create aisle" dialog right from the product form
  // so the owner doesn't have to detour to /subcategories on their first
  // product. After save, the new aisle is auto-selected on the form.
  const [aisleDialogOpen, setAisleDialogOpen] = useState(false)
  const [newAisleCategoryId, setNewAisleCategoryId] = useState("")
  const [newAisleName, setNewAisleName] = useState("")

  const createAisle = useMutation({
    mutationFn: () =>
      api.subcategories.ownerCreate({
        categoryId: newAisleCategoryId,
        name: newAisleName.trim(),
      }),
    onSuccess: (sub) => {
      queryClient.invalidateQueries({ queryKey: ["subcategories", "me"] })
      // Auto-select the newly-created aisle so the owner can keep going.
      setForm((p) => ({ ...p, subcategoryId: sub.id }))
      setAisleDialogOpen(false)
      setNewAisleCategoryId("")
      setNewAisleName("")
      toast.success(`Aisle "${sub.name}" created`)
    },
    onError: (err) => toast.error(describeApiError(err)),
  })

  const save = useMutation({
    mutationFn: async () => {
      const pricePaise = rupeesToPaise(form.priceRupees)
      if (pricePaise < 100) {
        throw new Error("Price must be at least ₹1.00")
      }
      if (!product && form.subcategoryId === "") {
        throw new Error("Pick a subcategory first")
      }

      // Discount — value is a percent (PERCENT) or rupees→paise (FLAT_PAISE).
      let discountValue: number | null = null
      if (form.discountType !== "") {
        if (form.discountValueInput.trim() === "") {
          throw new Error("Enter a discount value")
        }
        if (form.discountType === "PERCENT") {
          discountValue = Math.round(Number(form.discountValueInput))
          if (!(discountValue >= 1 && discountValue <= 100)) {
            throw new Error("Discount % must be between 1 and 100")
          }
        } else {
          discountValue = rupeesToPaise(form.discountValueInput)
          if (discountValue < 100) throw new Error("Flat discount must be at least ₹1")
          if (discountValue >= pricePaise) {
            throw new Error("Flat discount must be less than the price")
          }
        }
      }
      const discountValidUntilISO = form.discountValidUntil
        ? new Date(`${form.discountValidUntil}T23:59:59`).toISOString()
        : undefined

      const base = {
        name: form.name.trim(),
        description: form.description.trim(),
        pricePaise,
        unit: form.unit,
        imageUrl: form.imageUrl.trim(),
        searchAliases: form.searchAliases,
      }
      if (product) {
        // PATCH no longer accepts subcategoryId; use /move if it changed.
        if (form.subcategoryId !== product.subcategoryId && form.subcategoryId !== "") {
          await api.products.move(product.id, { subcategoryId: form.subcategoryId })
        }
        const patch: UpdateProductBody = {
          name: base.name,
          description: base.description === "" ? null : base.description,
          pricePaise: base.pricePaise,
          unit: base.unit,
          imageUrl: base.imageUrl === "" ? null : base.imageUrl,
          imagePublicId: base.imageUrl === "" ? null : form.imagePublicId,
          isAvailable: form.isAvailable,
          searchAliases: base.searchAliases,
          // null clears the discount; otherwise set the trio.
          discountType: form.discountType === "" ? null : form.discountType,
          discountValue: form.discountType === "" ? null : discountValue,
          discountValidUntil:
            form.discountType === "" ? null : (discountValidUntilISO ?? null),
        }
        return api.products.update(product.id, patch)
      }
      const body: CreateProductBody = {
        ...base,
        subcategoryId: form.subcategoryId,
        description: base.description === "" ? undefined : base.description,
        imageUrl: base.imageUrl === "" ? undefined : base.imageUrl,
        imagePublicId: form.imagePublicId ?? undefined,
        isAvailable: form.isAvailable,
        ...(form.discountType !== ""
          ? {
              discountType: form.discountType,
              discountValue: discountValue ?? undefined,
              discountValidUntil: discountValidUntilISO,
            }
          : {}),
      }
      return api.products.create(body)
    },
    onSuccess: (next) => {
      queryClient.invalidateQueries({ queryKey: ["products", "me"] })
      toast.success(product ? "Product saved" : "Product added")
      if (onSaved) onSaved(next)
      else router.replace("/products")
    },
    onError: (err) => toast.error(describeApiError(err)),
  })

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function addAlias() {
    const v = form.aliasInput.trim()
    if (v.length === 0) return
    if (form.searchAliases.includes(v.toLowerCase())) {
      set("aliasInput", "")
      return
    }
    setForm((prev) => ({
      ...prev,
      searchAliases: [...prev.searchAliases, v.toLowerCase()].slice(0, 20),
      aliasInput: "",
    }))
  }

  function removeAlias(a: string) {
    setForm((prev) => ({
      ...prev,
      searchAliases: prev.searchAliases.filter((x) => x !== a),
    }))
  }

  return (
    <Card className="p-6 max-w-2xl mx-auto">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (save.isPending) return
          if (!form.subcategoryId) {
            toast.error("Pick an aisle")
            return
          }
          save.mutate()
        }}
        className="space-y-5"
      >
        <Field
          id="name"
          label="Name"
          value={form.name}
          onChange={(v) => set("name", v)}
          required
          maxLength={200}
        />

        {/* Phase 6.6 — single aisle picker + inline "+ Create" button.
            Each aisle implies its parent admin Category, so options are
            labelled "<aisle> — <category>". When the owner has no aisles
            yet (or none under the right category), the "+ Create" button
            opens a dialog that creates the aisle without leaving this
            form, and auto-selects the new aisle on success. */}
        <div>
          <div className="flex items-center justify-between mb-2 gap-3">
            <Label htmlFor="aisle">Aisle</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                // Pre-fill category to whatever the current selected aisle
                // points to, otherwise leave empty for the owner to pick.
                const current = subcategories.data?.find(
                  (s) => s.id === form.subcategoryId,
                )
                setNewAisleCategoryId(current?.categoryId ?? "")
                setNewAisleName("")
                setAisleDialogOpen(true)
              }}
            >
              <Plus className="size-3.5" />
              Create aisle
            </Button>
          </div>
          <Select
            value={form.subcategoryId}
            onValueChange={(v) => set("subcategoryId", v)}
            disabled={subcategories.isPending}
          >
            <SelectTrigger id="aisle">
              <SelectValue
                placeholder={
                  subcategories.isPending
                    ? "Loading aisles…"
                    : sortedSubs.length === 0
                    ? "No aisles yet — tap “Create aisle”"
                    : "Pick an aisle"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {sortedSubs.map((s: SubcategoryOwnerView) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                  <span className="text-muted-foreground">
                    {" "}
                    — {catNameById.get(s.categoryId) ?? "—"}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {subcategories.data && sortedSubs.length === 0 && (
            <p className="text-xs text-muted-foreground mt-1.5">
              No aisles yet. Tap{" "}
              <span className="font-medium text-foreground">Create aisle</span>{" "}
              above to make your first one — you&apos;ll come right back here.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            id="price"
            label="Price (₹)"
            value={form.priceRupees}
            onChange={(v) => set("priceRupees", v)}
            type="number"
            inputMode="decimal"
            className="tabular-nums"
            required
          />
          <div>
            <Label className="mb-2 block">Unit</Label>
            <Select value={form.unit} onValueChange={(v) => set("unit", v as Unit)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Field
          id="description"
          label="Description (optional)"
          value={form.description}
          onChange={(v) => set("description", v)}
          maxLength={1000}
        />

        <ImageUpload
          label="Product image (optional)"
          aspect="square"
          value={form.imageUrl || null}
          onUpload={(file) => uploadToCloudinary(api, "product", file)}
          onChange={(result) =>
            setForm((f) => ({
              ...f,
              imageUrl: result?.url ?? "",
              imagePublicId: result?.publicId ?? null,
            }))
          }
        />

        {/* Phase 6.8 — optional product discount */}
        <div className="space-y-3 rounded-[var(--radius-md)] border border-border p-4">
          <Label className="block">Discount (optional)</Label>
          <Select
            value={form.discountType === "" ? "NONE" : form.discountType}
            onValueChange={(v) =>
              setForm((f) => ({
                ...f,
                discountType: v === "NONE" ? "" : (v as DiscountChoice),
                ...(v === "NONE"
                  ? { discountValueInput: "", discountValidUntil: "" }
                  : {}),
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">No discount</SelectItem>
              <SelectItem value="PERCENT">Percentage off</SelectItem>
              <SelectItem value="FLAT_PAISE">Flat amount off</SelectItem>
            </SelectContent>
          </Select>

          {form.discountType !== "" && (
            <>
              <Field
                id="discount-value"
                label={
                  form.discountType === "PERCENT"
                    ? "Percent off (1–100)"
                    : "Amount off (₹)"
                }
                value={form.discountValueInput}
                onChange={(v) => set("discountValueInput", v)}
                inputMode="decimal"
                placeholder={form.discountType === "PERCENT" ? "e.g. 20" : "e.g. 15"}
              />
              <div>
                <Label htmlFor="discount-expiry" className="mb-2 block">
                  Discount ends (optional)
                </Label>
                <Input
                  id="discount-expiry"
                  type="date"
                  value={form.discountValidUntil}
                  onChange={(e) => set("discountValidUntil", e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        <div>
          <Label className="mb-2 block">
            Search aliases <span className="text-muted-foreground">(English, Romanized Hindi, native script)</span>
          </Label>
          <div className="flex flex-wrap gap-2 mb-2">
            {form.searchAliases.map((alias) => (
              <span
                key={alias}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-surface-strong text-foreground text-xs font-medium"
              >
                {alias}
                <button
                  type="button"
                  onClick={() => removeAlias(alias)}
                  className="-mr-1 size-4 rounded-full inline-flex items-center justify-center hover:bg-border"
                  aria-label="Remove alias"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={form.aliasInput}
              onChange={(e) => set("aliasInput", e.target.value)}
              placeholder="doodh, अमूल, milk…"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault()
                  addAlias()
                }
              }}
              maxLength={100}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={addAlias}
              disabled={form.searchAliases.length >= 20}
            >
              Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            Up to 20. Lowercased and deduplicated server-side.
          </p>
        </div>

        <label className="flex items-center justify-between p-3 rounded-[var(--radius-lg)] bg-muted">
          <span>
            <span className="text-sm font-medium">In stock</span>
            <p className="text-xs text-muted-foreground mt-0.5">
              Customers can add to cart when on.
            </p>
          </span>
          <input
            type="checkbox"
            checked={form.isAvailable}
            onChange={(e) => set("isAvailable", e.target.checked)}
            className="size-5 rounded accent-primary"
          />
        </label>

        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="flex-1"
            size="lg"
            disabled={save.isPending}
          >
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            {product ? "Save changes" : "Add product"}
          </Button>
        </div>
      </form>

      {/* Phase 6.6 — inline create-aisle dialog. Submits to the same
          POST /v1/stores/me/subcategories endpoint as the Aisles page;
          on success, auto-selects the new aisle on this form. */}
      <Dialog open={aisleDialogOpen} onOpenChange={setAisleDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New aisle</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!newAisleCategoryId) {
                toast.error("Pick a category first")
                return
              }
              if (!newAisleName.trim()) {
                toast.error("Aisle name is required")
                return
              }
              createAisle.mutate()
            }}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="aisle-cat" className="mb-2 block">
                Category
              </Label>
              <Select
                value={newAisleCategoryId}
                onValueChange={setNewAisleCategoryId}
              >
                <SelectTrigger id="aisle-cat">
                  <SelectValue placeholder="Pick a marketplace category" />
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
                Pick the marketplace shelf your aisle fits under.
              </p>
            </div>
            <div>
              <Label htmlFor="aisle-name" className="mb-2 block">
                Aisle name
              </Label>
              <Input
                id="aisle-name"
                value={newAisleName}
                onChange={(e) => setNewAisleName(e.target.value)}
                placeholder="e.g. Basmati Rice"
                maxLength={80}
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAisleDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createAisle.isPending}>
                {createAisle.isPending && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

interface FieldProps {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
  required?: boolean
  maxLength?: number
  placeholder?: string
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
  required,
  maxLength,
  placeholder,
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
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        className={className}
      />
      {helper && (
        <p className="text-xs text-muted-foreground mt-1.5">{helper}</p>
      )}
    </div>
  )
}
