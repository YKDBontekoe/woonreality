/**
 * Approximate meters-per-degree conversions for small Dutch search buffers.
 * Good enough for bbox queries (PDOK, BGT); not for precise measurement —
 * use src/lib/geo/measure.ts haversineM for that.
 */
export const METERS_PER_DEGREE_LAT = 111_320;

export type LatLng = { lat: number; lng: number };

/** West, south, east, north as [lngMin, latMin, lngMax, latMax] — the axis order PDOK/BGT expect. */
export function bboxAround(center: LatLng, radiusM: number): [number, number, number, number] {
  const latitudeDelta = radiusM / METERS_PER_DEGREE_LAT;
  const longitudeDelta = radiusM / (METERS_PER_DEGREE_LAT * Math.cos((center.lat * Math.PI) / 180));
  return [
    center.lng - longitudeDelta,
    center.lat - latitudeDelta,
    center.lng + longitudeDelta,
    center.lat + latitudeDelta,
  ];
}

export function bboxString(center: LatLng, radiusM: number) {
  return bboxAround(center, radiusM).join(",");
}
