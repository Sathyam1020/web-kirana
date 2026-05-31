"use client"

/**
 * 3-stat row on the Account screen — orders placed · favorite stores ·
 * total savings. Each cell is tappable and routes to its surface.
 *
 * Data:
 *   - ordersPlaced + savingsPaise come from /v1/me/stats
 *   - favoriteStoresCount comes from the local favorites slice (DP-4 doesn't
 *     have a backend favorites table yet)
 *
 * Loading state: each cell renders a skeleton number until the query resolves.
 * Savings number rounds to whole rupees so the digit doesn't sprawl.
 */

import { Skeleton } from "@workspace/ui/components/skeleton"
import Link from "next/link"

import { cn } from "@workspace/ui/lib/utils"
import { formatPriceFromPaise } from "@/lib/format"

interface AccountStatsRowProps {
  ordersPlaced: number | undefined
  favoriteStoresCount: number
  savingsPaise: number | undefined
  isLoading: boolean
  className?: string
}

export function AccountStatsRow({
  ordersPlaced,
  favoriteStoresCount,
  savingsPaise,
  isLoading,
  className,
}: AccountStatsRowProps) {
  return (
    <div
      className={cn(
        "flex items-stretch rounded-[var(--radius-md)] border border-border bg-card overflow-hidden",
        className,
      )}
    >
      <StatCell
        href="/orders"
        value={isLoading ? undefined : ordersPlaced ?? 0}
        label="orders placed"
      />
      <span aria-hidden className="w-px self-stretch bg-border-soft" />
      <StatCell
        href="/account/favorites"
        value={favoriteStoresCount}
        label="favorite stores"
      />
      <span aria-hidden className="w-px self-stretch bg-border-soft" />
      <StatCell
        href="/account/offers"
        value={
          isLoading
            ? undefined
            : savingsPaise === undefined || savingsPaise === 0
              ? "₹0"
              : formatPriceFromPaise(savingsPaise)
        }
        label={
          savingsPaise && savingsPaise > 0 ? "saved with coupons" : "saved"
        }
        valueClassName="text-success"
      />
    </div>
  )
}

function StatCell({
  href,
  value,
  label,
  valueClassName,
}: {
  href: string
  value: number | string | undefined
  label: string
  valueClassName?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex-1 flex flex-col items-center justify-center py-3 px-1 text-center gap-1",
        "hover:bg-surface-soft active:bg-surface-soft transition-colors",
        "focus-visible:outline-none focus-visible:bg-surface-soft",
      )}
    >
      {value === undefined ? (
        <Skeleton className="h-5 w-10" />
      ) : (
        <span
          className={cn(
            "text-base font-bold tabular-nums leading-none",
            valueClassName ?? "text-foreground",
          )}
        >
          {value}
        </span>
      )}
      <span className="text-[11px] text-muted-foreground leading-tight">
        {label}
      </span>
    </Link>
  )
}
