import { cookies } from "next/headers"

/**
 * SSR-side check for whether the user is likely authenticated. Reads the
 * httpOnly refresh-token cookie (only visible to the server) via the
 * Next.js cookies() API.
 *
 * Works only because next.config.mjs rewrites /v1/* to the backend, which
 * makes the backend's Set-Cookie land on this Next origin — without the
 * rewrite, the cookie would be on localhost:4000 and invisible here.
 *
 * The cookie's presence alone is the signal — we don't (and can't) verify
 * the token here. Validation happens on the next backend round-trip
 * (either getSession() on client mount, or any first authed request).
 * Returning true just lets first paint render the authed shell.
 */
export async function readAuthCookieHint(): Promise<boolean> {
  const c = await cookies()
  return c.has("kirana.session_token")
}
