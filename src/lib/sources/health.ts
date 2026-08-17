import { pdokUrls } from "@/src/lib/sources/pdok/client";
import { cbsBuurtenUrl } from "@/src/lib/sources/cbs";
import { sesStatLineUrl } from "@/src/lib/sources/ses";
import { politieMisdrijvenUrl } from "@/src/lib/sources/politie";
import { rivmUrls } from "@/src/lib/sources/rivm";
import { ndovHaltesUrl } from "@/src/lib/sources/ndov";
import { AFM_TOETSRENTE_URL, parseAfmToetsrente, parseEcbMirObservation } from "@/src/lib/mortgage/market";

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
  { source: "CBS Wijk- en Buurtkaart", url: `${cbsBuurtenUrl}?f=json&bbox=5.9,52.3,6,52.4&limit=1` },
  { source: "CBS SES-WOA", url: `${sesStatLineUrl}?$format=json` },
  { source: "Politie misdrijven", url: `${politieMisdrijvenUrl}?$format=json` },
  { source: "RIVM lucht WMS", url: `${rivmUrls.air}&service=WMS&request=GetCapabilities` },
  { source: "RIVM geluid WMS", url: `${rivmUrls.noise}&service=WMS&request=GetCapabilities` },
  { source: "NDOV haltecatalogus", url: ndovHaltesUrl },
  { source: "AFM toetsrente", url: AFM_TOETSRENTE_URL },
  { source: "ECB/DNB hypotheekrente", url: "https://data-api.ecb.europa.eu/service/data/MIR/M.NL.B.A2C.O.R.A.2250.EUR.N?lastNObservations=1&format=jsondata" },
];

export function sampleRecordValid(check: { source: string; url: string }, body: string) {
  if (body.includes("WMS_Capabilities") || body.includes("ExportCHB_")) return true;
  if (check.source.startsWith("AFM") || check.url.includes("afm.nl")) return Boolean(parseAfmToetsrente(body));

  const trimmed = body.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return false;
  }
  if (check.url.includes("data-api.ecb.europa.eu") || /ECB/i.test(check.source)) {
    return parseEcbMirObservation(parsed) != null;
  }
  return parsed !== null && typeof parsed === "object";
}

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
        sampleRecordValid: response.ok && body.length > 30 && sampleRecordValid({ source, url }, body),
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
