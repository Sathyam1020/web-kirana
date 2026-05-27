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
