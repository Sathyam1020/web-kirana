"use client"

/**
 * IP-4 — Header "Deliver to" trigger.
 *
 * Replaces the old `DeliverToPill`'s tap-to-request-GPS behavior. Tap
 * now opens the full picker sheet (`<DeliverToPicker>`), which itself
 * contains "Use current location" as one of three options. So the GPS
 * affordance isn't lost — it's just demoted to a card inside the sheet.
 *
 * Label resolution order:
 *   1. `useDeliveryContext().label` — if the user has explicitly picked
 *      a saved address or committed GPS via the picker
 *   2. fresh reverse-geocoded label from the device GPS — for first-run
 *      customers who haven't opened the picker yet
 *   3. status-based fallbacks ("Locating…", "Set location")
 *
 * Style matches the old pill so this is a drop-in swap in `HomeHeader`.
 */

import { ChevronDown, MapPin } from "lucide-react"
import { motion } from "motion/react"
import { useEffect, useState } from "react"

import { cn } from "@workspace/ui/lib/utils"
import { springs, tapScale, useMotionPreset } from "@workspace/ui/lib/motion"
import { DeliverToPicker } from "@/components/deliver-to-picker"
import { useDeliveryContext } from "@/lib/delivery-context"
import { useResolvedLocation, useUserLocation } from "@/lib/location"

interface DeliverToTriggerProps {
  className?: string
}

export function DeliverToTrigger({ className }: DeliverToTriggerProps) {
  const [open, setOpen] = useState(false)
  const ctx = useDeliveryContext()
  const tap = useMotionPreset(springs.tap)

  // GPS resolution — used as the fallback label only. Once the user
  // commits a pick through the picker, ctx.label takes over and stays
  // sticky across reloads.
  const { location, status: locStatus, request: requestLocation } = useUserLocation()
  const { label: resolvedLabel, loading: resolvingLabel } =
    useResolvedLocation(location)

  // First-paint: if there's no committed context yet, kick a single
  // GPS request so the pill has SOMETHING to show without requiring a
  // tap. The picker itself does NOT auto-request on open — we want the
  // user's first explicit interaction to be the prompt trigger, but
  // the home isn't usable until coords resolve, so we do a one-shot
  // request here too.
  useEffect(() => {
    if (locStatus === "idle") requestLocation()
  }, [locStatus, requestLocation])

  // Label — context wins; fall back to live GPS resolution.
  const label =
    ctx.label !== null
      ? ctx.label
      : locStatus === "ready" && location
        ? resolvedLabel ??
          location.label ??
          (resolvingLabel ? "Resolving…" : "Current location")
        : locStatus === "denied"
          ? "Set your location"
          : locStatus === "requesting"
            ? "Locating…"
            : "Enable location"

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        whileTap={{ scale: tapScale }}
        transition={tap}
        className={cn(
          "flex items-center gap-2 text-left min-w-0 max-w-full",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md",
          className,
        )}
        aria-label={`Deliver to ${label}. Tap to change.`}
      >
        <MapPin className="size-5 shrink-0 text-primary" aria-hidden />
        <span className="flex flex-col min-w-0">
          <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground leading-none">
            Deliver to
          </span>
          <span className="flex items-center gap-1 mt-0.5">
            <span className="text-sm font-semibold text-foreground truncate">
              {label}
            </span>
            <ChevronDown
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
          </span>
        </span>
      </motion.button>
      <DeliverToPicker open={open} onOpenChange={setOpen} />
    </>
  )
}
