"use client"

/**
 * Customer-app bottom navigation. 5 fixed tabs (Home / Categories / Search /
 * Orders / Account), Rausch-active. Stays out of the way on auth + checkout
 * + full-screen tracking screens so they can use the full viewport for
 * single-task flows.
 *
 * Mounts once in the root layout. The floating cart pill (CustomerBottomBar)
 * lives ABOVE this — its `bottom` offset is bumped to clear this nav.
 */

import { Home, ListOrdered, Search, User } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@workspace/ui/lib/utils"

interface NavItem {
  /** Stable id used to compute active state without string-matching the URL. */
  id: "home" | "search" | "orders" | "account"
  label: string
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
}

// 4 tabs — Categories was dropped in DP-2.A. The store-first model already
// surfaces categories on the home (per primary store), so a separate
// cross-store Categories index was redundant. Discovery happens via Home +
// Search; the four remaining tabs each map to a clear user intent.
const ITEMS: NavItem[] = [
  { id: "home", label: "Home", Icon: Home },
  { id: "search", label: "Search", Icon: Search },
  { id: "orders", label: "Orders", Icon: ListOrdered },
  { id: "account", label: "Account", Icon: User },
]

// Pathnames where the bottom nav stays hidden — single-task flows want the
// full viewport (and their own sticky CTA sits in the bottom slot the nav
// would otherwise occupy).
const HIDE_ON_PATHS: string[] = [
  "/login",
  "/signup",
  "/cart",
  "/checkout",
  // Deep order tracking is a single-task screen; the list at /orders keeps the nav.
  // Match `/orders/<id>` but not `/orders` itself.
]

function isOrderDetail(pathname: string): boolean {
  return /^\/orders\/[^/]+/.test(pathname)
}

function activeIdForPath(pathname: string): NavItem["id"] | null {
  if (pathname === "/" || pathname === "/stores" || pathname.startsWith("/stores/"))
    return "home"
  if (pathname.startsWith("/search")) return "search"
  if (pathname.startsWith("/orders")) return "orders"
  if (pathname.startsWith("/account")) return "account"
  return null
}

function hrefFor(item: NavItem["id"]): string {
  switch (item) {
    case "home":
      return "/stores"
    case "search":
      return "/search"
    case "orders":
      return "/orders"
    case "account":
      return "/account"
  }
}

export function BottomNav() {
  const pathname = usePathname() ?? ""

  const hidden =
    HIDE_ON_PATHS.some((p) => pathname.startsWith(p)) || isOrderDetail(pathname)
  if (hidden) return null

  const activeId = activeIdForPath(pathname)

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "fixed bottom-0 inset-x-0 z-30",
        // DP-6: floating-feeling presence — stronger blur + translucent
        // bg lets content visibly scroll under the nav, rather than into
        // a hard border-top wall. Thin top border kept for definition;
        // anything chunkier reads "dashboard" instead of "commerce app".
        "border-t border-border-soft bg-background/80 backdrop-blur-xl",
        // Safe-area inset for home-indicator devices.
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      <ul className="max-w-md mx-auto grid grid-cols-4">
        {ITEMS.map(({ id, label, Icon }) => {
          const isActive = id === activeId
          return (
            <li key={id} className="flex">
              <Link
                href={hrefFor(id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-1 py-2",
                  "text-[11px] font-medium",
                  "focus-visible:outline-none focus-visible:bg-surface-soft transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon
                  aria-hidden
                  className={cn("size-5", isActive && "scale-105 transition-transform")}
                />
                <span>{label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
