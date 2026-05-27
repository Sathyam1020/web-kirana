export function formatPriceFromPaise(paise: number): string {
  const rupees = paise / 100
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
}

export function rupeesToPaise(rupees: string): number {
  const n = Number(rupees)
  if (Number.isNaN(n)) return 0
  return Math.round(n * 100)
}

export function paiseToRupees(paise: number): string {
  return (paise / 100).toFixed(2)
}

export function describeApiError(err: unknown): string {
  if (err && typeof err === "object" && "message" in err && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message
  }
  return "Something went wrong"
}
