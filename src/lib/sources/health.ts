import { pdokUrls } from "@/src/lib/sources/pdok/client";
import { cbsBuurtenUrl } from "@/src/lib/sources/cbs";
import { rivmUrls } from "@/src/lib/sources/rivm";
import { ndovHaltesUrl } from "@/src/lib/sources/ndov";
import { AFM_TOETSRENTE_URL, parseAfmToetsrente } from "@/src/lib/mortgage/market";

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
  { source: "RIVM lucht WMS", url: `${rivmUrls.air}&service=WMS&request=GetCapabilities` },
  { source: "RIVM geluid WMS", url: `${rivmUrls.noise}&service=WMS&request=GetCapabilities` },
  { source: "NDOV haltecatalogus", url: ndovHaltesUrl },
  { source: "AFM toetsrente", url: AFM_TOETSRENTE_URL },
  { source: "ECB/DNB hypotheekrente", url: "https://data-api.ecb.europa.eu/service/data/MIR/M.NL.B.A2C.O.R.A.2250.EUR.N?lastNObservations=1&format=jsondata" },
];

export async function checkSources(): Promise<SourceHealth[]> {
  return Promise.all(checks.map(async ({ source, url }) => {
    const started = performance.now();
    try {
      const response = await fetch(url, { cache: "no-store" });
      const body = await response.text();
      const sampleRecordValid = response.ok && body.length > 30 && (
        body.trim().startsWith("{")
        || body.includes("WMS_Capabilities")
        || body.includes("ExportCHB_")
        || Boolean(parseAfmToetsrente(body))
        || body.includes("dataSets")
      );
      return {
        source,
        ok: response.ok,
        checkedAt: new Date().toISOString(),
        latencyMs: Math.round(performance.now() - started),
        sampleRecordValid,
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
