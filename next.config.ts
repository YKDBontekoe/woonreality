import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  poweredByHeader: false,
  experimental: {
    // Tree-shake barrel-file icon imports down to the icons actually used,
    // shrinking the client bundle.
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
