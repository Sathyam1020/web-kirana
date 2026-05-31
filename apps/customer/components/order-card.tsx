"use client"

/**
 * Compact order card used in the orders list and (eventually) the active-
 * order rail at the top of the orders page. Variants:
 *
 *   - "active"  → live status pill + progress dots + Track CTA + call store
 *   - "past"    → date, items summary, total, Reorder CTA
 *   - "cancelled" / "rejected" → muted treatment + Reorder-from-another-store
 *
 * Visual variant is computed from `order.status` so callers just pass the
 * OrderView; no need to thread a separate prop.
 */

import type { OrderStatus, OrderView } from "@workspace/api-client"
import { Phone, RefreshCw } from "lucide-react"
import Link from "next/link"
import { motion } from "motion/react"

import { cn } from "@workspace/ui/lib/utils"
import { springs, tapScale, useMotionPreset } from "@workspace/ui/lib/motion"
import { formatPriceFromPaise } from "@/lib/format"

const ACTIVE: OrderStatus[] = ["PLACED", "ACCEPTED", "OUT_FOR_DELIVERY"]
const FAILED: OrderStatus[] = ["REJECTED", "CANCELLED"]

const STATUS_LABEL: Record<OrderStatus, string> = {
  PLACED: "Order placed",
  ACCEPTED: "Accepted",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
}

interface OrderCardProps {
  order: OrderView
  /** Click "Reorder" — opens the reorder dialog. */
  onReorder?: () => void
  className?: string
}

export function OrderCard({ order, onReorder, className }: OrderCardProps) {
  const isActive = ACTIVE.includes(order.status)
  const isFailed = FAILED.includes(order.status)
  const tap = useMotionPreset(springs.tap)

  const itemsLabel = `${order.items.length} item${order.items.length === 1 ? "" : "s"}`
  const summary = order.items
    .slice(0, 3)
    .map((i) => i.nameSnapshot)
    .join(", ")
  const extra = order.items.length > 3 ? ` +${order.items.length - 3} more` : ""

  return (
    <motion.div
      whileTap={{ scale: 0.99 }}
      transition={tap}
      className={cn(
        "rounded-[var(--radius-md)] border border-border bg-card overflow-hidden",
        className,
      )}
    >
      <Link
        href={`/orders/${order.id}`}
        className="block p-3 hover:bg-surface-soft transition-colors focus-visible:outline-none focus-visible:bg-surface-soft"
      >
        {/* Status pill — active green-ish, failed muted-warm, delivered subtle */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <StatusPill status={order.status} />
          <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
            {new Date(order.placedAt).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
            })}{" "}
            ·{" "}
            {new Date(order.placedAt).toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        </div>

        <h3 className="text-sm font-semibold leading-tight truncate text-foreground">
          {order.store.nameSnapshot}
        </h3>
        <p className="text-xs text-muted-foreground mt-1 leading-snug line-clamp-1">
          {itemsLabel} · {summary}
          {extra}
        </p>
        <div className="flex items-center justify-between mt-2">
          <span className="text-sm font-bold tabular-nums">
            {formatPriceFromPaise(order.totalPaise)}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {order.paymentMethod === "COD" ? "COD" : "Paid"}
          </span>
        </div>
      </Link>

      {/* Footer action row — depends on status */}
      {isActive ? (
        <ActiveFooter order={order} />
      ) : isFailed ? (
        <FailedFooter onReorder={onReorder} />
      ) : (
        <PastFooter onReorder={onReorder} />
      )}
    </motion.div>
  )
}

function StatusPill({ status }: { status: OrderStatus }) {
  const active = ACTIVE.includes(status)
  const failed = FAILED.includes(status)
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold leading-none",
        active && "bg-success-soft text-success",
        failed && "bg-destructive/10 text-destructive",
        !active && !failed && "bg-surface-strong text-foreground",
      )}
    >
      {active ? (
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-success" />
        </span>
      ) : null}
      {STATUS_LABEL[status]}
    </span>
  )
}

function ActiveFooter({ order }: { order: OrderView }) {
  return (
    <div className="border-t border-border-soft px-3 py-2 flex items-center gap-2 bg-card">
      <Link
        href={`/orders/${order.id}`}
        className="flex-1 inline-flex items-center justify-center h-9 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary-active transition-colors"
      >
        Track order
      </Link>
      <a
        href={`tel:${order.store.phoneSnapshot}`}
        aria-label={`Call ${order.store.nameSnapshot}`}
        className="inline-flex size-9 items-center justify-center rounded-full border border-border text-foreground hover:bg-surface-soft transition-colors"
      >
        <Phone className="size-3.5" aria-hidden />
      </a>
    </div>
  )
}

function PastFooter({ onReorder }: { onReorder?: () => void }) {
  if (!onReorder) return null
  const tap = useMotionPresetTap()
  return (
    <div className="border-t border-border-soft px-3 py-2 flex justify-end bg-card">
      <motion.button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onReorder()
        }}
        whileTap={{ scale: tapScale }}
        transition={tap}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-primary text-primary text-xs font-semibold hover:bg-primary/5 transition-colors"
      >
        <RefreshCw className="size-3.5" aria-hidden />
        Reorder
      </motion.button>
    </div>
  )
}

function FailedFooter({ onReorder }: { onReorder?: () => void }) {
  if (!onReorder) return null
  const tap = useMotionPresetTap()
  return (
    <div className="border-t border-border-soft px-3 py-2 flex justify-end bg-card">
      <motion.button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onReorder()
        }}
        whileTap={{ scale: tapScale }}
        transition={tap}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary-active transition-colors"
      >
        <RefreshCw className="size-3.5" aria-hidden />
        Reorder
      </motion.button>
    </div>
  )
}

// Local helper to avoid duplicating the import in two sibling helpers.
function useMotionPresetTap() {
  return useMotionPreset(springs.tap)
}
