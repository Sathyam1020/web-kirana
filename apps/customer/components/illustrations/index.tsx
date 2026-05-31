"use client"

/**
 * Hand-drawn-feeling SVG illustrations for empty/error/zero states.
 *
 * All single-file so consumers import once: `import { NoStoresIllustration }`.
 * Palette uses CSS tokens (var(--primary), var(--surface-*), etc.) so they
 * respect the Airbnb-inspired Rausch palette + dark mode automatically.
 *
 * Sizing rule: each renders inside a 240×180 viewBox; the consumer sizes the
 * outer container (e.g., w-40, w-56). Keeps stroke widths visually consistent.
 */

import { cn } from "@workspace/ui/lib/utils"

interface IllustrationProps {
  className?: string
  /** Aria label — defaults to a sensible per-illustration string. */
  label?: string
}

function Frame({
  className,
  label,
  children,
}: IllustrationProps & { children: React.ReactNode }) {
  return (
    <svg
      role={label ? "img" : "presentation"}
      aria-label={label}
      viewBox="0 0 240 180"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-auto w-40 sm:w-48", className)}
    >
      {children}
    </svg>
  )
}

/** Map pin with concentric halos — "we need your location". */
export function NoLocationIllustration({ className, label }: IllustrationProps) {
  return (
    <Frame className={className} label={label ?? "Location required"}>
      {/* Soft ground ellipse */}
      <ellipse cx="120" cy="148" rx="68" ry="8" fill="var(--surface-soft)" />
      {/* Halos */}
      <circle cx="120" cy="92" r="56" fill="var(--primary)" opacity="0.06" />
      <circle cx="120" cy="92" r="40" fill="var(--primary)" opacity="0.1" />
      {/* Pin body */}
      <path
        d="M120 36c-15 0-27 12-27 27 0 18 19 41 25 47a3 3 0 0 0 4 0c6-6 25-29 25-47 0-15-12-27-27-27z"
        fill="var(--primary)"
      />
      <circle cx="120" cy="62" r="9" fill="var(--background)" />
    </Frame>
  )
}

/** Sad storefront with shutter down + small Zzz — "no stores near you". */
export function NoStoresIllustration({ className, label }: IllustrationProps) {
  return (
    <Frame className={className} label={label ?? "No stores yet"}>
      {/* Ground */}
      <ellipse cx="120" cy="158" rx="78" ry="6" fill="var(--surface-soft)" />
      {/* Roof */}
      <path d="M48 76l72-40 72 40v8H48z" fill="var(--surface-strong)" />
      {/* Walls */}
      <rect x="56" y="84" width="128" height="64" rx="2" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
      {/* Shutter (closed) */}
      <rect x="72" y="100" width="96" height="42" rx="2" fill="var(--surface-soft)" stroke="var(--border)" strokeWidth="2" />
      {/* Shutter slats */}
      {Array.from({ length: 6 }).map((_, i) => (
        <line
          key={i}
          x1="72"
          x2="168"
          y1={108 + i * 6}
          y2={108 + i * 6}
          stroke="var(--border)"
          strokeWidth="1.5"
        />
      ))}
      {/* Closed sign */}
      <rect x="104" y="116" width="32" height="14" rx="2" fill="var(--primary)" />
      <text x="120" y="126" fontFamily="system-ui,sans-serif" fontSize="8" fontWeight="700" fill="var(--primary-foreground)" textAnchor="middle">
        CLOSED
      </text>
      {/* Zzz */}
      <text x="180" y="64" fontFamily="system-ui,sans-serif" fontSize="14" fontWeight="700" fill="var(--muted-foreground)" opacity="0.6">
        Z
      </text>
      <text x="194" y="52" fontFamily="system-ui,sans-serif" fontSize="11" fontWeight="700" fill="var(--muted-foreground)" opacity="0.4">
        z
      </text>
      <text x="204" y="42" fontFamily="system-ui,sans-serif" fontSize="9" fontWeight="700" fill="var(--muted-foreground)" opacity="0.3">
        z
      </text>
    </Frame>
  )
}

/** Closed store with clock — "Hampi Kirani is currently closed". */
export function StoreClosedIllustration({ className, label }: IllustrationProps) {
  return (
    <Frame className={className} label={label ?? "Store closed"}>
      <ellipse cx="120" cy="158" rx="68" ry="5" fill="var(--surface-soft)" />
      {/* Building */}
      <rect x="68" y="60" width="104" height="92" rx="4" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
      {/* Awning */}
      <path d="M60 60h120l-8 18H68z" fill="var(--warning)" opacity="0.5" />
      {/* Door */}
      <rect x="104" y="100" width="32" height="52" rx="2" fill="var(--surface-strong)" />
      {/* Clock face */}
      <circle cx="120" cy="40" r="22" fill="var(--card)" stroke="var(--warning)" strokeWidth="3" />
      <line x1="120" y1="40" x2="120" y2="26" stroke="var(--foreground)" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="120" y1="40" x2="130" y2="40" stroke="var(--foreground)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="120" cy="40" r="2" fill="var(--foreground)" />
    </Frame>
  )
}

/** Empty shopping bag with subtle sparkle — "you haven't ordered yet". */
export function NoOrdersIllustration({ className, label }: IllustrationProps) {
  return (
    <Frame className={className} label={label ?? "No orders yet"}>
      <ellipse cx="120" cy="160" rx="60" ry="5" fill="var(--surface-soft)" />
      {/* Bag */}
      <path
        d="M76 70h88l-6 78a6 6 0 0 1-6 6H88a6 6 0 0 1-6-6z"
        fill="var(--primary)"
        opacity="0.12"
      />
      <path
        d="M76 70h88l-6 78a6 6 0 0 1-6 6H88a6 6 0 0 1-6-6z"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2.5"
      />
      {/* Handles */}
      <path
        d="M96 70v-8a16 16 0 0 1 32 0v0"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M112 70v-8a16 16 0 0 1 32 0v0"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Sparkles */}
      <Sparkle x={62} y={56} size={10} />
      <Sparkle x={180} y={88} size={8} />
      <Sparkle x={64} y={120} size={6} />
    </Frame>
  )
}

/** Crossed-out search result — "we couldn't find anything". */
export function NoSearchResultsIllustration({ className, label }: IllustrationProps) {
  return (
    <Frame className={className} label={label ?? "Nothing matched"}>
      <ellipse cx="120" cy="158" rx="60" ry="5" fill="var(--surface-soft)" />
      <circle
        cx="108"
        cy="86"
        r="40"
        fill="none"
        stroke="var(--foreground)"
        strokeWidth="6"
      />
      <line
        x1="138"
        y1="116"
        x2="166"
        y2="144"
        stroke="var(--foreground)"
        strokeWidth="8"
        strokeLinecap="round"
      />
      {/* Tilde mouth (sad face) */}
      <path
        d="M94 96 Q108 90 122 96"
        fill="none"
        stroke="var(--muted-foreground)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="96" cy="78" r="2.5" fill="var(--muted-foreground)" />
      <circle cx="120" cy="78" r="2.5" fill="var(--muted-foreground)" />
    </Frame>
  )
}

/** Stack of coupon tickets — "no offers right now". */
export function NoCouponsIllustration({ className, label }: IllustrationProps) {
  return (
    <Frame className={className} label={label ?? "No offers"}>
      <ellipse cx="120" cy="156" rx="60" ry="5" fill="var(--surface-soft)" />
      {/* Back ticket */}
      <g transform="translate(72,84) rotate(-6)">
        <Ticket fill="var(--surface-strong)" stroke="var(--border)" />
      </g>
      {/* Front ticket */}
      <g transform="translate(82,72) rotate(4)">
        <Ticket fill="var(--card)" stroke="var(--primary)" />
        <line x1="0" y1="0" x2="0" y2="48" stroke="var(--primary)" strokeWidth="1.5" strokeDasharray="3 3" transform="translate(60,4)" />
        <text x="20" y="22" fontFamily="system-ui,sans-serif" fontSize="9" fontWeight="700" fill="var(--primary)">
          %
        </text>
      </g>
    </Frame>
  )
}

/** Empty produce crate — "this category is empty here". */
export function EmptyCategoryIllustration({ className, label }: IllustrationProps) {
  return (
    <Frame className={className} label={label ?? "Empty category"}>
      <ellipse cx="120" cy="158" rx="62" ry="6" fill="var(--surface-soft)" />
      {/* Crate */}
      <rect x="68" y="78" width="104" height="68" rx="3" fill="var(--surface-strong)" stroke="var(--border)" strokeWidth="2" />
      {/* Slats */}
      <line x1="68" y1="96" x2="172" y2="96" stroke="var(--border)" strokeWidth="2" />
      <line x1="68" y1="114" x2="172" y2="114" stroke="var(--border)" strokeWidth="2" />
      <line x1="68" y1="132" x2="172" y2="132" stroke="var(--border)" strokeWidth="2" />
      {/* Vertical strut */}
      <line x1="120" y1="78" x2="120" y2="146" stroke="var(--border)" strokeWidth="2" />
      {/* Dust / "empty" sparkle */}
      <text x="120" y="64" fontFamily="system-ui,sans-serif" fontSize="11" fontWeight="500" fill="var(--muted-foreground)" textAnchor="middle">
        empty
      </text>
    </Frame>
  )
}

/** Disconnected plug + sad lines — generic network/server error. */
export function ErrorIllustration({ className, label }: IllustrationProps) {
  return (
    <Frame className={className} label={label ?? "Something went wrong"}>
      <ellipse cx="120" cy="156" rx="60" ry="5" fill="var(--surface-soft)" />
      {/* Plug body */}
      <rect x="58" y="84" width="48" height="32" rx="4" fill="var(--destructive)" opacity="0.7" />
      <rect x="100" y="92" width="8" height="6" fill="var(--destructive)" opacity="0.7" />
      <rect x="100" y="102" width="8" height="6" fill="var(--destructive)" opacity="0.7" />
      {/* Socket */}
      <rect x="134" y="84" width="48" height="32" rx="4" fill="var(--surface-strong)" stroke="var(--border)" strokeWidth="2" />
      <rect x="142" y="92" width="6" height="6" rx="1" fill="var(--border)" />
      <rect x="142" y="102" width="6" height="6" rx="1" fill="var(--border)" />
      {/* Bolt break */}
      <path
        d="M120 70l-6 14h8l-6 14"
        stroke="var(--warning)"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Frame>
  )
}

// --- Tiny helpers -------------------------------------------------------

function Sparkle({ x, y, size }: { x: number; y: number; size: number }) {
  return (
    <path
      d={`M${x} ${y - size}l${size / 3} ${size * 0.66} ${size * 0.66} ${size / 3} -${size * 0.66} ${size / 3} -${size / 3} ${size * 0.66} -${size / 3} -${size * 0.66} -${size * 0.66} -${size / 3} ${size * 0.66} -${size / 3}z`}
      fill="var(--primary)"
      opacity="0.5"
    />
  )
}

function Ticket({ fill, stroke }: { fill: string; stroke: string }) {
  return (
    <path
      d="M0 4 a4 4 0 0 1 4 -4 h60 a4 4 0 0 1 4 4 v18 a6 6 0 0 0 0 12 v18 a4 4 0 0 1 -4 4 h-60 a4 4 0 0 1 -4 -4 v-18 a6 6 0 0 0 0 -12z"
      fill={fill}
      stroke={stroke}
      strokeWidth="2"
    />
  )
}
