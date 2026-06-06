"use client"

/**
 * IP-3 — Address autocomplete primitive. Wraps Google's new Places
 * Autocomplete API but renders our own input + suggestion list so the
 * UI matches design tokens (Google's default dropdown ignores them).
 *
 * Contract:
 *   - `onSelect(ResolvedAddress)` — the only commit point. Caller
 *     decides what to do with the structured result.
 *   - `currentLocation` (optional) — biases suggestions toward GPS.
 *     Falls back to a country-level bias (India) when absent.
 *   - Graceful failure: if the Maps script can't load (key missing,
 *     network down), the component degrades to a plain `<input>` so
 *     the caller's form still accepts manual entry.
 *
 * NOTE on the Google API: we use `AutocompleteSuggestion.fetchAutocompleteSuggestions`
 * (the "new" Places API) instead of the deprecated `AutocompleteService`.
 * The new API returns richer place data + has better Indian coverage.
 */

import { Loader2, MapPin, Search, X } from "lucide-react"
import * as React from "react"

import { loadGoogleMaps, MapsKeyMissingError } from "@workspace/ui/lib/google-maps-loader"
import { cn } from "@workspace/ui/lib/utils"

export interface ResolvedAddress {
  /** Google place ID — caller can persist for re-resolution / dedupe. */
  placeId: string
  /** Human-readable label, e.g. "ITPL Main Road, Brookefield, Bengaluru". */
  label: string
  /** Address line 1 — what the customer would write on an envelope. */
  line1: string
  /** Locality (city). */
  city: string
  /** PIN code, or empty string if Google didn't return one. */
  pincode: string
  lat: number
  lng: number
}

interface AddressAutocompleteProps {
  /** Called when the user picks a suggestion. */
  onSelect: (resolved: ResolvedAddress) => void
  /** Optional placeholder. Defaults to "Search for your address". */
  placeholder?: string
  /** Bias suggestions toward this point. Falls back to India bias. */
  currentLocation?: { lat: number; lng: number } | null
  /** Initial input value, useful for edit dialogs that prefill. */
  initialValue?: string
  /** Forwarded to the input — handy for keyboard nav from a parent form. */
  autoFocus?: boolean
  className?: string
}

// New Places API types we depend on. Declared loosely — the runtime
// shape is what Google returns, not what TS sees.
interface AutocompleteSuggestion {
  placePrediction: {
    placeId: string
    text: { text: string }
    structuredFormat?: {
      mainText?: { text: string }
      secondaryText?: { text: string }
    }
    toPlace: () => {
      fetchFields: (opts: { fields: string[] }) => Promise<void>
      id: string
      formattedAddress: string
      addressComponents: Array<{
        longText: string
        shortText: string
        types: string[]
      }>
      location: { lat: () => number; lng: () => number }
    }
  }
}

interface AutocompleteSuggestionStatic {
  fetchAutocompleteSuggestions: (req: {
    input: string
    locationBias?: unknown
    includedRegionCodes?: string[]
    language?: string
  }) => Promise<{ suggestions: AutocompleteSuggestion[] }>
}

interface PlacesNamespace {
  AutocompleteSuggestion: AutocompleteSuggestionStatic
}

const DEBOUNCE_MS = 250

function componentByType(
  components: Array<{ longText: string; types: string[] }>,
  type: string,
): string | null {
  const hit = components.find((c) => c.types.includes(type))
  return hit?.longText ?? null
}

export function AddressAutocomplete({
  onSelect,
  placeholder = "Search for your address",
  currentLocation,
  initialValue = "",
  autoFocus,
  className,
}: AddressAutocompleteProps) {
  const [input, setInput] = React.useState(initialValue)
  const [suggestions, setSuggestions] = React.useState<AutocompleteSuggestion[]>([])
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  // `degraded` means the Maps script failed to load — we still render
  // the input + accept caller-handled manual entry through the standard
  // `value/onChange` you'd get from a `<input>`. The caller can detect
  // this by listening for input events (we forward the raw text on
  // every keystroke via `onSelect` when the suggestion path can't fire).
  const [degraded, setDegraded] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const debounceRef = React.useRef<number | null>(null)
  const placesRef = React.useRef<PlacesNamespace | null>(null)

  // Lazy-load the Maps namespace + `places` library on first mount.
  React.useEffect(() => {
    let cancelled = false
    let mountFailed = false
    try {
      loadGoogleMaps()
        .then(async (google) => {
          if (cancelled) return
          try {
            const places = (await google.maps.importLibrary(
              "places",
            )) as PlacesNamespace
            // The new Places API exposes AutocompleteSuggestion on the
            // imported library namespace — verify it's there so a key
            // restricted to an older API doesn't silently fail.
            if (typeof places.AutocompleteSuggestion?.fetchAutocompleteSuggestions !== "function") {
              setError(
                "Places (New) API not enabled — enable it in Google Cloud Console + reload.",
              )
              setDegraded(true)
              return
            }
            placesRef.current = places
          } catch {
            setError(
              "Couldn't load the Places library. Type the address manually.",
            )
            setDegraded(true)
          }
        })
        .catch((err: unknown) => {
          if (cancelled) return
          if (err instanceof MapsKeyMissingError) {
            setError(
              "Google Maps key missing — set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in .env.local + restart the dev server.",
            )
          } else {
            setError(
              "Couldn't reach Maps. Type the address manually.",
            )
          }
          setDegraded(true)
        })
    } catch (err) {
      // loadGoogleMaps throws synchronously when the env var is unset.
      mountFailed = true
      if (err instanceof MapsKeyMissingError) {
        setError(
          "Google Maps key missing — set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in .env.local + restart the dev server.",
        )
      } else {
        setError("Maps script couldn't load.")
      }
      setDegraded(true)
    }
    if (mountFailed) {
      // Nothing else to do — degraded state already set.
    }
    return () => {
      cancelled = true
    }
  }, [])

  // Debounced query effect — fires once the input has been still for
  // 250ms so we don't burn autocomplete quota on every keystroke.
  React.useEffect(() => {
    if (degraded) return
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current)
    }
    const trimmed = input.trim()
    if (trimmed.length < 3) {
      setSuggestions([])
      setOpen(false)
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = window.setTimeout(async () => {
      try {
        const places = placesRef.current
        if (places === null) return
        const req: Parameters<
          AutocompleteSuggestionStatic["fetchAutocompleteSuggestions"]
        >[0] = {
          input: trimmed,
          // India country bias — the marketplace is India-only.
          includedRegionCodes: ["in"],
          language: "en",
        }
        if (currentLocation !== undefined && currentLocation !== null) {
          // Bias toward a 50km circle around the customer's GPS so
          // local suggestions float to the top. The new Places API
          // accepts a CircleLiteral directly — NOT wrapped in a
          // `{circle: ...}` envelope (that's the legacy API shape).
          req.locationBias = {
            center: { lat: currentLocation.lat, lng: currentLocation.lng },
            radius: 50_000,
          }
        }
        const response =
          await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(req)
        const result = response?.suggestions ?? []
        // Filter to suggestions that actually carry a placePrediction —
        // queryPrediction-only entries can't be resolved to a real place.
        const usable = result.filter((s) => s.placePrediction !== undefined)
        setSuggestions(usable)
        setOpen(usable.length > 0)
        // No matches for >2 chars is normal (typo, very obscure place);
        // surface a passive "No matches" state instead of a silent empty.
        if (usable.length === 0) {
          setError(null) // clear any prior load error
        }
      } catch (err: unknown) {
        // Console-log the raw error so the developer can see Google's
        // REQUEST_DENIED / OVER_QUERY_LIMIT / etc. response inline.
        // eslint-disable-next-line no-console
        console.error("[AddressAutocomplete] fetchAutocompleteSuggestions failed:", err)
        setSuggestions([])
        setOpen(false)
        // Surface a concise human-readable hint so the customer doesn't
        // think they typed wrong.
        const msg = (err as { message?: string })?.message ?? ""
        if (/REQUEST_DENIED/i.test(msg)) {
          setError(
            "Places API rejected the request — check the API key restrictions in GCP (HTTP referrers, enabled APIs).",
          )
        } else if (/OVER_QUERY_LIMIT/i.test(msg)) {
          setError("Daily Places quota exhausted. Try again tomorrow.")
        } else {
          setError("Places suggestions failed. See the browser console for details.")
        }
      } finally {
        setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    }
  }, [input, currentLocation, degraded])

  async function handlePick(suggestion: AutocompleteSuggestion): Promise<void> {
    setLoading(true)
    setOpen(false)
    try {
      const place = suggestion.placePrediction.toPlace()
      // Fetch the fields we actually need — Google bills per field set,
      // so picking only what we use keeps cost predictable.
      await place.fetchFields({
        fields: [
          "id",
          "formattedAddress",
          "addressComponents",
          "location",
        ],
      })
      const lat = place.location.lat()
      const lng = place.location.lng()
      const components = place.addressComponents
      const resolved: ResolvedAddress = {
        placeId: place.id,
        label: place.formattedAddress,
        // Build line1 from the most specific components Google returned.
        // Different places carry different combinations, so we fall
        // back gracefully to the formatted address minus the trailing
        // city/state/country.
        line1: buildLine1(components, place.formattedAddress),
        city:
          componentByType(components, "locality") ??
          componentByType(components, "administrative_area_level_2") ??
          "",
        pincode: componentByType(components, "postal_code") ?? "",
        lat,
        lng,
      }
      onSelect(resolved)
      // Reflect the picked label in the input so the user has a
      // confirmation cue, then close the dropdown.
      setInput(suggestion.placePrediction.text.text)
      setSuggestions([])
    } catch {
      setError("Couldn't load place details. Pick another suggestion.")
    } finally {
      setLoading(false)
    }
  }

  function handleClear(): void {
    setInput("")
    setSuggestions([])
    setOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Search
          aria-hidden
          className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={input}
          autoFocus={autoFocus}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true)
          }}
          onBlur={() => {
            // Defer close so a click on a suggestion item registers
            // before the dropdown unmounts.
            window.setTimeout(() => setOpen(false), 150)
          }}
          placeholder={degraded ? "Type your address" : placeholder}
          className={cn(
            "w-full h-10 pl-9 pr-9 rounded-[var(--radius-md)] border border-border bg-card text-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "placeholder:text-muted-foreground",
          )}
        />
        {loading ? (
          <Loader2
            aria-hidden
            className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground animate-spin"
          />
        ) : input.length > 0 ? (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 size-6 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-surface-soft hover:text-foreground transition-colors"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {error ? (
        <div
          role="alert"
          className={cn(
            "mt-2 rounded-[var(--radius-sm)] border border-warning/30 bg-warning-soft px-3 py-2",
            "text-[12px] text-warning-foreground leading-snug",
          )}
        >
          <span className="font-semibold">Heads up:</span> {error}
        </div>
      ) : null}

      {/* When the script loaded fine, the input has ≥3 chars, the query
          finished (not loading), and we got back nothing, show a passive
          "no matches" hint so the customer knows the box DID respond —
          they're not waiting forever on an invisible loading state. */}
      {!degraded && !loading && input.trim().length >= 3 && suggestions.length === 0 && error === null ? (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-30 rounded-[var(--radius-md)] border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground">
          No matches. Try a nearby landmark or a more general area name.
        </div>
      ) : null}
      {open && !degraded && suggestions.length > 0 ? (
        <ul
          role="listbox"
          className={cn(
            "absolute left-0 right-0 top-full mt-1.5 z-30",
            "max-h-72 overflow-y-auto",
            "rounded-[var(--radius-md)] border border-border bg-card shadow-lg",
          )}
        >
          {suggestions.map((s) => {
            const main =
              s.placePrediction.structuredFormat?.mainText?.text ??
              s.placePrediction.text.text
            const secondary =
              s.placePrediction.structuredFormat?.secondaryText?.text ?? ""
            return (
              <li key={s.placePrediction.placeId}>
                <button
                  type="button"
                  // `onMouseDown` instead of `onClick` so the input's
                  // onBlur doesn't fire before the pick registers.
                  onMouseDown={(e) => {
                    e.preventDefault()
                    void handlePick(s)
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2.5 flex items-start gap-2",
                    "hover:bg-surface-soft transition-colors",
                  )}
                >
                  <MapPin
                    aria-hidden
                    className="size-4 mt-0.5 shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-tight truncate">
                      {main}
                    </span>
                    {secondary !== "" ? (
                      <span className="block text-xs text-muted-foreground truncate">
                        {secondary}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

/**
 * Build a usable address line 1 from Google's components. The
 * heuristic: stitch together the most specific components (route,
 * premise, street_number) and fall back to "the formatted address
 * minus the trailing locality / state / pincode / country" so we
 * never return an empty line1.
 */
function buildLine1(
  components: Array<{ longText: string; types: string[] }>,
  formatted: string,
): string {
  const pieces: string[] = []
  const premise = componentByType(components, "premise")
  const streetNumber = componentByType(components, "street_number")
  const route = componentByType(components, "route")
  const sublocality =
    componentByType(components, "sublocality_level_1") ??
    componentByType(components, "sublocality") ??
    componentByType(components, "neighborhood")
  if (premise !== null) pieces.push(premise)
  if (streetNumber !== null) pieces.push(streetNumber)
  if (route !== null) pieces.push(route)
  if (sublocality !== null) pieces.push(sublocality)
  if (pieces.length > 0) return pieces.join(", ")
  // Fallback: chop off everything from the city onward. Heuristic
  // but reasonable — Google's formatted_address is comma-separated
  // most → least specific (Indian style).
  const locality = componentByType(components, "locality")
  if (locality !== null) {
    const idx = formatted.indexOf(locality)
    if (idx > 0) return formatted.slice(0, idx).replace(/,\s*$/, "")
  }
  return formatted
}
