import type { Coordinates } from "@/src/lib/types";

const noiseUrl = "https://data.rivm.nl/geo/alo/wms";
const airUrl = "https://data.rivm.nl/geo/lucht/wms";

export const rivmUrls = {
  noise: "https://data.rivm.nl/geo/alo/wms?request=GetCapabilities",
  air: "https://data.rivm.nl/geo/lucht/wms?request=GetCapabilities",
};

export type RivmContext = {
  noiseLden?: number;
  no2?: number;
  pm25?: number;
  fetchedAt: string;
};

export async function getFeatureValue(baseUrl: string, layer: string, coordinates: Coordinates) {
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
  const response = await fetch(`${baseUrl}?${params}`, { next: { revalidate: 86400 } });
  if (!response.ok) throw new Error(`RIVM WMS ${response.status}`);
  const payload = await response.json() as { features?: { properties?: Record<string, unknown> }[] };
  const properties = payload.features?.[0]?.properties ?? {};
  const candidate = Object.entries(properties).find(([key, value]) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return false;
    return /value|mean|lden|no2|pm|concentr|klasse/i.test(key) || Object.keys(properties).length === 1;
  })?.[1];
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : undefined;
}

export async function getRivmContext(coordinates: Coordinates): Promise<RivmContext | null> {
  const [noise, no2, pm25] = await Promise.allSettled([
    getFeatureValue(noiseUrl, "rivm_20250101_Geluid_lden_wegverkeer_2022", coordinates),
    getFeatureValue(airUrl, "actueel_no2", coordinates),
    getFeatureValue(airUrl, "actueel_pm25", coordinates),
  ]);
  const context: RivmContext = {
    noiseLden: noise.status === "fulfilled" ? noise.value : undefined,
    no2: no2.status === "fulfilled" ? no2.value : undefined,
    pm25: pm25.status === "fulfilled" ? pm25.value : undefined,
    fetchedAt: new Date().toISOString(),
  };
  return context.noiseLden != null || context.no2 != null || context.pm25 != null ? context : null;
}
