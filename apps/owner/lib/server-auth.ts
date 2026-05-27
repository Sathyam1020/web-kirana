import { cookies } from "next/headers"

// See apps/customer/lib/server-auth.ts for full rationale.
export async function readAuthCookieHint(): Promise<boolean> {
  const c = await cookies()
  return c.has("kirana.session_token")
}
