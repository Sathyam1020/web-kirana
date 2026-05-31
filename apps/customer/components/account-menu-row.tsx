"use client"

/**
 * Single row in the Account screen's menu list — icon · label · optional
 * subtitle · optional Rausch-tinted badge · chevron.
 *
 * Renders as a Link when href is provided; otherwise as a button (used for
 * the Log out row that opens a confirm sheet rather than navigating).
 */

import { ChevronRight } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

interface AccountMenuRowProps {
  icon: React.ReactNode
  label: string
  subtitle?: React.ReactNode
  badge?: string
  href?: string
  onClick?: () => void
  /** Use the destructive tone — red icon + label. For Log out. */
  destructive?: boolean
}

export function AccountMenuRow({
  icon,
  label,
  subtitle,
  badge,
  href,
  onClick,
  destructive,
}: AccountMenuRowProps) {
  const inner = (
    <>
      <span
        aria-hidden
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-full shrink-0",
          destructive
            ? "bg-destructive/10 text-destructive"
            : "bg-surface-soft text-foreground",
        )}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span
          className={cn(
            "block text-sm font-semibold leading-tight",
            destructive ? "text-destructive" : "text-foreground",
          )}
        >
          {label}
        </span>
        {subtitle ? (
          <span className="block text-xs text-muted-foreground mt-0.5 truncate">
            {subtitle}
          </span>
        ) : null}
      </span>
      {badge ? (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold leading-none shrink-0">
          {badge}
        </span>
      ) : null}
      {!destructive ? (
        <ChevronRight
          className="size-4 text-muted-foreground shrink-0"
          aria-hidden
        />
      ) : null}
    </>
  )

  const className = cn(
    "flex w-full items-center gap-3 px-3 py-3 text-left",
    "hover:bg-surface-soft active:bg-surface-soft transition-colors",
    "focus-visible:outline-none focus-visible:bg-surface-soft",
  )

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    )
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  )
}

interface AccountMenuListProps {
  children: React.ReactNode
  className?: string
}

/** Container that draws the rounded border + divider lines between rows. */
export function AccountMenuList({ children, className }: AccountMenuListProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border border-border bg-card overflow-hidden divide-y divide-border-soft",
        className,
      )}
    >
      {children}
    </div>
  )
}
