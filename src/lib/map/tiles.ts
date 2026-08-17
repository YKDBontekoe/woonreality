const WEB_MERCATOR_ORIGIN = 20037508.342789244;
const MAX_LAT = 85.05112878;

export type RivmOverlay = "noise" | "no2" | "pm25";

export const RIVM_LAYERS: Record<RivmOverlay, { wms: string; layer: string; attribution: string; unit: string }> = {
  noise: {
    wms: "https://data.rivm.nl/geo/alo/wms",
    layer: "rivm_20250101_Geluid_lden_wegverkeer_2022",
    attribution: "RIVM wegverkeer Lden",
    unit: "dB Lden",
  },
  no2: {
    wms: "https://data.rivm.nl/geo/lucht/wms",
    layer: "actueel_no2",
    attribution: "RIVM NO2",
    unit: "µg/m³",
  },
  pm25: {
    wms: "https://data.rivm.nl/geo/lucht/wms",
    layer: "actueel_pm25",
    attribution: "RIVM PM2.5",
    unit: "µg/m³",
  },
};

export function parseRivmOverlay(value: string): RivmOverlay | null {
  return value === "noise" || value === "no2" || value === "pm25" ? value : null;
}

export function parseTileIndex(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function isValidTile(z: number, x: number, y: number) {
  if (z < 0 || z > 22) return false;
  const n = 2 ** z;
  return x >= 0 && y >= 0 && x < n && y < n;
}

function lngLatToMeters(lng: number, lat: number): [number, number] {
  const clampedLat = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const x = (lng * WEB_MERCATOR_ORIGIN) / 180;
  const y = (Math.log(Math.tan(((90 + clampedLat) * Math.PI) / 360)) * WEB_MERCATOR_ORIGIN) / Math.PI;
  return [x, y];
}

function tileYToLat(y: number, n: number) {
  return (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
}

/** Web Mercator bbox for a XYZ tile, as `[minX, minY, maxX, maxY]` in EPSG:3857 meters. */
export function xyzToMercatorBbox(z: number, x: number, y: number): [number, number, number, number] {
  const n = 2 ** z;
  const lonMin = (x / n) * 360 - 180;
  const lonMax = ((x + 1) / n) * 360 - 180;
  const latMax = tileYToLat(y, n);
  const latMin = tileYToLat(y + 1, n);
  const [minX, minY] = lngLatToMeters(lonMin, latMin);
  const [maxX, maxY] = lngLatToMeters(lonMax, latMax);
  return [minX, minY, maxX, maxY];
}

export function rivmGetMapUrl(overlay: RivmOverlay, bbox: [number, number, number, number]) {
  const spec = RIVM_LAYERS[overlay];
  const params = new URLSearchParams({
    service: "WMS",
    version: "1.3.0",
    request: "GetMap",
    layers: spec.layer,
    styles: "",
    crs: "EPSG:3857",
    bbox: bbox.join(","),
    width: "256",
    height: "256",
    format: "image/png",
    transparent: "true",
  });
  return `${spec.wms}?${params.toString()}`;
}
