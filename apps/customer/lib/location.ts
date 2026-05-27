"use client"

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
