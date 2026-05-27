"use client"

import type { Coupon, CouponType, CreateCouponBody } from "@workspace/api-client"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Loader2 } from "lucide-react"
import { useState } from "react"
import { rupeesToPaise } from "@/lib/format"

interface State {
  code: string
  type: CouponType
  value: string
  maxDiscountRupees: string
  minOrderRupees: string
  validUntil: string
  isActive: boolean
  totalUsageLimit: string
  perUserLimit: string
}

function emptyState(): State {
  return {
    code: "",
    type: "PERCENT",
    value: "",
    maxDiscountRupees: "",
    minOrderRupees: "0",
    validUntil: "",
    isActive: true,
    totalUsageLimit: "",
    perUserLimit: "1",
  }
}

function fromCoupon(c: Coupon): State {
  return {
    code: c.code,
    type: c.type,
    value: String(c.value),
    maxDiscountRupees:
      c.maxDiscountPaise === null ? "" : (c.maxDiscountPaise / 100).toString(),
    minOrderRupees: (c.minOrderPaise / 100).toString(),
    validUntil: c.validUntil ? c.validUntil.slice(0, 10) : "",
    isActive: c.isActive,
    totalUsageLimit: c.totalUsageLimit === null ? "" : String(c.totalUsageLimit),
    perUserLimit: String(c.perUserLimit),
  }
}

interface Props {
  coupon?: Coupon
  busy?: boolean
  onCancel: () => void
  onSubmit: (body: CreateCouponBody, isEdit: boolean) => void
}

export function CouponForm({ coupon, busy, onCancel, onSubmit }: Props) {
  const [s, setS] = useState<State>(coupon ? fromCoupon(coupon) : emptyState())

  function set<K extends keyof State>(k: K, v: State[K]) {
    setS((prev) => ({ ...prev, [k]: v }))
  }

  function build(): CreateCouponBody {
    const value = Number(s.value)
    return {
      code: s.code,
      type: s.type,
      value,
      maxDiscountPaise:
        s.maxDiscountRupees.trim() === ""
          ? null
          : rupeesToPaise(s.maxDiscountRupees),
      minOrderPaise:
        s.minOrderRupees.trim() === "" ? 0 : rupeesToPaise(s.minOrderRupees),
      validUntil:
        s.validUntil.trim() === ""
          ? null
          : new Date(s.validUntil).toISOString(),
      isActive: s.isActive,
      totalUsageLimit:
        s.totalUsageLimit.trim() === "" ? null : Number(s.totalUsageLimit),
      perUserLimit:
        s.perUserLimit.trim() === "" ? 1 : Number(s.perUserLimit),
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (busy) return
        onSubmit(build(), Boolean(coupon))
      }}
      className="space-y-4"
    >
      <div>
        <Label htmlFor="code" className="mb-2 block">
          Code
        </Label>
        <Input
          id="code"
          value={s.code}
          onChange={(e) => set("code", e.target.value.toUpperCase())}
          required
          minLength={3}
          maxLength={40}
          placeholder="WELCOME10"
          className="tabular-nums"
          disabled={Boolean(coupon)}
        />
        {coupon && (
          <p className="text-xs text-muted-foreground mt-1.5">
            Codes can&apos;t be renamed after creation.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="mb-2 block">Type</Label>
          <Select
            value={s.type}
            onValueChange={(v) => set("type", v as CouponType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PERCENT">Percent off</SelectItem>
              <SelectItem value="FLAT_PAISE">Flat amount</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="value" className="mb-2 block">
            {s.type === "PERCENT" ? "% off" : "Discount (paise)"}
          </Label>
          <Input
            id="value"
            type="number"
            inputMode="numeric"
            value={s.value}
            onChange={(e) => set("value", e.target.value)}
            required
            className="tabular-nums"
          />
        </div>
      </div>

      {s.type === "PERCENT" && (
        <div>
          <Label htmlFor="maxDiscount" className="mb-2 block">
            Max discount (₹, optional)
          </Label>
          <Input
            id="maxDiscount"
            type="number"
            inputMode="decimal"
            value={s.maxDiscountRupees}
            onChange={(e) => set("maxDiscountRupees", e.target.value)}
            className="tabular-nums"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="minOrder" className="mb-2 block">
            Min order (₹)
          </Label>
          <Input
            id="minOrder"
            type="number"
            inputMode="decimal"
            value={s.minOrderRupees}
            onChange={(e) => set("minOrderRupees", e.target.value)}
            className="tabular-nums"
          />
        </div>
        <div>
          <Label htmlFor="validUntil" className="mb-2 block">
            Valid until
          </Label>
          <Input
            id="validUntil"
            type="date"
            value={s.validUntil}
            onChange={(e) => set("validUntil", e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="perUser" className="mb-2 block">
            Per-user limit
          </Label>
          <Input
            id="perUser"
            type="number"
            inputMode="numeric"
            value={s.perUserLimit}
            onChange={(e) => set("perUserLimit", e.target.value)}
            className="tabular-nums"
          />
        </div>
        <div>
          <Label htmlFor="totalUsage" className="mb-2 block">
            Total uses (optional)
          </Label>
          <Input
            id="totalUsage"
            type="number"
            inputMode="numeric"
            value={s.totalUsageLimit}
            onChange={(e) => set("totalUsageLimit", e.target.value)}
            className="tabular-nums"
          />
        </div>
      </div>

      <label className="flex items-center justify-between p-3 rounded-[var(--radius-lg)] bg-muted">
        <span className="text-sm font-medium">Active</span>
        <input
          type="checkbox"
          checked={s.isActive}
          onChange={(e) => set("isActive", e.target.checked)}
          className="size-5 accent-primary"
        />
      </label>

      <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          className="flex-1"
          size="lg"
          disabled={busy}
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          {coupon ? "Save coupon" : "Create coupon"}
        </Button>
      </div>
    </form>
  )
}
