"use client"

/**
 * Vertical order-progress stepper used on the order-detail page.
 *
 * Renders the four happy-path steps (Placed → Accepted → Out for delivery
 * → Delivered) with:
 *   - done steps: filled Rausch dot + check + timestamp
 *   - current step: pulsing Rausch dot + label in bold
 *   - pending: muted dot + faded label
 *
 * Terminal failure paths (REJECTED, CANCELLED) are handled by a sibling
 * banner in the page — this component stays purely about happy-path
 * progression and ignores those statuses gracefully (renders nothing).
 */

import type { OrderStatus, OrderView } from "@workspace/api-client"
import { Check } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

const STEPS: Array<{
  status: OrderStatus
  label: string
  at: (o: OrderView) => string | null
}> = [
  { status: "PLACED", label: "Order placed", at: (o) => o.placedAt },
  { status: "ACCEPTED", label: "Accepted by store", at: (o) => o.acceptedAt },
  {
    status: "OUT_FOR_DELIVERY",
    label: "Out for delivery",
    at: (o) => o.outForDeliveryAt,
  },
  { status: "DELIVERED", label: "Delivered", at: (o) => o.deliveredAt },
]

const HAPPY_ORDER: OrderStatus[] = [
  "PLACED",
  "ACCEPTED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
]

export function OrderProgress({ order }: { order: OrderView }) {
  // Failure paths render their own banner upstream; nothing to step through.
  if (order.status === "REJECTED" || order.status === "CANCELLED") return null

  const currentIdx = HAPPY_ORDER.indexOf(order.status)

  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-card p-4">
      <ol className="space-y-0">
        {STEPS.map((step, i) => {
          const done = i < currentIdx
          const isCurrent = i === currentIdx
          const isLast = i === STEPS.length - 1
          const at = step.at(order)
          return (
            <li key={step.status} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "relative flex size-7 items-center justify-center rounded-full shrink-0",
                    done && "bg-primary text-primary-foreground",
                    isCurrent && "bg-primary text-primary-foreground",
                    !done && !isCurrent && "bg-surface-strong text-muted-foreground",
                  )}
                >
                  {done ? (
                    <Check className="size-3.5" strokeWidth={3} />
                  ) : isCurrent ? (
                    <>
                      <span
                        aria-hidden
                        className="absolute inline-flex size-7 rounded-full bg-primary/40 animate-ping"
                      />
                      <span className="relative inline-flex size-2 rounded-full bg-primary-foreground" />
                    </>
                  ) : (
                    <span className="size-1.5 rounded-full bg-current" />
                  )}
                </span>
                {!isLast ? (
                  <span
                    aria-hidden
                    className={cn(
                      "w-0.5 flex-1 min-h-8 my-1",
                      i < currentIdx ? "bg-primary" : "bg-border",
                    )}
                  />
                ) : null}
              </div>
              <div className={cn("pb-6", !done && !isCurrent && "opacity-60")}>
                <p
                  className={cn(
                    "text-sm leading-tight",
                    (done || isCurrent) && "font-semibold text-foreground",
                    !done && !isCurrent && "text-muted-foreground",
                  )}
                >
                  {step.label}
                </p>
                {at ? (
                  <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                    {new Date(at).toLocaleString(undefined, {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                ) : isCurrent && step.status === "OUT_FOR_DELIVERY" ? (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Your delivery partner is on the way.
                  </p>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
