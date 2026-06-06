"use client"

/**
 * IP-3 — Reverse-geocode `{lat, lng}` into a human-readable label using
 * Google's Geocoding API. 24h localStorage cache keyed by a coarse grid
 * (~100m) saves ~95% of the spend — most customers stay in the same
 * neighbourhood between sessions.
 *
 * Returns `null` (not throws) on any error so callers can fall back to
 * a raw coord string without a try/catch at every call site.
 */

import { loadGoogleMaps } from "@workspace/ui/lib/google-maps-loader"

export interface ReverseGeocodeResult {
  /** Short human label, e.g. "Brookefield, Bengaluru". */
  label: string
  /** Structured pieces the caller can use to compose a fancier label. */
  components: {
    /** L1 in addresses, often "Indiranagar". */
    sublocality: string | null
    /** Usually the city, e.g. "Bengaluru". */
    locality: string | null
    /** State, e.g. "Karnataka". */
    administrativeArea: string | null
    /** Pincode if Google provides one. */
    postalCode: string | null
    /** Country (always "India" given our service area, but here for completeness). */
    country: string | null
    /** Place ID for follow-up Place Details calls. */
    placeId: string | null
  }
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h
const CACHE_KEY_PREFIX = "kirana.geocode."

interface CacheEntry {
  result: ReverseGeocodeResult | null
  expiresAt: number
}

function gridKey(lat: number, lng: number): string {
  // 3-decimal precision ≈ 110m at the equator. Adjacent customers in
  // the same building share a cache entry without the label drifting.
  return `${CACHE_KEY_PREFIX}${lat.toFixed(3)},${lng.toFixed(3)}`
}

function readCache(key: string): ReverseGeocodeResult | null | undefined {
  if (typeof window === "undefined") return undefined
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return undefined
    const entry = JSON.parse(raw) as CacheEntry
    if (entry.expiresAt < Date.now()) {
      window.localStorage.removeItem(key)
      return undefined
    }
    return entry.result
  } catch {
    return undefined
  }
}

function writeCache(key: string, result: ReverseGeocodeResult | null): void {
  if (typeof window === "undefined") return
  try {
    const entry: CacheEntry = { result, expiresAt: Date.now() + CACHE_TTL_MS }
    window.localStorage.setItem(key, JSON.stringify(entry))
  } catch {
    // Quota / private-mode — silently ignore; the network call just
    // repeats next time.
  }
}

/**
 * Pull a structured address component by type. Google returns
 * components keyed by an array of types; we pick the first that has
 * the desired type.
 */
function componentByType(
  components: Array<{ long_name: string; types: string[] }>,
  type: string,
): string | null {
  const hit = components.find((c) => c.types.includes(type))
  return hit?.long_name ?? null
}

/**
 * Build the short label the location pill uses. Prefers
 * `sublocality, locality` ("Brookefield, Bengaluru") and falls back
 * through `locality` → `administrativeArea` → the full formatted
 * address as a last resort.
 */
function buildLabel(
  comp: ReverseGeocodeResult["components"],
  fallbackFormatted: string,
): string {
  if (comp.sublocality !== null && comp.locality !== null) {
    return `${comp.sublocality}, ${comp.locality}`
  }
  if (comp.locality !== null) return comp.locality
  if (comp.administrativeArea !== null) return comp.administrativeArea
  return fallbackFormatted
}

export async function reverseGeocode(coords: {
  lat: number
  lng: number
}): Promise<ReverseGeocodeResult | null> {
  const key = gridKey(coords.lat, coords.lng)
  const cached = readCache(key)
  if (cached !== undefined) return cached

  try {
    const google = await loadGoogleMaps()
    const geocoder = new google.maps.Geocoder()
    const { results } = await geocoder.geocode({
      location: { lat: coords.lat, lng: coords.lng },
    })
    const top = results[0]
    if (top === undefined) {
      writeCache(key, null)
      return null
    }
    // Google's address_components are ordered most-specific → least, but
    // type-keyed lookup is more reliable than positional.
    const components: ReverseGeocodeResult["components"] = {
      sublocality:
        componentByType(top.address_components, "sublocality_level_1") ??
        componentByType(top.address_components, "sublocality") ??
        componentByType(top.address_components, "neighborhood"),
      locality: componentByType(top.address_components, "locality"),
      administrativeArea: componentByType(
        top.address_components,
        "administrative_area_level_1",
      ),
      postalCode: componentByType(top.address_components, "postal_code"),
      country: componentByType(top.address_components, "country"),
      placeId: top.place_id ?? null,
    }
    const result: ReverseGeocodeResult = {
      label: buildLabel(components, top.formatted_address),
      components,
    }
    writeCache(key, result)
    return result
  } catch {
    // Any error → null. The location pill falls back to the raw coord
    // string. Don't poison the cache on transient failures (so the next
    // visit retries) — but DO cache `null` on a successful empty-result
    // (above) so we don't hammer the API for known-unmapped coords.
    return null
  }
}
