import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

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

export default withNextIntl(nextConfig);
