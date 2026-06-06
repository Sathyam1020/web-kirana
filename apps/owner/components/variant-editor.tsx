"use client"

/**
 * IP-2 — Owner-side variant editor. A vertical list of rows where each
 * row is one size (e.g. "500 g", "1 kg"). The owner can:
 *   - Add a row
 *   - Rename / edit qty + unit + price per row
 *   - Toggle per-row availability (out of stock without deleting)
 *   - Pick exactly one row as the product's default (radio across rows)
 *   - Upload an optional per-row image (falls back to the product image)
 *   - Delete a row (AlertDialog confirm for rows with an existing id)
 *   - Drag rows to reorder (HTML5 drag — desktop; mobile owners use the
 *     up/down arrow fallback)
 *
 * Stateless wrt persistence: the parent owns the `variants` array, this
 * component just emits onChange on every mutation. Validation happens
 * server-side (zod refines exactly-one-default + name uniqueness +
 * positive numbers); the editor surfaces simple inline errors.
 */

import type { ProductVariantInput, Unit } from "@workspace/api-client"
import { uploadToCloudinary } from "@workspace/api-client"
import { useApi } from "@workspace/auth"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
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
import { cn } from "@workspace/ui/lib/utils"
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from "lucide-react"
import { useState } from "react"

import { rupeesToPaise, paiseToRupees } from "@/lib/format"

const UNITS: Unit[] = ["KG", "G", "L", "ML", "PIECE", "PACK", "DOZEN"]

/**
 * Editor-local row shape. Maps 1:1 to ProductVariantInput on submit but
 * lets each row store price as a string (for inline editing) and an
 * always-defined sortOrder.
 */
export interface VariantRow {
  // Stable client-only id used as React key + for drag-tracking. NOT
  // submitted to the server. New rows get a fresh uuid; existing rows
  // already have a server id which we pass through via serverId.
  rowKey: string
  /** Present iff the variant already exists server-side. */
  serverId?: string
  name: string
  unitValue: string
  unit: Unit
  priceRupees: string
  isAvailable: boolean
  isDefault: boolean
  sortOrder: number
  imageUrl: string | null
  imagePublicId: string | null
}

interface VariantEditorProps {
  rows: VariantRow[]
  onChange: (next: VariantRow[]) => void
}

export function VariantEditor({ rows, onChange }: VariantEditorProps) {
  // Hooks at component top — never call useApi() inside the row map
  // (that would violate rules-of-hooks across renders).
  const api = useApi()
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null)

  function update(i: number, patch: Partial<VariantRow>): void {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r))
    onChange(next)
  }

  function setDefault(i: number): void {
    // Radio semantics across rows — exactly one true.
    onChange(rows.map((r, idx) => ({ ...r, isDefault: idx === i })))
  }

  function addRow(): void {
    const next: VariantRow = {
      rowKey: crypto.randomUUID(),
      name: "",
      unitValue: "1",
      unit: "PIECE",
      priceRupees: "",
      isAvailable: true,
      // If this is the only row, it's also the default. Otherwise leave
      // the existing default alone.
      isDefault: rows.length === 0,
      sortOrder: rows.length,
      imageUrl: null,
      imagePublicId: null,
    }
    onChange([...rows, next])
  }

  function removeAt(i: number): void {
    const row = rows[i]
    if (row === undefined) return
    const wasDefault = row.isDefault
    const next = rows
      .filter((_, idx) => idx !== i)
      .map((r, idx) => ({ ...r, sortOrder: idx }))
    // If we removed the default and there's still at least one row,
    // promote the first row as the new default so the invariant holds.
    if (wasDefault && next.length > 0 && next[0] !== undefined) {
      next[0] = { ...next[0], isDefault: true }
    }
    onChange(next)
    setConfirmDeleteIndex(null)
  }

  function move(from: number, to: number): void {
    if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return
    const next = [...rows]
    const moved = next.splice(from, 1)[0]
    if (moved === undefined) return
    next.splice(to, 0, moved)
    onChange(next.map((r, idx) => ({ ...r, sortOrder: idx })))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">
          Sizes
          <span className="text-muted-foreground font-normal ml-2">
            ({rows.length} {rows.length === 1 ? "variant" : "variants"})
          </span>
        </Label>
        <Button type="button" variant="secondary" size="sm" onClick={addRow}>
          <Plus className="size-3.5" />
          Add size
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-surface-soft p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Add at least one size for this product. e.g. &ldquo;500 g&rdquo;, &ldquo;1
            kg&rdquo;, or &ldquo;Pack of 6&rdquo;.
          </p>
          <Button type="button" className="mt-3" onClick={addRow}>
            <Plus className="size-3.5" /> Add the first size
          </Button>
        </div>
      ) : null}

      {rows.map((row, i) => (
        <div
          key={row.rowKey}
          draggable
          onDragStart={(e) => {
            setDragIndex(i)
            e.dataTransfer.effectAllowed = "move"
          }}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = "move"
            if (overIndex !== i) setOverIndex(i)
          }}
          onDragLeave={() => {
            if (overIndex === i) setOverIndex(null)
          }}
          onDrop={(e) => {
            e.preventDefault()
            if (dragIndex !== null && dragIndex !== i) move(dragIndex, i)
            setDragIndex(null)
            setOverIndex(null)
          }}
          onDragEnd={() => {
            setDragIndex(null)
            setOverIndex(null)
          }}
          className={cn(
            "rounded-[var(--radius-md)] border bg-card p-3 space-y-3",
            dragIndex === i && "opacity-50",
            overIndex === i && dragIndex !== null && dragIndex !== i
              ? "border-primary ring-2 ring-primary/30"
              : "border-border",
          )}
        >
          {/* Row 1 — drag handle + image + name + delete */}
          <div className="flex items-start gap-2">
            <div className="flex flex-col gap-0.5 mt-1 shrink-0 cursor-grab text-muted-foreground hover:text-foreground transition-colors">
              <GripVertical className="size-4" aria-hidden />
            </div>
            <div className="shrink-0 w-12">
              <ImageUpload
                label=""
                aspect="square"
                value={row.imageUrl}
                onUpload={(file) => uploadToCloudinary(api, "product", file)}
                onChange={(result) =>
                  update(i, {
                    imageUrl: result?.url ?? null,
                    imagePublicId: result?.publicId ?? null,
                  })
                }
              />
            </div>
            <div className="flex-1 min-w-0">
              <Input
                value={row.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="e.g. 500 g, 1 kg, Pack of 6"
                maxLength={80}
                className="font-semibold"
              />
              {row.imageUrl === null ? (
                <p className="text-[11px] text-muted-foreground mt-1">
                  No image — uses the product image
                </p>
              ) : null}
            </div>
            <div className="shrink-0 flex flex-col gap-1">
              {/* Mobile / fallback reorder controls — drag-and-drop is
                  desktop-only; arrows give touch users a way. */}
              <button
                type="button"
                onClick={() => move(i, i - 1)}
                disabled={i === 0}
                aria-label="Move up"
                className="size-7 inline-flex items-center justify-center rounded-md text-muted-foreground disabled:opacity-30 hover:bg-surface-soft hover:text-foreground transition-colors"
              >
                <ChevronUp className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => move(i, i + 1)}
                disabled={i === rows.length - 1}
                aria-label="Move down"
                className="size-7 inline-flex items-center justify-center rounded-md text-muted-foreground disabled:opacity-30 hover:bg-surface-soft hover:text-foreground transition-colors"
              >
                <ChevronDown className="size-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() =>
                row.serverId !== undefined
                  ? setConfirmDeleteIndex(i)
                  : removeAt(i)
              }
              aria-label="Delete size"
              className="size-8 mt-1 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="size-4" />
            </button>
          </div>

          {/* Row 2 — qty / unit / price */}
          <div className="grid grid-cols-[1fr_1.2fr_1.2fr] gap-2">
            <div>
              <Label className="text-[11px] text-muted-foreground mb-1 block">
                Qty
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                value={row.unitValue}
                onChange={(e) => update(i, { unitValue: e.target.value })}
                min="0"
                step="0.01"
                placeholder="500"
                className="tabular-nums"
              />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground mb-1 block">
                Unit
              </Label>
              <Select
                value={row.unit}
                onValueChange={(v) => update(i, { unit: v as Unit })}
              >
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
            <div>
              <Label className="text-[11px] text-muted-foreground mb-1 block">
                Price (₹)
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                value={row.priceRupees}
                onChange={(e) => update(i, { priceRupees: e.target.value })}
                min="1"
                placeholder="49"
                className="tabular-nums"
              />
            </div>
          </div>

          {/* Row 3 — default radio + in-stock toggle */}
          <div className="flex items-center gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="default-variant"
                checked={row.isDefault}
                onChange={() => setDefault(i)}
                className="size-4 accent-primary"
              />
              <span className="font-medium">Default</span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={row.isAvailable}
                onChange={(e) => update(i, { isAvailable: e.target.checked })}
                className="size-4 accent-primary rounded"
              />
              <span className="font-medium">In stock</span>
            </label>
          </div>
        </div>
      ))}

      {/* AlertDialog — confirm before deleting an existing (server-known)
          variant. Historical orders survive via SetNull + snapshots, but
          owners shouldn't drop a SKU by mistake. */}
      <AlertDialog
        open={confirmDeleteIndex !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteIndex(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this size?</AlertDialogTitle>
            <AlertDialogDescription>
              Past orders that bought this size are kept intact — only the
              size itself is removed from the catalog. This can&rsquo;t be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDeleteIndex !== null) removeAt(confirmDeleteIndex)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Serialisation helpers — convert between editor rows and the api-client
// ProductVariantInput / ProductVariantView shapes.
// ---------------------------------------------------------------------------

/** Build editor rows from an existing product's variants. */
export function rowsFromVariants(
  variants: Array<{
    id: string
    name: string
    unitValue: string
    unit: Unit
    pricePaise: number
    isAvailable: boolean
    isDefault: boolean
    sortOrder: number
    imageUrl: string | null
    imagePublicId: string | null
  }>,
): VariantRow[] {
  return variants
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((v) => ({
      rowKey: crypto.randomUUID(),
      serverId: v.id,
      name: v.name,
      unitValue: v.unitValue,
      unit: v.unit,
      priceRupees: paiseToRupees(v.pricePaise),
      isAvailable: v.isAvailable,
      isDefault: v.isDefault,
      sortOrder: v.sortOrder,
      imageUrl: v.imageUrl,
      imagePublicId: v.imagePublicId,
    }))
}

/** Convert editor rows back to the ProductVariantInput[] body expected by
 *  create/update endpoints. Throws on malformed numbers — callers should
 *  surface the error via toast. */
export function rowsToVariants(rows: VariantRow[]): ProductVariantInput[] {
  return rows.map((row, idx) => {
    const unitValueNum = Number(row.unitValue)
    if (!Number.isFinite(unitValueNum) || unitValueNum <= 0) {
      throw new Error(`Variant "${row.name || idx + 1}": qty must be > 0`)
    }
    const pricePaise = rupeesToPaise(row.priceRupees)
    if (pricePaise < 100) {
      throw new Error(`Variant "${row.name || idx + 1}": price must be ≥ ₹1`)
    }
    if (row.name.trim().length === 0) {
      throw new Error(`Variant ${idx + 1}: name is required`)
    }
    return {
      id: row.serverId,
      name: row.name.trim(),
      unitValue: unitValueNum,
      unit: row.unit,
      pricePaise,
      isAvailable: row.isAvailable,
      isDefault: row.isDefault,
      sortOrder: idx,
      imageUrl: row.imageUrl,
      imagePublicId: row.imagePublicId,
    }
  })
}

/** A single fresh row, pre-filled — used when the parent wants to seed a
 *  product create with one starter row. */
export function emptyVariantRow(): VariantRow {
  return {
    rowKey: crypto.randomUUID(),
    name: "",
    unitValue: "1",
    unit: "PIECE",
    priceRupees: "",
    isAvailable: true,
    isDefault: true,
    sortOrder: 0,
    imageUrl: null,
    imagePublicId: null,
  }
}
