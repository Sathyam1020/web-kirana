export function formatPriceFromPaise(paise: number): string {
  const rupees = paise / 100
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters}m`
  const km = meters / 1000
  return `${km.toFixed(km < 10 ? 1 : 0)}km`
}

export function describeApiError(err: unknown): string {
  if (err && typeof err === "object" && "message" in err && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message
  }
  return "Something went wrong"
}
