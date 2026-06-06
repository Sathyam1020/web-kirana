"use client"

/**
 * IP-6 — Permissions onboarding bottom sheet.
 *
 * Two cards, each handling one permission flow:
 *   1. Location → triggers `requestLocation()`, reverse-geocodes, and
 *      commits the result to the delivery context (so the home + cart
 *      + checkout all immediately have a coords source after grant).
 *   2. Push notifications → triggers `Notification.requestPermission`
 *      via the existing `useWebPush` hook + subscribes the device.
 *
 * Both are skippable. A single "Done" button at the bottom always
 * works — tapping it writes the localStorage flag whether or not the
 * customer granted anything. The sheet never re-prompts on this
 * device after that.
 *
 * Per-card state machine:
 *   idle → busy → granted | denied | unavailable
 * The idle CTA flips to a green "Done" badge on grant, a muted
 * "Skipped" label on deny, or hides entirely when the browser has no
 * support (PWA running on unsupported Safari, no VAPID key in env).
 */

import { useWebPush } from "@workspace/auth"
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
} from "@workspace/ui/components/bottom-sheet"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { reverseGeocode } from "@workspace/ui/lib/reverse-geocode"
import { Bell, Check, Loader2, MapPin } from "lucide-react"
import { motion } from "motion/react"
import { useState } from "react"
import { toast } from "sonner"

import { env } from "@/lib/env"
import { useDeliveryContext } from "@/lib/delivery-context"
import { useOnboarding } from "@/lib/onboarding"
import { writeStoredLocation } from "@/lib/location"

type CardStatus = "idle" | "busy" | "granted" | "denied"

interface OnboardingSheetProps {
  /** Test-only override so storybook/unit tests can mount the sheet
   *  without going through localStorage. */
  forceOpen?: boolean
}

export function OnboardingSheet({ forceOpen }: OnboardingSheetProps = {}) {
  const { shouldShow, dismiss } = useOnboarding()
  const open = forceOpen ?? shouldShow

  return (
    <BottomSheet
      open={open}
      onOpenChange={(o) => {
        // Vaul fires onOpenChange(false) on drag-to-dismiss + Esc + click-
        // outside. Treat any of those as "done" — the customer made an
        // informed choice to leave; don't re-pester them.
        if (!o) dismiss()
      }}
    >
      <BottomSheetContent>
        <BottomSheetHeader className="pb-1">
          <BottomSheetTitle>Welcome to Kirana 👋</BottomSheetTitle>
          <p className="text-sm text-muted-foreground pt-1">
            Two quick permissions so the app works the way it should. Both are
            optional — skip whatever you don&rsquo;t want.
          </p>
        </BottomSheetHeader>

        <div className="px-4 py-4 space-y-2.5">
          <LocationCard />
          <NotificationsCard />
        </div>

        <div className="px-4 pb-6 pt-1">
          <Button
            type="button"
            onClick={dismiss}
            className="w-full"
            size="lg"
          >
            Done
          </Button>
        </div>
      </BottomSheetContent>
    </BottomSheet>
  )
}

/** Location permission card. On grant, commits to delivery context so
 *  the home reads stores from the right coords immediately. */
function LocationCard() {
  const ctx = useDeliveryContext()
  const [status, setStatus] = useState<CardStatus>("idle")
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(null)

  function handleAllow(): void {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("denied")
      return
    }
    setStatus("busy")
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        // Reverse-geocode the captured coords so the pill in the header
        // and the picker both have a human label, not raw coords.
        let label: string | null = null
        try {
          const r = await reverseGeocode(coords)
          label = r?.label ?? null
        } catch {
          // Geocode failures are non-fatal — coords still work, label
          // degrades to "Current location".
        }
        writeStoredLocation({ ...coords, label: label ?? undefined })
        ctx.useGPS(coords, label ?? "Current location")
        setResolvedLabel(label ?? "Location captured")
        setStatus("granted")
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          toast.message("You can enable location anytime from the deliver-to picker.")
        }
        setStatus("denied")
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    )
  }

  return (
    <PermissionCard
      icon={<MapPin className="size-5" aria-hidden />}
      title="Share your location"
      idleSubtitle="So we can show kirana stores delivering to you."
      grantedSubtitle={resolvedLabel ?? "Location captured"}
      deniedSubtitle="Skipped — enable anytime from the deliver-to picker."
      status={status}
      onAllow={handleAllow}
    />
  )
}

/** Notifications permission card. Hidden entirely when the browser
 *  can't do push or VAPID key isn't configured — don't show a dead
 *  control. */
function NotificationsCard() {
  const { supported, permission, subscribe, busy } = useWebPush(
    env.vapidPublicKey,
  )
  const [status, setStatus] = useState<CardStatus>(() =>
    permission === "granted"
      ? "granted"
      : permission === "denied"
        ? "denied"
        : "idle",
  )

  if (!supported || env.vapidPublicKey.length === 0) return null

  async function handleAllow(): Promise<void> {
    setStatus("busy")
    const ok = await subscribe()
    if (ok) {
      setStatus("granted")
    } else {
      setStatus("denied")
      // Subscribe returns false either because the browser denied OR
      // because the push registration failed. Either way the customer
      // can enable later from Settings.
      toast.message("You can enable notifications anytime from Settings.")
    }
  }

  return (
    <PermissionCard
      icon={<Bell className="size-5" aria-hidden />}
      title="Get live order updates"
      idleSubtitle="Know when your order's accepted, out for delivery, and delivered."
      grantedSubtitle="Notifications on — we'll ping you on every status change."
      deniedSubtitle="Skipped — enable anytime from Settings."
      status={busy ? "busy" : status}
      onAllow={() => void handleAllow()}
    />
  )
}

/**
 * Per-card chrome — icon + title + subtitle + right-side CTA. Status
 * drives both the subtitle copy and the CTA shape (Allow button →
 * spinner → green Done badge → muted Skipped tag).
 */
function PermissionCard({
  icon,
  title,
  idleSubtitle,
  grantedSubtitle,
  deniedSubtitle,
  status,
  onAllow,
}: {
  icon: React.ReactNode
  title: string
  idleSubtitle: string
  grantedSubtitle: string
  deniedSubtitle: string
  status: CardStatus
  onAllow: () => void
}) {
  const subtitle =
    status === "granted"
      ? grantedSubtitle
      : status === "denied"
        ? deniedSubtitle
        : idleSubtitle

  return (
    <motion.div
      layout
      transition={{ type: "spring", stiffness: 360, damping: 32 }}
      className={cn(
        "flex items-center gap-3 p-3 rounded-[var(--radius-md)] border",
        status === "granted"
          ? "border-success/30 bg-success-soft"
          : status === "denied"
            ? "border-border-soft bg-surface-soft"
            : "border-border bg-card",
      )}
    >
      <span
        className={cn(
          "inline-flex size-10 items-center justify-center rounded-full shrink-0",
          status === "granted"
            ? "bg-success text-success-foreground"
            : "bg-primary/10 text-primary",
        )}
      >
        {status === "granted" ? (
          <Check className="size-5" strokeWidth={3} aria-hidden />
        ) : (
          icon
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground leading-tight">
          {title}
        </span>
        <span
          className={cn(
            "block text-[12px] leading-snug mt-0.5",
            status === "granted"
              ? "text-success-foreground/90"
              : "text-muted-foreground",
          )}
        >
          {subtitle}
        </span>
      </span>
      <span className="shrink-0">
        {status === "idle" ? (
          <Button
            type="button"
            size="sm"
            onClick={onAllow}
            className="h-8 px-3"
          >
            Allow
          </Button>
        ) : status === "busy" ? (
          <span className="inline-flex size-8 items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </span>
        ) : status === "granted" ? (
          <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-success/10 text-success text-[11px] font-semibold">
            <Check className="size-3" strokeWidth={3} aria-hidden />
            Done
          </span>
        ) : (
          <span className="inline-flex items-center h-7 px-2.5 rounded-full bg-surface-strong text-muted-foreground text-[11px] font-medium">
            Skipped
          </span>
        )}
      </span>
    </motion.div>
  )
}
