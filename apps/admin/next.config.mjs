/** @type {import('next').NextConfig} */
const API_INTERNAL_URL =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000"

const nextConfig = {
  transpilePackages: ["@workspace/ui", "@workspace/auth", "@workspace/api-client", "@workspace/shared"],
  // Phase 6.6.12: per-app subdomain (admin.localhost:3002) so each app
  // gets a host-scoped session cookie. Without this, Next 15 logs a
  // cross-origin dev warning when HMR assets are fetched from the
  // sub-host. The plain `localhost` entry keeps the old URL working.
  allowedDevOrigins: ["admin.localhost", "localhost"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
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
