"use client"

import { useApi } from "@workspace/auth"
import type { Coupon, CreateCouponBody } from "@workspace/api-client"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { ConfirmButton } from "@workspace/ui/components/confirm-button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { ErrorState } from "@workspace/ui/components/error-state"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { Pencil, Plus, Ticket, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { CouponForm } from "@/components/coupon-form"
import { describeApiError, formatPriceFromPaise } from "@/lib/format"

export default function CouponsPage() {
  const api = useApi()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Coupon | null>(null)

  const list = useQuery({
    queryKey: ["admin", "coupons"],
    queryFn: () => api.coupons.adminList(),
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin", "coupons"] })
  }

  const save = useMutation({
    mutationFn: ({
      body,
      id,
    }: {
      body: CreateCouponBody
      id?: string
    }) => {
      if (id) {
        const { code: _c, ...patch } = body
        void _c
        return api.coupons.adminUpdate(id, patch)
      }
      return api.coupons.adminCreate(body)
    },
    onSuccess: () => {
      invalidate()
      setOpen(false)
      setEditing(null)
      toast.success(editing ? "Coupon updated" : "Coupon created")
    },
    onError: (err) => toast.error(describeApiError(err)),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.coupons.adminRemove(id),
    onSuccess: () => {
      invalidate()
      toast.success("Coupon removed")
    },
    onError: (err) => toast.error(describeApiError(err)),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Global coupons</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Marketplace-wide promotions. Owner-scoped coupons live in each store.
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
            <Button
              onClick={() => {
                setEditing(null)
                setOpen(true)
              }}
            >
              <Plus className="size-4" />
              New
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit coupon" : "New coupon"}
              </DialogTitle>
            </DialogHeader>
            <CouponForm
              coupon={editing ?? undefined}
              busy={save.isPending}
              onCancel={() => setOpen(false)}
              onSubmit={(body) => save.mutate({ body, id: editing?.id })}
            />
          </DialogContent>
        </Dialog>
      </div>

      {list.isError && (
        <ErrorState
          title="Couldn't load coupons"
          description="Try again in a moment."
          retry={() => list.refetch()}
        />
      )}

      {list.data && list.data.items.length === 0 && (
        <EmptyState
          icon={<Ticket className="size-5" />}
          title="No coupons yet"
          description="Create a global coupon to run a marketplace promo."
          action={
            <Button
              onClick={() => {
                setEditing(null)
                setOpen(true)
              }}
            >
              Create coupon
            </Button>
          }
        />
      )}

      {(list.isPending || (list.data && list.data.items.length > 0)) && (
        <Card className="divide-y divide-border/50 overflow-hidden">
          {list.isPending &&
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-4">
                <Skeleton className="size-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-40" />
                </div>
                <Skeleton className="size-10 rounded-full" />
                <Skeleton className="size-10 rounded-full" />
              </div>
            ))}
          {list.data?.items.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-4">
              <span className="size-10 rounded-full bg-muted inline-flex items-center justify-center shrink-0">
                <Ticket className="size-4" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="tabular-nums font-semibold">{c.code}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {c.type === "PERCENT"
                    ? `${c.value}% off`
                    : `${formatPriceFromPaise(c.value)} off`}
                  {c.minOrderPaise > 0 && (
                    <> · min {formatPriceFromPaise(c.minOrderPaise)}</>
                  )}
                  {" · used "}
                  <span className="tabular-nums">
                    {c.usageCount}
                  </span>{" "}
                  times
                </p>
              </div>
              <span
                className={`text-[10px] uppercase tracking-wider font-bold rounded-full px-2 py-0.5 shrink-0 ${
                  c.isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {c.isActive ? "Active" : "Off"}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setEditing(c)
                  setOpen(true)
                }}
                aria-label="Edit coupon"
              >
                <Pencil className="size-4" />
              </Button>
              <ConfirmButton
                variant="ghost"
                size="icon"
                onConfirm={() => remove.mutate(c.id)}
                title={`Delete ${c.code}?`}
                description="The coupon will be soft-deleted and customers won't be able to use it anymore."
                confirmLabel="Delete"
                destructive
                disabled={remove.isPending}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </ConfirmButton>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
