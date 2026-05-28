"use client"

import type { OrderStatus } from "@workspace/api-client"
import { useApi, useAuthStore } from "@workspace/auth"
import { useQuery } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { ChevronUp, Package, ShoppingCart, X } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { useCart } from "@/lib/cart"
import { formatPriceFromPaise } from "@/lib/format"

const ACTIVE: OrderStatus[] = ["PLACED", "ACCEPTED", "OUT_FOR_DELIVERY"]

const SHORT_LABEL: Record<OrderStatus, string> = {
  PLACED: "Order placed",
  ACCEPTED: "Accepted",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
}

const SLIDE = {
  initial: { y: 60, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  exit: { y: 60, opacity: 0 },
  transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const },
}

const PILL_WIDTH = "w-[min(24rem,calc(100vw-2rem))]"

/**
 * The single owner of the customer's bottom-center bar. Stacks (top → bottom):
 * the live active-order tracker, then the cart "View cart" CTA — so a customer
 * shopping for a new order while a previous one is still out for delivery sees
 * both, cleanly, instead of two components fighting for the same slot.
 *
 * One active order → the tracker pill links straight to its page; multiple →
 * it expands a stacked list. Polls so it advances live and clears itself once
 * everything is delivered/cancelled. Mounted once in the root layout.
 */
export function CustomerBottomBar() {
  const api = useApi()
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)
  const pathname = usePathname() ?? ""
  const cart = useCart()
  const cartItems = cart.totalItems()
  const cartSubtotal = cart.subtotalPaise()
  const [expanded, setExpanded] = useState(false)

  const onBlockedScreen = ["/login", "/signup", "/checkout"].some((p) =>
    pathname.startsWith(p),
  )
  const isCustomer = status === "authenticated" && user?.role === "CUSTOMER"

  // /cart has its own fixed bottom checkout bar — keep this one off it so the
  // two don't stack. /orders* already shows every order, so no tracker there.
  const onCart = pathname.startsWith("/cart")
  const showOrders = isCustomer && !onBlockedScreen && !onCart && !pathname.startsWith("/orders")
  const showCart = !onBlockedScreen && !onCart && cartItems > 0

  const orders = useQuery({
    queryKey: ["orders"],
    queryFn: () => api.orders.list(),
    enabled: showOrders,
    // Realtime push keeps this fresh; slow fallback poll for socket downtime.
    refetchInterval: 60_000,
  })

  const active = showOrders
    ? (orders.data?.items ?? []).filter((o) => ACTIVE.includes(o.status))
    : []

  if (active.length === 0 && !showCart) return null

  return (
    <div className="fixed bottom-6 inset-x-0 z-40 flex flex-col items-center gap-2 px-4 pointer-events-none">
      {/* Expanded list when there are multiple active orders */}
      <AnimatePresence>
        {expanded && active.length > 1 && (
          <motion.div
            {...SLIDE}
            className={`pointer-events-auto ${PILL_WIDTH} rounded-[var(--radius-lg)] border border-border bg-card shadow-lg overflow-hidden`}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60">
              <span className="text-sm font-semibold">Active orders</span>
              <button
                onClick={() => setExpanded(false)}
                aria-label="Collapse"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <ul className="max-h-64 overflow-y-auto divide-y divide-border/60">
              {active.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/orders/${o.id}`}
                    onClick={() => setExpanded(false)}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-soft transition-colors"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium truncate">
                        {o.store.nameSnapshot}
                      </span>
                      <span className="block text-xs text-primary">{SHORT_LABEL[o.status]}</span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums shrink-0">
                      {formatPriceFromPaise(o.totalPaise)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active-order tracker pill (card style — distinct from the primary cart CTA) */}
      <AnimatePresence>
        {active.length === 1 && (
          <motion.div key="one" {...SLIDE} className={`pointer-events-auto ${PILL_WIDTH}`}>
            <Link
              href={`/orders/${active[0]!.id}`}
              className="flex items-center gap-3 h-14 px-4 rounded-full bg-card border border-border shadow-lg hover:border-primary/40 transition-colors"
            >
              <span className="relative flex size-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
              </span>
              <Package className="size-5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-tight">
                  {SHORT_LABEL[active[0]!.status]}
                </span>
                <span className="block text-xs text-muted-foreground truncate">
                  {active[0]!.store.nameSnapshot} ·{" "}
                  {formatPriceFromPaise(active[0]!.totalPaise)}
                </span>
              </span>
              <span className="text-xs font-medium text-primary shrink-0">Track</span>
            </Link>
          </motion.div>
        )}
        {active.length > 1 && (
          <motion.div key="many" {...SLIDE} className={`pointer-events-auto ${PILL_WIDTH}`}>
            <button
              onClick={() => setExpanded((e) => !e)}
              className="flex w-full items-center gap-3 h-14 px-4 rounded-full bg-card border border-border shadow-lg hover:border-primary/40 transition-colors"
            >
              <Package className="size-5 shrink-0 text-primary" />
              <span className="flex-1 text-left text-sm font-semibold">
                {active.length} active orders
              </span>
              <ChevronUp
                className={`size-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
              />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cart CTA (solid primary — the main shopping action, sits at the bottom) */}
      <AnimatePresence>
        {showCart && (
          <motion.div key="cart" {...SLIDE} className="pointer-events-auto">
            <Link
              href="/cart"
              className="inline-flex items-center gap-2 h-14 px-5 sm:px-6 rounded-full bg-primary text-primary-foreground shadow-lg font-medium hover:bg-primary-active transition-colors max-w-[calc(100vw-2rem)] whitespace-nowrap"
            >
              <ShoppingCart className="size-4 shrink-0" />
              <span className="tabular-nums">
                {cartItems} item{cartItems === 1 ? "" : "s"}
              </span>
              <span aria-hidden>·</span>
              <span className="tabular-nums">{formatPriceFromPaise(cartSubtotal)}</span>
              <span className="text-primary-foreground/70 text-sm">View cart</span>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
