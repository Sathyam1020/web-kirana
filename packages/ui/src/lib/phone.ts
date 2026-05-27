// Common Asia/SAARC country dial codes — kirana audience is India-first but
// the marketplace ships internationally-ready. Add to this list when a new
// country goes live.

export interface DialCode {
  /** ISO 3166-1 alpha-2 */
  code: string
  /** Country display name */
  name: string
  /** Without the leading + */
  dial: string
  /** Emoji flag (used in trigger + list) */
  flag: string
}

export const DIAL_CODES: DialCode[] = [
  { code: "IN", name: "India", dial: "91", flag: "🇮🇳" },
  { code: "US", name: "United States", dial: "1", flag: "🇺🇸" },
  { code: "GB", name: "United Kingdom", dial: "44", flag: "🇬🇧" },
  { code: "AE", name: "United Arab Emirates", dial: "971", flag: "🇦🇪" },
  { code: "AU", name: "Australia", dial: "61", flag: "🇦🇺" },
  { code: "BD", name: "Bangladesh", dial: "880", flag: "🇧🇩" },
  { code: "CA", name: "Canada", dial: "1", flag: "🇨🇦" },
  { code: "DE", name: "Germany", dial: "49", flag: "🇩🇪" },
  { code: "FR", name: "France", dial: "33", flag: "🇫🇷" },
  { code: "ID", name: "Indonesia", dial: "62", flag: "🇮🇩" },
  { code: "IT", name: "Italy", dial: "39", flag: "🇮🇹" },
  { code: "JP", name: "Japan", dial: "81", flag: "🇯🇵" },
  { code: "KR", name: "South Korea", dial: "82", flag: "🇰🇷" },
  { code: "LK", name: "Sri Lanka", dial: "94", flag: "🇱🇰" },
  { code: "MY", name: "Malaysia", dial: "60", flag: "🇲🇾" },
  { code: "NP", name: "Nepal", dial: "977", flag: "🇳🇵" },
  { code: "NZ", name: "New Zealand", dial: "64", flag: "🇳🇿" },
  { code: "PH", name: "Philippines", dial: "63", flag: "🇵🇭" },
  { code: "PK", name: "Pakistan", dial: "92", flag: "🇵🇰" },
  { code: "QA", name: "Qatar", dial: "974", flag: "🇶🇦" },
  { code: "SA", name: "Saudi Arabia", dial: "966", flag: "🇸🇦" },
  { code: "SG", name: "Singapore", dial: "65", flag: "🇸🇬" },
  { code: "TH", name: "Thailand", dial: "66", flag: "🇹🇭" },
  { code: "TR", name: "Turkey", dial: "90", flag: "🇹🇷" },
  { code: "ZA", name: "South Africa", dial: "27", flag: "🇿🇦" },
]

export const DEFAULT_DIAL_CODE: DialCode = DIAL_CODES[0]!

export function findDialCode(code: string): DialCode {
  return DIAL_CODES.find((d) => d.code === code) ?? DEFAULT_DIAL_CODE
}

/** Strip everything that isn't a digit. */
export function digitsOnly(input: string): string {
  return input.replace(/\D/g, "")
}

/** Compose backend-canonical phone: `+<dial><digits>`. */
export function composePhone(dial: string, local: string): string {
  return `+${dial}${digitsOnly(local)}`
}
