"use client"

import { useApi } from "@workspace/auth"
import type {
  Category,
  CreateProductBody,
  ProductOwnerView,
  Unit,
  UpdateProductBody,
} from "@workspace/api-client"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { describeApiError, rupeesToPaise, paiseToRupees } from "@/lib/format"

const UNITS: Unit[] = ["KG", "G", "L", "ML", "PIECE", "PACK", "DOZEN"]

interface FormState {
  name: string
  categoryId: string
  description: string
  priceRupees: string
  unit: Unit
  imageUrl: string
  isAvailable: boolean
  aliasInput: string
  searchAliases: string[]
}

function emptyForm(): FormState {
  return {
    name: "",
    categoryId: "",
    description: "",
    priceRupees: "",
    unit: "PIECE",
    imageUrl: "",
    isAvailable: true,
    aliasInput: "",
    searchAliases: [],
  }
}

function fromProduct(p: ProductOwnerView): FormState {
  return {
    name: p.name,
    categoryId: p.categoryId,
    description: p.description ?? "",
    priceRupees: paiseToRupees(p.pricePaise),
    unit: p.unit,
    imageUrl: p.imageUrl ?? "",
    isAvailable: p.isAvailable,
    aliasInput: "",
    searchAliases: p.searchAliases,
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

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.categories.list(),
  })

  const save = useMutation({
    mutationFn: async () => {
      const pricePaise = rupeesToPaise(form.priceRupees)
      if (pricePaise < 100) {
        throw new Error("Price must be at least ₹1.00")
      }
      const base = {
        name: form.name.trim(),
        categoryId: form.categoryId,
        description: form.description.trim(),
        pricePaise,
        unit: form.unit,
        imageUrl: form.imageUrl.trim(),
        searchAliases: form.searchAliases,
      }
      if (product) {
        const patch: UpdateProductBody = {
          name: base.name,
          categoryId: base.categoryId,
          description: base.description === "" ? null : base.description,
          pricePaise: base.pricePaise,
          unit: base.unit,
          imageUrl: base.imageUrl === "" ? null : base.imageUrl,
          isAvailable: form.isAvailable,
          searchAliases: base.searchAliases,
        }
        return api.products.update(product.id, patch)
      }
      const body: CreateProductBody = {
        ...base,
        description: base.description === "" ? undefined : base.description,
        imageUrl: base.imageUrl === "" ? undefined : base.imageUrl,
        isAvailable: form.isAvailable,
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
          if (!form.categoryId) {
            toast.error("Pick a category")
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

        <div>
          <Label className="mb-2 block">Category</Label>
          <Select
            value={form.categoryId}
            onValueChange={(v) => set("categoryId", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Pick a category" />
            </SelectTrigger>
            <SelectContent>
              {categories.data?.map((c: Category) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

        <Field
          id="imageUrl"
          label="Image URL (optional)"
          value={form.imageUrl}
          onChange={(v) => set("imageUrl", v)}
          placeholder="https://"
          maxLength={500}
          helper="Image uploads land in Phase 12. Paste a URL until then."
        />

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
