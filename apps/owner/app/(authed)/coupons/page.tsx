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
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Coupon | null>(null)

  const list = useQuery({
    queryKey: ["coupons", "owner"],
    queryFn: () => api.coupons.ownerList(),
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["coupons", "owner"] })
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
        const { code: _code, ...patch } = body
        void _code
        return api.coupons.ownerUpdate(id, patch)
      }
      return api.coupons.ownerCreate(body)
    },
    onSuccess: () => {
      invalidate()
      setEditorOpen(false)
      setEditing(null)
      toast.success(editing ? "Coupon updated" : "Coupon created")
    },
    onError: (err) => toast.error(describeApiError(err)),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.coupons.ownerRemove(id),
    onSuccess: () => {
      invalidate()
      toast.success("Coupon removed")
    },
    onError: (err) => toast.error(describeApiError(err)),
  })

  function openCreate() {
    setEditing(null)
    setEditorOpen(true)
  }

  function openEdit(c: Coupon) {
    setEditing(c)
    setEditorOpen(true)
  }

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Coupons</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Discounts only valid at your store.
          </p>
        </div>
        <Dialog
          open={editorOpen}
          onOpenChange={(o) => {
            setEditorOpen(o)
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
                {editing ? "Edit coupon" : "New coupon"}
              </DialogTitle>
            </DialogHeader>
            <CouponForm
              coupon={editing ?? undefined}
              busy={save.isPending}
              onCancel={() => setEditorOpen(false)}
              onSubmit={(body) =>
                save.mutate({ body, id: editing?.id })
              }
            />
          </DialogContent>
        </Dialog>
      </div>

      {list.isPending && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      )}

      {list.isError && (
        <ErrorState
          title="Couldn't load your coupons"
          description="Try again in a moment."
          retry={() => list.refetch()}
        />
      )}

      {list.data && list.data.items.length === 0 && (
        <EmptyState
          icon={<Ticket className="size-5" />}
          title="No coupons yet"
          description="Run a promotion to bring people to your store."
          action={<Button onClick={openCreate}>Create coupon</Button>}
        />
      )}

      <ul className="space-y-2">
        {list.data?.items.map((c) => (
          <li key={c.id}>
            <Card className="p-4 flex items-center gap-3">
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
                  {c.validUntil && (
                    <>
                      {" · expires "}
                      <span className="tabular-nums">
                        {new Date(c.validUntil).toLocaleDateString()}
                      </span>
                    </>
                  )}
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
                onClick={() => openEdit(c)}
                aria-label="Edit coupon"
              >
                <Pencil className="size-4" />
              </Button>
              <ConfirmButton
                variant="ghost"
                size="icon"
                onConfirm={() => remove.mutate(c.id)}
                title={`Delete ${c.code}?`}
                description="Existing carts using this code will lose the discount on next preview."
                confirmLabel="Delete"
                destructive
                disabled={remove.isPending}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </ConfirmButton>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
