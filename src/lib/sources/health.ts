import { pdokUrls } from "@/src/lib/sources/pdok/client";

export type SourceHealth = {
  source: string;
  ok: boolean;
  checkedAt: string;
  latencyMs: number;
  sampleRecordValid: boolean;
  error?: string;
};

const checks = [
  { source: "PDOK Location API", url: `${pdokUrls.location.replace("?f=html", "?f=json")}` },
  { source: "PDOK BAG", url: `${pdokUrls.bag.replace("?f=html", "?f=json")}` },
  { source: "PDOK BGT", url: `${pdokUrls.bgt}collections/wegdeel?f=json` },
];

export async function checkSources(): Promise<SourceHealth[]> {
  return Promise.all(checks.map(async ({ source, url }) => {
    const started = performance.now();
    try {
      const response = await fetch(url, { cache: "no-store" });
      const body = await response.text();
      return {
        source,
        ok: response.ok,
        checkedAt: new Date().toISOString(),
        latencyMs: Math.round(performance.now() - started),
        sampleRecordValid: response.ok && body.trim().startsWith("{") && body.length > 30,
        ...(response.ok ? {} : { error: `HTTP ${response.status}` }),
      };
    } catch (error) {
      return {
        source,
        ok: false,
        checkedAt: new Date().toISOString(),
        latencyMs: Math.round(performance.now() - started),
        sampleRecordValid: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }));
}
