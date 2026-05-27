"use client"

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
} from "@workspace/ui/components/dialog"
import { EmptyState } from "@workspace/ui/components/empty-state"
import { ErrorState } from "@workspace/ui/components/error-state"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { Check, Loader2, Users, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { describeApiError } from "@/lib/format"

type RejectState = {
  ownerId: string
  ownerName: string
  reason: string
} | null

export default function OwnersPage() {
  const api = useApi()
  const queryClient = useQueryClient()
  const [reject, setReject] = useState<RejectState>(null)

  const pending = useQuery({
    queryKey: ["admin", "pendingOwners"],
    queryFn: () => api.admin.pendingOwners(),
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["admin", "pendingOwners"] })
  }

  const approve = useMutation({
    mutationFn: (id: string) => api.admin.approveOwner(id),
    onSuccess: () => {
      invalidate()
      toast.success("Owner approved")
    },
    onError: (err) => toast.error(describeApiError(err)),
  })

  const rejectMut = useMutation({
    mutationFn: (id: string) => api.admin.rejectOwner(id),
    onSuccess: () => {
      invalidate()
      setReject(null)
      toast.success("Application rejected")
    },
    onError: (err) => toast.error(describeApiError(err)),
  })

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold">Pending owners</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Approve to issue them a store. Rejection deletes the application.
        </p>
      </header>

      {pending.isError && (
        <ErrorState
          title="Couldn't load pending owners"
          description="Try again in a moment."
          retry={() => pending.refetch()}
        />
      )}

      {!pending.isError && pending.data && pending.data.length === 0 && (
        <EmptyState
          icon={<Users className="size-5" />}
          title="No pending applications"
          description="When an owner applies, they'll appear here for review."
        />
      )}

      {!pending.isError && (pending.isPending || (pending.data && pending.data.length > 0)) && (
        <Card className="overflow-hidden">
          {/* Horizontal scroll on narrow viewports so the 4-col table
              doesn't squeeze its action buttons into the wall. */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-muted">
                <tr className="text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Applied</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.isPending &&
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-t border-border/50">
                      <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Skeleton className="h-9 w-20" />
                          <Skeleton className="h-9 w-24" />
                        </div>
                      </td>
                    </tr>
                  ))}
                {pending.data?.map((owner) => (
                  <tr key={owner.id} className="border-t border-border/50">
                    <td className="px-4 py-3 font-medium">{owner.name}</td>
                    <td className="px-4 py-3 tabular-nums">{owner.phone}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {new Date(owner.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setReject({
                              ownerId: owner.id,
                              ownerName: owner.name,
                              reason: "",
                            })
                          }
                          disabled={approve.isPending || rejectMut.isPending}
                          className="text-destructive hover:text-destructive"
                        >
                          <X className="size-4" />
                          Reject
                        </Button>
                        <ConfirmButton
                          size="sm"
                          onConfirm={() => approve.mutate(owner.id)}
                          title={`Approve ${owner.name}?`}
                          description={`${owner.name} will be able to log in and set up their store immediately.`}
                          confirmLabel="Approve"
                          disabled={approve.isPending || rejectMut.isPending}
                        >
                          {approve.isPending ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Check className="size-4" />
                          )}
                          Approve
                        </ConfirmButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog
        open={reject !== null}
        onOpenChange={(o) => {
          if (!o) setReject(null)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reject {reject?.ownerName}?</DialogTitle>
            <DialogDescription>
              This deletes the application. Add a reason for your records — it
              isn&apos;t sent to the applicant yet.
            </DialogDescription>
          </DialogHeader>
          <textarea
            placeholder="Reason for rejection"
            value={reject?.reason ?? ""}
            onChange={(e) =>
              setReject((prev) =>
                prev ? { ...prev, reason: e.target.value } : prev,
              )
            }
            className="w-full min-h-24 rounded-[var(--radius-lg)] border border-input bg-background p-3 text-sm"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReject(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => reject && rejectMut.mutate(reject.ownerId)}
              disabled={rejectMut.isPending || (reject?.reason ?? "").trim().length === 0}
            >
              {rejectMut.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
