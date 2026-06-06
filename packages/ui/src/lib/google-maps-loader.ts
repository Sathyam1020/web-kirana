"use client"

/**
 * IP-3 — Singleton Google Maps JS API loader.
 *
 * Why a custom loader instead of @googlemaps/js-api-loader: keeps the
 * dependency surface lean (no new package) and lets us own the failure
 * modes (typed errors, key-missing detection, idempotent re-use across
 * every `<AddressAutocomplete>` mount).
 *
 * Loaded ONCE per page — every consumer awaits the same promise. After
 * the first resolve, callers get the cached promise immediately. If the
 * script tag fails (network blip, key revoked), the promise rejects and
 * a subsequent call will retry (we don't poison the cache on failure).
 *
 * Libraries we load: `places` (for autocomplete) + `geocoding` (for
 * reverse-lookup). Maps JS itself is implicit.
 *
 * Public key: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. Restrict by HTTP referrer
 * in GCP — leaks of a referrer-restricted key are non-load-bearing.
 */

export interface GoogleMapsNamespace {
  maps: {
    importLibrary: (lib: string) => Promise<unknown>
    places: unknown
    Geocoder: new () => {
      geocode: (req: { location: { lat: number; lng: number } }) => Promise<{
        results: Array<{
          formatted_address: string
          place_id: string
          address_components: Array<{
            long_name: string
            short_name: string
            types: string[]
          }>
        }>
      }>
    }
  }
}

declare global {
  interface Window {
    google?: GoogleMapsNamespace
  }
}

export class MapsKeyMissingError extends Error {
  constructor() {
    super(
      "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set. Add it to .env.local for dev and to the Vercel project for deploy.",
    )
    this.name = "MapsKeyMissingError"
  }
}

let cached: Promise<GoogleMapsNamespace> | null = null

/**
 * Load + initialise the Google Maps JS API. Resolves to the global
 * `google` namespace. Throws `MapsKeyMissingError` synchronously if
 * the env var isn't set so dev paths fail loud.
 */
export function loadGoogleMaps(): Promise<GoogleMapsNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("loadGoogleMaps called in a non-browser environment"))
  }

  // Already loaded by an earlier call OR by a competing script on the
  // page — short-circuit.
  if (window.google?.maps !== undefined) {
    return Promise.resolve(window.google)
  }

  if (cached !== null) return cached

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (apiKey === undefined || apiKey === "") {
    throw new MapsKeyMissingError()
  }

  cached = new Promise<GoogleMapsNamespace>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-google-maps-loader]",
    )
    if (existing !== null) {
      existing.addEventListener("load", () => {
        if (window.google?.maps !== undefined) resolve(window.google)
        else reject(new Error("Google Maps script loaded but window.google.maps is missing"))
      })
      existing.addEventListener("error", () => reject(new Error("Google Maps script failed to load")))
      return
    }

    const script = document.createElement("script")
    script.setAttribute("data-google-maps-loader", "true")
    script.async = true
    script.defer = true
    // Loads the JS API + Places (new) + Geocoding + Maps libs via
    // importLibrary (Google's recommended modular loader). The
    // `loading=async` param squelches the dev console warning about
    // synchronous loading. `maps` is needed by MapPinRefine; the
    // classic `Marker` constructor is on the core namespace.
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places,geocoding,maps&loading=async`
    script.onload = () => {
      if (window.google?.maps !== undefined) resolve(window.google)
      else reject(new Error("Google Maps script loaded but window.google.maps is missing"))
    }
    script.onerror = () => {
      // Reset cache so a future call can retry — a transient network
      // error shouldn't permanently brick the autocomplete.
      cached = null
      reject(new Error("Google Maps script failed to load"))
    }
    document.head.appendChild(script)
  })

  // On rejection, clear the cache so retries get a fresh attempt.
  cached.catch(() => {
    cached = null
  })

  return cached
}
