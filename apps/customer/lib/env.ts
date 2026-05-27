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
}
