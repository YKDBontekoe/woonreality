import type { Geometry } from "geojson";

const METERS_PER_DEGREE_LAT = 111_320;

function project([lng, lat]: [number, number], origin: { lat: number; lng: number }) {
  return [
    (lng - origin.lng) * METERS_PER_DEGREE_LAT * Math.cos((origin.lat * Math.PI) / 180),
    (lat - origin.lat) * METERS_PER_DEGREE_LAT,
  ] as [number, number];
}

function coordinatesOf(geometry: Geometry): [number, number][] {
  if (geometry.type === "Point") return [geometry.coordinates as [number, number]];
  if (geometry.type === "LineString" || geometry.type === "MultiPoint") return geometry.coordinates as [number, number][];
  if (geometry.type === "Polygon" || geometry.type === "MultiLineString") return (geometry.coordinates[0] ?? []) as [number, number][];
  if (geometry.type === "MultiPolygon") return ((geometry.coordinates[0]?.[0] ?? []) as [number, number][]);
  return [];
}

export function geometryAreaM2(geometry: Geometry, origin: { lat: number; lng: number }) {
  const points = coordinatesOf(geometry).map((point) => project(point, origin));
  if (points.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(area) / 2;
}

export function distanceToGeometryM(coordinates: { lat: number; lng: number }, geometry: Geometry) {
  const points = coordinatesOf(geometry);
  if (points.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...points.map(([lng, lat]) => haversineM(coordinates, { lat, lng })));
}

export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const earthRadius = 6_371_000;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}
