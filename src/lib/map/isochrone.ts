import type { GeoJsonFeatureCollection } from "@/src/lib/types";
import type { Geometry } from "geojson";

export const ISOCHRONE_PROFILES = ["walking", "driving"] as const;
export type IsochroneProfile = (typeof ISOCHRONE_PROFILES)[number];

export const ISOCHRONE_MINUTES_MIN = 5;
export const ISOCHRONE_MINUTES_MAX = 30;
export const ISOCHRONE_MINUTES_STEP = 5;
export const ISOCHRONE_MINUTES_DEFAULT = 10;

/** Keep street-network jogs instead of smoothing the contour into a circle. */
export const ISOCHRONE_DENOISE = "0.4";
export const ISOCHRONE_GENERALIZE_M = "25";

export function parseIsochroneProfile(raw: string | null): IsochroneProfile | null {
  const value = raw?.trim() || "walking";
  return value === "walking" || value === "driving" ? value : null;
}

export function parseIsochroneMinutes(raw: string | null): number | null {
  if (raw == null || raw === "") return ISOCHRONE_MINUTES_DEFAULT;
  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes < ISOCHRONE_MINUTES_MIN || minutes > ISOCHRONE_MINUTES_MAX) {
    return null;
  }
  if (minutes % ISOCHRONE_MINUTES_STEP !== 0) return null;
  return minutes;
}

/** Nested time rings for a “spread web”. Mapbox allows at most four contours. */
export function contourMinutes(maxMinutes: number): number[] {
  const rings: number[] = [];
  for (let minutes = ISOCHRONE_MINUTES_STEP; minutes <= maxMinutes; minutes += ISOCHRONE_MINUTES_STEP) {
    rings.push(minutes);
  }
  return rings.slice(-4);
}

export function mapboxIsochroneUrl(options: {
  token: string;
  lng: number;
  lat: number;
  profile: IsochroneProfile;
  minutes: number;
}): URL {
  const endpoint = new URL(
    `https://api.mapbox.com/isochrone/v1/mapbox/${options.profile}/${options.lng},${options.lat}`,
  );
  endpoint.searchParams.set("contours_minutes", contourMinutes(options.minutes).join(","));
  endpoint.searchParams.set("polygons", "true");
  endpoint.searchParams.set("denoise", ISOCHRONE_DENOISE);
  endpoint.searchParams.set("generalize", ISOCHRONE_GENERALIZE_M);
  endpoint.searchParams.set("access_token", options.token);
  return endpoint;
}

export function isochroneCacheKey(profile: IsochroneProfile, minutes: number) {
  return `${profile}:${minutes}`;
}

function visitPosition(position: unknown, visit: (lng: number, lat: number) => void) {
  if (!Array.isArray(position) || position.length === 0) return;
  if (typeof position[0] === "number" && typeof position[1] === "number") {
    visit(position[0], position[1]);
    return;
  }
  for (const child of position) visitPosition(child, visit);
}

function visitGeometry(geometry: Geometry, visit: (lng: number, lat: number) => void) {
  if (geometry.type === "GeometryCollection") {
    for (const child of geometry.geometries) visitGeometry(child, visit);
    return;
  }
  visitPosition(geometry.coordinates, visit);
}

export function isochroneLngLatBounds(
  collection: GeoJsonFeatureCollection,
): [number, number, number, number] | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  const visit = (lng: number, lat: number) => {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  };
  for (const feature of collection.features) {
    if (!feature.geometry) continue;
    visitGeometry(feature.geometry, visit);
  }
  if (!Number.isFinite(minLng) || minLng === Infinity) return null;
  return [minLng, minLat, maxLng, maxLat];
}

export function mergeLngLatBounds(
  current: [number, number, number, number] | null,
  next: [number, number, number, number] | null,
): [number, number, number, number] | null {
  if (!current) return next;
  if (!next) return current;
  return [
    Math.min(current[0], next[0]),
    Math.min(current[1], next[1]),
    Math.max(current[2], next[2]),
    Math.max(current[3], next[3]),
  ];
}
