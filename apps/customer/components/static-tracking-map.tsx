"use client"

/**
 * Static SVG "tracking map" placeholder shown above the order progress
 * stepper when an order is OUT_FOR_DELIVERY.
 *
 * No API call, no Google Maps, no rider GPS — that wiring lands when the
 * Riders module (Phase 7.5) ships. For now, this renders an evocative but
 * intentionally abstract street grid with two pins (store, customer) and
 * a soft connecting route line. The copy makes it clear what the user
 * is looking at; we don't pretend the pins represent real positions.
 */

import { Home as HomeIcon, Store as StoreIcon } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

interface StaticTrackingMapProps {
  storeName?: string
  /** Optional ETA window like "15-25 mins" surfaced beneath the map. */
  etaLabel?: string | null
  className?: string
}

export function StaticTrackingMap({
  storeName,
  etaLabel,
  className,
}: StaticTrackingMapProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface-soft",
        className,
      )}
      aria-label="Tracking map placeholder"
    >
      <svg
        viewBox="0 0 360 180"
        xmlns="http://www.w3.org/2000/svg"
        className="block w-full h-auto"
        role="img"
        aria-hidden
      >
        {/* Soft map background — neutral, no specific city */}
        <rect width="360" height="180" fill="var(--surface-soft)" />

        {/* "Blocks" — thin lines to read as streets without naming places */}
        <g stroke="var(--border)" strokeWidth="1" opacity="0.6">
          <line x1="0" y1="40" x2="360" y2="40" />
          <line x1="0" y1="90" x2="360" y2="90" />
          <line x1="0" y1="140" x2="360" y2="140" />
          <line x1="80" y1="0" x2="80" y2="180" />
          <line x1="180" y1="0" x2="180" y2="180" />
          <line x1="280" y1="0" x2="280" y2="180" />
        </g>

        {/* Connecting "route" — a soft curve from store pin to customer pin */}
        <path
          d="M70 120 Q160 60 280 70"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="4 6"
          opacity="0.8"
        />

        {/* Store pin (left) — Rausch tinted circle */}
        <g transform="translate(70,120)">
          <circle r="14" fill="var(--card)" stroke="var(--primary)" strokeWidth="2.5" />
          <circle r="5" fill="var(--primary)" />
        </g>

        {/* Customer pin (right) — ink circle, smaller */}
        <g transform="translate(280,70)">
          <circle r="12" fill="var(--card)" stroke="var(--foreground)" strokeWidth="2.5" />
          <circle r="4" fill="var(--foreground)" />
        </g>

        {/* Bike-like glyph midway — visual cue for "delivery is on the move".
            Drawn as a native SVG so it nests inside the parent <svg>. */}
        <g transform="translate(170,86)">
          <circle r="14" fill="var(--primary)" />
          {/* Two wheels + frame */}
          <circle cx="-4" cy="2" r="3" fill="none" stroke="var(--primary-foreground)" strokeWidth="1.5" />
          <circle cx="4" cy="2" r="3" fill="none" stroke="var(--primary-foreground)" strokeWidth="1.5" />
          <path
            d="M-4 2L-1 -3L4 2M-1 -3L1 -5"
            fill="none"
            stroke="var(--primary-foreground)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </svg>

      <div className="px-3 py-2.5 flex items-start gap-2 border-t border-border-soft bg-card">
        <StoreIcon className="size-3.5 text-primary mt-0.5 shrink-0" aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground leading-tight">
            {storeName
              ? `Your order is on its way from ${storeName}`
              : "Your order is on its way"}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">
            Live rider tracking is rolling out soon.
            {etaLabel ? <> Estimated arrival: {etaLabel}.</> : null}
          </p>
        </div>
        <HomeIcon className="size-3.5 text-muted-foreground mt-0.5 shrink-0" aria-hidden />
      </div>
    </div>
  )
}
