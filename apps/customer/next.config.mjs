/** @type {import('next').NextConfig} */
const API_INTERNAL_URL =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000"

const nextConfig = {
  transpilePackages: ["@workspace/ui", "@workspace/auth", "@workspace/api-client", "@workspace/shared"],
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
