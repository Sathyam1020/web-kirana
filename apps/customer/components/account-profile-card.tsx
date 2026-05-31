"use client"

/**
 * Profile card at the top of the Account screen — initials avatar, name,
 * phone (with verified check), email, "Edit" link. Tap the card → /account/profile.
 *
 * Avatar fallback: initials derived from the first two name tokens, on a
 * Rausch-tinted background. Matches the design's "RS" avatar treatment.
 */

import type { AuthUser } from "@workspace/api-client"
import { BadgeCheck, ChevronRight } from "lucide-react"
import Link from "next/link"

import { cn } from "@workspace/ui/lib/utils"

interface AccountProfileCardProps {
  user: AuthUser
  className?: string
}

export function AccountProfileCard({ user, className }: AccountProfileCardProps) {
  const initials = computeInitials(user.name)
  const email = (user as { email?: string | null }).email ?? null
  const phone = (user as { phone?: string | null }).phone ?? null

  return (
    <Link
      href="/account/profile"
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-card p-3 hover:bg-surface-soft transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <span
        aria-hidden
        className="inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-lg font-bold tracking-wide"
      >
        {initials}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight truncate text-foreground">
          {user.name}
        </p>
        {phone ? (
          <p className="text-xs text-muted-foreground tabular-nums mt-0.5 flex items-center gap-1">
            {phone}
            <BadgeCheck className="size-3.5 text-success" aria-label="Verified" />
          </p>
        ) : null}
        {email ? (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{email}</p>
        ) : null}
      </div>
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-primary shrink-0">
        Edit
        <ChevronRight className="size-3.5" aria-hidden />
      </span>
    </Link>
  )
}

function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  if (parts.length === 0) return "U"
  const initials = parts.map((p) => p.charAt(0)).join("")
  return initials.toUpperCase().slice(0, 2)
}
