export function formatPriceFromPaise(paise: number): string {
  const rupees = paise / 100
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
}

export function describeApiError(err: unknown): string {
  if (err && typeof err === "object" && "message" in err && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message
  }
  return "Something went wrong"
}
