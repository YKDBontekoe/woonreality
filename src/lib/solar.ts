type LngLatPoint = { lat: number; lng: number };
type Geometry = import("geojson").Geometry;

const DEG = Math.PI / 180;

/**
 * Solar position via the standard NOAA approximation (Meeus-style). Accurate
 * to well under a degree for NL latitudes between 1950–2050, which is far
 * beyond the precision a buyer needs ("is there low evening/summer sun?").
 * Azimuth is degrees clockwise from true north; elevation in degrees.
 */
export function solarPosition(date: Date, coordinates: { lat: number; lng: number }): { azimuthDeg: number; elevationDeg: number } {
  const minutesUtc = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const dayOfYear = daysSinceJanuaryFirst(date) + date.getUTCHours() / 24;
  const gamma = (2 * Math.PI / 365) * dayOfYear;

  const equationOfTimeMinutes =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const declination =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  // Local solar time: true solar minutes since midnight, converted to an hour
  // angle (negative before solar noon, positive after).
  const trueSolarMinutes = minutesUtc + equationOfTimeMinutes + 4 * coordinates.lng;
  const hourAngle = ((trueSolarMinutes / 4 - 180) * Math.PI) / 180;

  // Sun direction in the local east/north/up frame. East is negative in the
  // morning (sun rises east), so the east term flips sign with the hour angle.
  const east = -Math.cos(declination) * Math.sin(hourAngle);
  const north = Math.cos(coordinates.lat * DEG) * Math.sin(declination) - Math.sin(coordinates.lat * DEG) * Math.cos(declination) * Math.cos(hourAngle);
  const up = Math.sin(coordinates.lat * DEG) * Math.sin(declination) + Math.cos(coordinates.lat * DEG) * Math.cos(declination) * Math.cos(hourAngle);

  const elevation = Math.asin(Math.min(1, Math.max(-1, up))) / DEG;
  const azimuth = (Math.atan2(east, north) / DEG + 360) % 360;
  return { azimuthDeg: azimuth, elevationDeg: elevation };
}

function daysSinceJanuaryFirst(date: Date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const current = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return (current - start) / 86_400_000;
}

/** Compass bearing from `from` to `to`, degrees clockwise from north (0–360). */
export function bearingDeg(from: LngLatPoint, to: LngLatPoint): number {
  const lat1 = from.lat * DEG;
  const lat2 = to.lat * DEG;
  const dLng = (to.lng - from.lng) * DEG;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

const COMPASS_POINTS = ["noord", "noordoost", "oost", "zuidoost", "zuid", "zuidwest", "west", "noordwest"] as const;

export function orientationLabel(bearingDegValue: number): string {
  const normalized = ((bearingDegValue % 360) + 360) % 360;
  return COMPASS_POINTS[Math.round(normalized / 45) % 8];
}

/**
 * Dominant orientation of a building footprint: the bearing of its longest
 * outer-ring edge. For a row house this is the street/garden axis; facades
 * face perpendicular to it, so the useful facade orientation is +90°.
 */
export function polygonLongestEdgeBearing(geometry: Geometry | undefined | null): number | null {
  if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) return null;
  const ring = geometry.type === "Polygon"
    ? (geometry.coordinates[0] as [number, number][] | undefined)
    : (geometry.coordinates[0]?.[0] as [number, number][] | undefined);
  if (!ring || ring.length < 2) return null;
  let bestLength = 0;
  let bestBearing: number | null = null;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [lngA, latA] = ring[index];
    const [lngB, latB] = ring[index + 1];
    const length = haversineM({ lat: latA, lng: lngA }, { lat: latB, lng: latB });
    if (length > bestLength) {
      bestLength = length;
      // Longest edge runs along one facade line; normalize so the bearing
      // points into the southern half-plane where relevant callers expect it.
      bestBearing = bearingDeg({ lat: latA, lng: lngA }, { lat: latB, lng: lngB });
    }
  }
  return bestBearing;
}

/** Average of the outer-ring vertices; good enough centroid for small BGT parcels. */
export function polygonCentroid(geometry: Geometry | undefined | null): LngLatPoint | null {
  if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) return null;
  const ring = geometry.type === "Polygon"
    ? (geometry.coordinates[0] as [number, number][] | undefined)
    : (geometry.coordinates[0]?.[0] as [number, number][] | undefined);
  if (!ring?.length) return null;
  let sumLat = 0;
  let sumLng = 0;
  for (const [lng, lat] of ring) {
    sumLat += lat;
    sumLng += lng;
  }
  return { lat: sumLat / ring.length, lng: sumLng / ring.length };
}

function haversineM(a: LngLatPoint, b: LngLatPoint) {
  const earthRadius = 6_371_000;
  const lat1 = a.lat * DEG;
  const lat2 = b.lat * DEG;
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

export function distanceM(a: LngLatPoint, b: LngLatPoint) {
  return haversineM(a, b);
}
