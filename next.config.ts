import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  // The original Vite build did not lint; `npm run lint` remains available.
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Route redirects carried over from the old react-router config
  async redirects() {
    return [
      { source: "/requirements", destination: "/dashboard", permanent: false },
      { source: "/analytics", destination: "/analytics/overview", permanent: false },
    ];
  },
};

export default nextConfig;
