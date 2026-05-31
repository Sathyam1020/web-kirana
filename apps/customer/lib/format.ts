export function formatPriceFromPaise(paise: number): string {
  const rupees = paise / 100
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters}m`
  const km = meters / 1000
  return `${km.toFixed(km < 10 ? 1 : 0)}km`
}

/**
 * Rough delivery-time estimate from straight-line distance. Assumes a ~5 min
 * store prep window + ~25 km/h average rider speed (bike, Indian city
 * traffic). Returns a min/max window with a 10 min spread to under-promise.
 *
 * Server-side data (actual rider GPS, time-of-day) will eventually replace
 * this — keep the helper here so swapping the source is a one-line change.
 */
export function estimateEta(meters: number): { min: number; max: number } {
  const km = Math.max(0.3, meters / 1000)
  const ridingMinutes = (km / 25) * 60
  const prep = 5
  const center = Math.round(prep + ridingMinutes)
  return { min: Math.max(10, center - 5), max: center + 10 }
}

export function formatEta(meters: number): string {
  const { min, max } = estimateEta(meters)
  return `${min}–${max} mins`
}

export function describeApiError(err: unknown): string {
  if (err && typeof err === "object" && "message" in err && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message
  }
  return "Something went wrong"
}
