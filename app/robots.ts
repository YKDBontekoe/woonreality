import type { MetadataRoute } from "next";

const SITE_URL = process.env.WOONREALITY_APP_URL ?? "https://woonreality.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/auth/", "/login", "/onboarding", "/mijn-aankoop"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
