import type { MetadataRoute } from "next";
import { locales } from "@/src/lib/i18n/config";

const SITE_URL = process.env.WOONREALITY_APP_URL ?? "https://woonreality.vercel.app";

/** Public, indexable routes. Property and place reports are dynamic per
 * address/case and are intentionally excluded; auth-gated workspaces too. */
const PUBLIC_PATHS = ["", "/hypotheek", "/kaart", "/vergelijken", "/extensie"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PUBLIC_PATHS.flatMap((path) =>
    locales.map((locale) => ({
      url: `${SITE_URL}/${locale}${path}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: path === "" ? 1 : 0.7,
      alternates: {
        languages: Object.fromEntries(locales.map((l) => [l, `${SITE_URL}/${l}${path}`])),
      },
    })),
  );
}
