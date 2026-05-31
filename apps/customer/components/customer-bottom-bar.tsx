"use client"

import type { OrderStatus } from "@workspace/api-client"
import { useApi, useAuthStore } from "@workspace/auth"
import { useQuery } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { ChevronRight, ChevronUp, Package, ShoppingCart, X } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { useCart } from "@/lib/cart"
import { formatPriceFromPaise } from "@/lib/format"
import { cn } from "@workspace/ui/lib/utils"
import { tweens, useMotionPreset } from "@workspace/ui/lib/motion"

const ACTIVE: OrderStatus[] = ["PLACED", "ACCEPTED", "OUT_FOR_DELIVERY"]

const SHORT_LABEL: Record<OrderStatus, string> = {
  PLACED: "Order placed",
  ACCEPTED: "Accepted",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
}

// Slide pose for the pills. Transition is supplied at render time via
// `useMotionPreset(tweens.route)` so reduced-motion preference flips it
// to instant — never inline a one-off ease in DP-5+ code.
const SLIDE = {
  initial: { y: 60, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  exit: { y: 60, opacity: 0 },
} as const

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
  const slideT = useMotionPreset(tweens.route)
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
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] inset-x-0 z-40 flex flex-col items-center gap-2 px-4 pointer-events-none">
      {/* Expanded list when there are multiple active orders */}
      <AnimatePresence>
        {expanded && active.length > 1 && (
          <motion.div
            {...SLIDE} transition={slideT}
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
          <motion.div key="one" {...SLIDE} transition={slideT} className={`pointer-events-auto ${PILL_WIDTH}`}>
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
          <motion.div key="many" {...SLIDE} transition={slideT} className={`pointer-events-auto ${PILL_WIDTH}`}>
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

      {/* Cart pill — Blinkit-style two-line layout with an inner Rausch
          "View cart" button. Dark surface in light mode for high signal;
          the inner Rausch button is the primary action affordance. */}
      <AnimatePresence>
        {showCart && (
          <motion.div
            key="cart"
            {...SLIDE} transition={slideT}
            className={cn("pointer-events-auto", PILL_WIDTH)}
          >
            <CartPill
              itemCount={cartItems}
              subtotalPaise={cartSubtotal}
              storeName={cart.storeName}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function CartPill({
  itemCount,
  subtotalPaise,
  storeName,
}: {
  itemCount: number
  subtotalPaise: number
  storeName: string | null
}) {
  const bounce = useMotionPreset(tweens.fast)
  return (
    <Link
      href="/cart"
      className={cn(
        // DP-6: previous white-card outer + inner Rausch CTA pattern,
        // squeezed into the new h-12 compact frame. Card surface flips
        // with the theme; the Rausch lives only on the inner action chip.
        "flex items-center gap-2 h-12 pl-3 pr-1",
        "rounded-full bg-card text-foreground border border-border shadow-card",
        "hover:bg-surface-soft transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      {/* Cart icon with Rausch count badge — bounces on every increment
          as the "add registered" cue. */}
      <span className="relative inline-flex items-center justify-center shrink-0 text-foreground">
        <ShoppingCart className="size-5" strokeWidth={2} aria-hidden />
        <AnimatePresence>
          {itemCount > 0 ? (
            <motion.span
              key={itemCount}
              aria-hidden
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={bounce}
              className="absolute -top-1.5 -right-2 inline-flex min-w-[1rem] h-4 px-1 items-center justify-center rounded-full bg-primary text-[10px] font-bold leading-none text-primary-foreground tabular-nums ring-2 ring-card"
            >
              {itemCount > 99 ? "99+" : itemCount}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </span>

      {/* Single-line text: count · total · store. */}
      <span className="flex-1 min-w-0 flex items-center gap-1.5 text-sm font-semibold ml-1.5">
        <span className="tabular-nums">{itemCount}</span>
        <span className="text-muted-foreground" aria-hidden>·</span>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={subtotalPaise}
            initial={{ y: -2, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 2, opacity: 0 }}
            transition={bounce}
            className="tabular-nums inline-block"
          >
            {formatPriceFromPaise(subtotalPaise)}
          </motion.span>
        </AnimatePresence>
        {storeName ? (
          <>
            <span className="text-muted-foreground" aria-hidden>·</span>
            <span className="truncate text-muted-foreground font-normal">
              {storeName}
            </span>
          </>
        ) : null}
      </span>

      {/* Inner Rausch CTA — compact for h-12 frame. */}
      <span
        className={cn(
          "inline-flex items-center gap-0.5 h-9 px-3.5",
          "rounded-full bg-primary text-primary-foreground font-semibold text-sm",
          "shrink-0",
        )}
      >
        View
        <ChevronRight className="size-4" strokeWidth={2.5} aria-hidden />
      </span>
    </Link>
  )
}
