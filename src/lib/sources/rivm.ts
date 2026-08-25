import type { Coordinates } from "@/src/lib/types";
import type { SourceContextBase } from "@/src/lib/source-context";
import { fetchJson } from "@/src/lib/http/fetch-json";

const noiseUrl = "https://data.rivm.nl/geo/alo/wms";
const airUrl = "https://data.rivm.nl/geo/lucht/wms";

/**
 * RIVM "Kans op overstroming" (Klimaateffectenatlas): national raster of how
 * often an area would flood when primary flood defences fail. Class values are
 * indices into the official legend, see FLOOD_RISK_CLASSES in rivm-signals.
 */
export const rivmFloodLayer = "20231201_kans_overstroming";

export const rivmUrls = {
  noise: "https://data.rivm.nl/geo/alo/wms?request=GetCapabilities",
  air: "https://data.rivm.nl/geo/lucht/wms?request=GetCapabilities",
  flood: `https://data.rivm.nl/geo/alo/wms?request=GetLegendGraphic&format=image%2Fpng&layer=${rivmFloodLayer}`,
};

export type RivmContext = SourceContextBase & {
  noiseLden?: number;
  no2?: number;
  pm25?: number;
  /** Legend class index (1–6); undefined when the raster had no value here. */
  floodClass?: number;
};

async function fetchFeatureInfo(layerUrl: string, layer: string, coordinates: Coordinates) {
  const delta = 0.00035;
  const params = new URLSearchParams({
    service: "WMS",
    version: "1.3.0",
    request: "GetFeatureInfo",
    layers: layer,
    query_layers: layer,
    styles: "",
    crs: "CRS:84",
    bbox: `${coordinates.lng - delta},${coordinates.lat - delta},${coordinates.lng + delta},${coordinates.lat + delta}`,
    width: "3",
    height: "3",
    i: "1",
    j: "1",
    info_format: "application/json",
    feature_count: "1",
  });
  return fetchJson<{ features?: { properties?: Record<string, unknown> }[] }>(
    `${layerUrl}?${params}`,
    `RIVM WMS ${layer}`,
    { revalidate: 86400 },
  );
}

export async function getFeatureValue(baseUrl: string, layer: string, coordinates: Coordinates) {
  const payload = await fetchFeatureInfo(baseUrl, layer, coordinates);
  const properties = payload.features?.[0]?.properties ?? {};
  const candidate = Object.entries(properties).find(([key, value]) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return false;
    return /value|mean|lden|no2|pm|concentr|klasse/i.test(key) || Object.keys(properties).length === 1;
  })?.[1];
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : undefined;
}

/**
 * The flood raster returns a single GRAY_INDEX class value instead of the
 * named numeric properties getFeatureValue looks for, so it gets its own
 * reader that validates the legend range explicitly.
 */
async function getFloodRiskClass(coordinates: Coordinates) {
  const payload = await fetchFeatureInfo(noiseUrl, rivmFloodLayer, coordinates);
  const value = payload.features?.[0]?.properties?.GRAY_INDEX;
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6 ? value : undefined;
}

export async function getRivmContext(coordinates: Coordinates): Promise<RivmContext | null> {
  const [noise, no2, pm25, flood] = await Promise.allSettled([
    getFeatureValue(noiseUrl, "rivm_20250101_Geluid_lden_wegverkeer_2022", coordinates),
    getFeatureValue(airUrl, "actueel_no2", coordinates),
    getFeatureValue(airUrl, "actueel_pm25", coordinates),
    getFloodRiskClass(coordinates),
  ]);
  const context: RivmContext = {
    noiseLden: noise.status === "fulfilled" ? noise.value : undefined,
    no2: no2.status === "fulfilled" ? no2.value : undefined,
    pm25: pm25.status === "fulfilled" ? pm25.value : undefined,
    floodClass: flood.status === "fulfilled" ? flood.value : undefined,
    fetchedAt: new Date().toISOString(),
  };
  return context.noiseLden != null || context.no2 != null || context.pm25 != null || context.floodClass != null
    ? context
    : null;
}
