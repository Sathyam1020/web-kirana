// Client uses relative URLs — the Next.js `rewrites()` in next.config.mjs
// proxies /v1/* to the backend so the browser sees the API as same-origin.
// This makes auth cookies first-party (so SSR can read them) and removes
// the cross-origin CORS dance.
//
// NEXT_PUBLIC_API_URL is intentionally NOT read here. If set, it's only
// used by next.config.mjs as the rewrite destination (and falls back to
// API_INTERNAL_URL, also unset by default in dev → http://localhost:4000).
export const env = {
  apiUrl: "",
  // The Socket.IO client connects DIRECTLY to the API origin (it can't ride the
  // /v1 rewrite — WS upgrades don't proxy reliably, and the handshake uses a
  // ticket rather than the cookie). The API origin must be in the backend's
  // CORS allowlist. Defaults to the dev backend; set NEXT_PUBLIC_WS_URL in prod.
  wsUrl: process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:4000",
  // Web Push VAPID public key (Phase 10). Empty → notification opt-in is hidden.
  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
}
