// Client uses relative URLs — Next.js rewrites() proxies /v1/* to the backend.
// See apps/customer/lib/env.ts for the full rationale.
export const env = {
  apiUrl: "",
  // Socket.IO connects directly to the API origin (not via the /v1 rewrite).
  // See apps/customer/lib/env.ts for the full rationale.
  wsUrl: process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:4000",
  // Web Push VAPID public key (Phase 10). Empty → notification opt-in is hidden.
  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
}
