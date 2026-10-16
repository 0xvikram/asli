import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/.well-known/asli-issuer.json", destination: "/api/well-known" }]
  },
}

export default nextConfig
