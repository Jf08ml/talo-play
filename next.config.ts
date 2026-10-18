import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.trycloudflare.com"],
  async redirects() {
    // Ludo became Parchís (same game id, so old rooms still work).
    return [
      { source: "/ludo", destination: "/parchis", permanent: true },
      { source: "/ludo/:roomId", destination: "/parchis/:roomId", permanent: true },
    ];
  },
};

export default nextConfig;
