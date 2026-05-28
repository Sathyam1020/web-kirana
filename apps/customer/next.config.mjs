/** @type {import('next').NextConfig} */
const API_INTERNAL_URL =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000"

const nextConfig = {
  transpilePackages: ["@workspace/ui", "@workspace/auth", "@workspace/api-client", "@workspace/shared"],
  // Phase 6.6.12: per-app subdomain (customer.localhost:3000) so each app
  // gets a host-scoped session cookie. Without this, Next 15 logs a
  // cross-origin dev warning when HMR assets are fetched from the
  // sub-host. The plain `localhost` entry keeps the old URL working.
  allowedDevOrigins: ["customer.localhost", "localhost"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
  // Proxy /v1/* to the backend so the browser sees the API as same-origin.
  // Auth cookie (kirana.session_token) then land on this Next origin
  // instead of localhost:4000, which lets SSR read them via cookies() and
  // makes sameSite=lax cookies behave correctly across the dev / prod
  // origin boundary.
  async rewrites() {
    return [
      {
        source: "/v1/:path*",
        destination: `${API_INTERNAL_URL}/v1/:path*`,
      },
    ]
  },
}

export default nextConfig
