"use client"

import { reverseGeocode } from "@workspace/ui/lib/reverse-geocode"
import { useEffect, useState } from "react"

const STORAGE_KEY = "kirana.last-location"

export interface LatLng {
  lat: number
  lng: number
  label?: string
}

export function readStoredLocation(): LatLng | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as LatLng
    if (typeof parsed.lat === "number" && typeof parsed.lng === "number") {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

export function writeStoredLocation(loc: LatLng): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(loc))
  } catch {
    // ignore
  }
}

export type LocationStatus = "idle" | "requesting" | "ready" | "denied"

export function useUserLocation() {
  const [location, setLocation] = useState<LatLng | null>(null)
  const [status, setStatus] = useState<LocationStatus>("idle")

  useEffect(() => {
    const stored = readStoredLocation()
    if (stored !== null) {
      setLocation(stored)
      setStatus("ready")
    }
  }, [])

  function request() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("denied")
      return
    }
    setStatus("requesting")
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next: LatLng = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }
        setLocation(next)
        writeStoredLocation(next)
        setStatus("ready")
      },
      () => setStatus("denied"),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    )
  }

  return { location, status, request, setLocation }
}

/**
 * IP-3 — Resolves the customer's coords into a human label using the
 * shared reverse-geocode helper. Returns:
 *   - "loading" while the geocode call is in-flight
 *   - the label string ("Brookefield, Bengaluru") on success
 *   - null when no coords yet OR the geocode failed (caller falls back
 *     to "Set location" or a raw coord display)
 *
 * The geocode call itself is cached for 24h in localStorage so this
 * hook is cheap on repeat visits.
 */
export function useResolvedLocation(coords: LatLng | null): {
  label: string | null
  loading: boolean
} {
  const [label, setLabel] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (coords === null) {
      setLabel(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    reverseGeocode({ lat: coords.lat, lng: coords.lng })
      .then((result) => {
        if (cancelled) return
        setLabel(result?.label ?? null)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setLabel(null)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [coords?.lat, coords?.lng])

  return { label, loading }
}
