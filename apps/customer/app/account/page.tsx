"use client"

/**
 * Account page — dual-state (logged-in / not-logged-in).
 *
 * Lives OUTSIDE the (authed) route group so unauthenticated visitors can
 * land here from the bottom nav without being bounced to /login. Subpages
 * (/account/profile, /account/addresses, etc.) stay under (authed) so
 * they require sign-in.
 *
 * Logged-in: profile card → stats row → menu list → log out (bottom).
 * Logged-out: sign-in illustration + CTAs + "Why sign up?" bullets.
 */

import { useApi, useAuthStore } from "@workspace/auth"
import { Button } from "@workspace/ui/components/button"
import { useQuery } from "@tanstack/react-query"
import {
  BellRing,
  Check,
  HelpCircle,
  Info,
  ListOrdered,
  LogOut,
  MapPin,
  Palette,
  Star,
  Tag,
} from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { AccountMenuList, AccountMenuRow } from "@/components/account-menu-row"
import { AccountProfileCard } from "@/components/account-profile-card"
import { AccountStatsRow } from "@/components/account-stats-row"
import { LogoutConfirmSheet } from "@/components/logout-confirm-sheet"
import { SignInIllustration } from "@/components/illustrations"
import { useFavorites } from "@/lib/favorites"

export default function AccountPage() {
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)

  if (status === "anonymous") {
    return <SignedOut />
  }

  if (status === "loading" || user === null) {
    return <AccountSkeleton />
  }

  return <SignedIn />
}

function SignedIn() {
  const api = useApi()
  const user = useAuthStore((s) => s.user)
  const favoriteStoresCount = useFavorites((s) => s.storeIds.length)
  const [logoutOpen, setLogoutOpen] = useState(false)

  const statsQuery = useQuery({
    queryKey: ["me", "stats"],
    queryFn: () => api.me.stats(),
    staleTime: 60_000,
  })

  // The orders query is reused from the home header bell count; keep this
  // cheap by leaning on the same key — react-query dedupes.
  const ordersQuery = useQuery({
    queryKey: ["orders", "active-count"],
    queryFn: () => api.orders.list(),
    staleTime: 30_000,
  })
  const activeCount = (ordersQuery.data?.items ?? []).filter((o) =>
    ["PLACED", "ACCEPTED", "OUT_FOR_DELIVERY"].includes(o.status),
  ).length

  if (!user) return null

  return (
    <div className="min-h-svh bg-background pb-28">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border/40">
        <div className="max-w-md mx-auto flex items-center justify-center px-4 py-3">
          <h1 className="text-base font-semibold">Account</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-5 space-y-4">
        <AccountProfileCard user={user} />

        <AccountStatsRow
          ordersPlaced={statsQuery.data?.ordersPlaced}
          favoriteStoresCount={favoriteStoresCount}
          savingsPaise={statsQuery.data?.savingsPaise}
          isLoading={statsQuery.isPending}
        />

        <AccountMenuList>
          <AccountMenuRow
            icon={<MapPin className="size-4" />}
            label="Saved addresses"
            subtitle="Manage where we deliver"
            href="/account/addresses"
          />
          <AccountMenuRow
            icon={<Star className="size-4" />}
            label="Favorite stores"
            subtitle={
              favoriteStoresCount > 0
                ? `${favoriteStoresCount} store${favoriteStoresCount === 1 ? "" : "s"}`
                : "Star kiranas to come back faster"
            }
            href="/account/favorites"
          />
          <AccountMenuRow
            icon={<BellRing className="size-4" />}
            label="Notifications"
            subtitle="Push, WhatsApp, Email"
            href="/account/notifications"
          />
          <AccountMenuRow
            icon={<Palette className="size-4" />}
            label="Appearance"
            subtitle="Light, dark, or system theme"
            href="/account/appearance"
          />
          <AccountMenuRow
            icon={<Tag className="size-4" />}
            label="Offers & coupons"
            subtitle="Active offers and codes"
            href="/account/offers"
          />
          <AccountMenuRow
            icon={<ListOrdered className="size-4" />}
            label="Order history"
            subtitle={
              activeCount > 0
                ? `${activeCount} active order${activeCount === 1 ? "" : "s"}`
                : undefined
            }
            href="/orders"
          />
          <AccountMenuRow
            icon={<HelpCircle className="size-4" />}
            label="Help & Support"
            href="/account/help"
          />
          <AccountMenuRow
            icon={<Info className="size-4" />}
            label="About"
            subtitle="T&C, Privacy, App version"
            href="/account/about"
          />
        </AccountMenuList>

        <AccountMenuList>
          <AccountMenuRow
            icon={<LogOut className="size-4" />}
            label="Log out"
            onClick={() => setLogoutOpen(true)}
            destructive
          />
        </AccountMenuList>
      </main>

      <LogoutConfirmSheet open={logoutOpen} onOpenChange={setLogoutOpen} />
    </div>
  )
}

function SignedOut() {
  return (
    <div className="min-h-svh bg-background pb-28">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border/40">
        <div className="max-w-md mx-auto flex items-center justify-center px-4 py-3">
          <h1 className="text-base font-semibold">Account</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-8 flex flex-col items-center text-center">
        <SignInIllustration className="w-52" />
        <h2 className="text-lg font-bold mt-4 leading-tight">
          Sign in to manage your orders,
          <br />
          addresses, and favorites
        </h2>

        <div className="w-full mt-6 flex flex-col gap-2">
          <Button asChild size="lg" className="w-full">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild variant="secondary" size="lg" className="w-full">
            <Link href="/signup">Create account</Link>
          </Button>
        </div>

        <div className="w-full mt-8 rounded-[var(--radius-md)] border border-border bg-card p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3 text-left">
            Why sign up?
          </p>
          <ul className="space-y-2 text-left">
            <Benefit>Track your orders in real time</Benefit>
            <Benefit>Save addresses for faster checkout</Benefit>
            <Benefit>Get exclusive offers and discounts</Benefit>
          </ul>
        </div>
      </main>
    </div>
  )
}

function Benefit({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm text-foreground">
      <span className="inline-flex size-5 items-center justify-center rounded-full bg-success/15 text-success shrink-0 mt-0.5">
        <Check className="size-3" strokeWidth={3} aria-hidden />
      </span>
      <span>{children}</span>
    </li>
  )
}

function AccountSkeleton() {
  return (
    <div className="min-h-svh bg-background pb-28">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border/40">
        <div className="max-w-md mx-auto flex items-center justify-center px-4 py-3">
          <h1 className="text-base font-semibold">Account</h1>
        </div>
      </header>
      <main className="max-w-md mx-auto px-4 py-5 space-y-4">
        <div className="h-20 w-full rounded-[var(--radius-md)] bg-card border border-border animate-pulse" />
        <div className="h-16 w-full rounded-[var(--radius-md)] bg-card border border-border animate-pulse" />
        <div className="h-72 w-full rounded-[var(--radius-md)] bg-card border border-border animate-pulse" />
      </main>
    </div>
  )
}

