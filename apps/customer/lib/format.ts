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

/**
 * Deadline-framed ETA for the home hero — turns a minutes estimate into a
 * wall-clock arrival ("by 7:42 pm") off the current time, so the figure
 * reads as a "get it by …" deadline instead of a flat duration. Estimate,
 * not a live countdown: it refreshes on re-render, doesn't tick.
 */
export function formatDeliveryBy(minutes: number, now: Date = new Date()): string {
  const arrival = new Date(now.getTime() + minutes * 60_000)
  return `by ${arrival.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  })}`
}

export function describeApiError(err: unknown): string {
  if (err && typeof err === "object" && "message" in err && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message
  }
  return "Something went wrong"
}
