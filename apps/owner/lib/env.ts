// Client uses relative URLs — Next.js rewrites() proxies /v1/* to the backend.
// See apps/customer/lib/env.ts for the full rationale.
export const env = {
  apiUrl: "",
}
