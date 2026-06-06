"use client"

/**
 * IP-3.5 — Map pin refinement.
 *
 * Bottom sheet with an embedded Google Map + a draggable marker. The
 * customer / owner picks an address via autocomplete (or GPS) first;
 * this component lets them nudge the pin to their exact spot —
 * essential in India where building-level addresses are ambiguous
 * ("above Sharma Sweets" doesn't geocode precisely).
 *
 * On drag-end we reverse-geocode the new coords so the parent form
 * can refresh `line1 / city / pincode` to match the moved pin. The
 * user confirms with a CTA; cancel discards.
 *
 * Uses the deprecated `google.maps.Marker` rather than
 * `AdvancedMarkerElement` deliberately — AdvancedMarkerElement
 * requires a Map ID set up in GCP, which is extra setup friction we
 * don't need yet. The deprecation warning is benign for MVP; a
 * follow-up phase migrates once we add a Map ID anyway.
 */

import * as React from "react"
import { Loader2, MapPin } from "lucide-react"

import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
} from "@workspace/ui/components/bottom-sheet"
import { Button } from "@workspace/ui/components/button"
import { loadGoogleMaps, MapsKeyMissingError } from "@workspace/ui/lib/google-maps-loader"
import {
  reverseGeocode,
  type ReverseGeocodeResult,
} from "@workspace/ui/lib/reverse-geocode"

export interface PinResult {
  lat: number
  lng: number
  /** Reverse-geocoded address at the final pin position. May be null
   *  if the geocoder couldn't resolve (rare for India). */
  resolved: ReverseGeocodeResult | null
}

interface MapPinRefineProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: { lat: number; lng: number }
  onConfirm: (result: PinResult) => void
}

// Loose runtime types — we declare the bits we touch instead of
// pulling @types/google.maps (extra dep for a small surface).
interface MapInstance {
  setCenter: (c: { lat: number; lng: number }) => void
}
interface MapsLib {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => MapInstance
}
interface MarkerLatLng {
  lat: () => number
  lng: () => number
}
interface MarkerInstance {
  setPosition: (c: { lat: number; lng: number }) => void
  getPosition: () => MarkerLatLng | null
  addListener: (ev: string, fn: () => void) => void
  setMap: (m: MapInstance | null) => void
}
interface MarkerStatic {
  new (opts: {
    position: { lat: number; lng: number }
    map: MapInstance
    draggable: boolean
  }): MarkerInstance
}

export function MapPinRefine({
  open,
  onOpenChange,
  initial,
  onConfirm,
}: MapPinRefineProps) {
  const mapDivRef = React.useRef<HTMLDivElement>(null)
  const mapRef = React.useRef<MapInstance | null>(null)
  const markerRef = React.useRef<MarkerInstance | null>(null)
  const [coords, setCoords] = React.useState(initial)
  const [resolved, setResolved] = React.useState<ReverseGeocodeResult | null>(null)
  const [resolving, setResolving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Reset internal state every time the sheet opens with a new initial
  // position. Also kicks off the first reverse-geocode so the label is
  // ready before the user even drags.
  React.useEffect(() => {
    if (!open) return
    setCoords(initial)
    setResolving(true)
    let cancelled = false
    reverseGeocode(initial)
      .then((r) => {
        if (!cancelled) {
          setResolved(r)
          setResolving(false)
        }
      })
      .catch(() => {
        if (!cancelled) setResolving(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, initial.lat, initial.lng])

  // Mount the map + draggable marker after the sheet opens. Re-runs if
  // the customer closes + reopens with different coords (we treat the
  // map as ephemeral state tied to the open cycle).
  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const google = await loadGoogleMaps()
        const maps = (await google.maps.importLibrary("maps")) as MapsLib
        if (cancelled || mapDivRef.current === null) return
        const map = new maps.Map(mapDivRef.current, {
          center: initial,
          zoom: 17,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          clickableIcons: false,
        })
        mapRef.current = map
        // Classic Marker — AdvancedMarkerElement requires a Map ID, see
        // file header.
        const MarkerCtor = (google.maps as unknown as { Marker: MarkerStatic }).Marker
        const marker = new MarkerCtor({
          position: initial,
          map,
          draggable: true,
        })
        markerRef.current = marker
        marker.addListener("dragend", () => {
          const pos = marker.getPosition()
          if (pos === null) return
          const next = { lat: pos.lat(), lng: pos.lng() }
          setCoords(next)
          setResolving(true)
          reverseGeocode(next)
            .then((r) => {
              setResolved(r)
              setResolving(false)
            })
            .catch(() => setResolving(false))
        })
      } catch (err: unknown) {
        if (err instanceof MapsKeyMissingError) {
          setError("Maps key missing — set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.")
        } else {
          setError("Couldn't load the map. Close and use the GPS button instead.")
        }
      }
    })()
    return () => {
      cancelled = true
      if (markerRef.current !== null) {
        markerRef.current.setMap(null)
        markerRef.current = null
      }
      mapRef.current = null
    }
  }, [open, initial.lat, initial.lng])

  function handleConfirm(): void {
    onConfirm({ ...coords, resolved })
    onOpenChange(false)
  }

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent>
        <BottomSheetHeader className="pb-2">
          <BottomSheetTitle>Drag the pin to your exact spot</BottomSheetTitle>
        </BottomSheetHeader>
        <div className="px-4 pb-6 space-y-3">
          {error !== null ? (
            <div
              role="alert"
              className="rounded-[var(--radius-sm)] border border-warning/30 bg-warning-soft px-3 py-2 text-[12px] text-warning-foreground"
            >
              <span className="font-semibold">Heads up:</span> {error}
            </div>
          ) : null}
          <div
            ref={mapDivRef}
            className="w-full aspect-square max-h-[55vh] rounded-[var(--radius-md)] bg-surface-soft overflow-hidden"
          />
          {/* Resolved-address line. min-height locks the row so the
              layout doesn't jump between "loading" / "resolved" /
              "fallback to coords" — visible feedback on every drag. */}
          <div className="text-xs text-muted-foreground min-h-[2.5em] leading-snug">
            {resolving ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" aria-hidden />
                Reading address…
              </span>
            ) : resolved !== null ? (
              <span className="inline-flex items-start gap-1.5">
                <MapPin className="size-3 mt-0.5 shrink-0" aria-hidden />
                <span className="break-words">{resolved.label}</span>
              </span>
            ) : (
              <span className="inline-flex items-start gap-1.5">
                <MapPin className="size-3 mt-0.5 shrink-0" aria-hidden />
                <span className="tabular-nums">
                  {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                </span>
              </span>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" className="flex-1" onClick={handleConfirm}>
              Confirm pin
            </Button>
          </div>
        </div>
      </BottomSheetContent>
    </BottomSheet>
  )
}
