import type { Geometry } from "geojson";

const METERS_PER_DEGREE_LAT = 111_320;

export function circlePolygon(
  center: { lat: number; lng: number },
  radiusM: number,
  steps = 64,
): Extract<Geometry, { type: "Polygon" }> {
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((center.lat * Math.PI) / 180);
  const ring: [number, number][] = [];
  for (let index = 0; index <= steps; index += 1) {
    const angle = (index / steps) * 2 * Math.PI;
    ring.push([
      center.lng + (radiusM * Math.sin(angle)) / metersPerDegreeLng,
      center.lat + (radiusM * Math.cos(angle)) / METERS_PER_DEGREE_LAT,
    ]);
  }
  return { type: "Polygon", coordinates: [ring] };
}

export function destinationPoint(
  origin: { lat: number; lng: number },
  bearingDeg: number,
  distanceM: number,
): { lat: number; lng: number } {
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos((origin.lat * Math.PI) / 180);
  const bearing = (bearingDeg * Math.PI) / 180;
  return {
    lng: origin.lng + (distanceM * Math.sin(bearing)) / metersPerDegreeLng,
    lat: origin.lat + (distanceM * Math.cos(bearing)) / METERS_PER_DEGREE_LAT,
  };
}

export function houseNumberFromLabel(label: string) {
  return label.match(/\b(\d+[a-zA-Z]?)\b/)?.[1] ?? "";
}

const GARDEN_BEARINGS: [RegExp, number, string][] = [
  [/zuid.?oost|zuidoost|\bzo\b/i, 135, "tuin op het zuidoosten"],
  [/zuid.?west|zuidwest|\bzw\b/i, 225, "tuin op het zuidwesten"],
  [/noord.?oost|noordoost|\bno\b/i, 45, "tuin op het noordoosten"],
  [/noord.?west|noordwest|\bnw\b/i, 315, "tuin op het noordwesten"],
  [/zuid/i, 180, "tuin op het zuiden"],
  [/west/i, 270, "tuin op het westen"],
  [/oost/i, 90, "tuin op het oosten"],
  [/noord/i, 0, "tuin op het noorden"],
];

export function gardenOrientation(text: string | undefined) {
  if (!text?.trim()) return null;
  const match = GARDEN_BEARINGS.find(([pattern]) => pattern.test(text));
  if (!match) return null;
  return { bearing: match[1], label: match[2] };
}

export type OverlayId = "nearby" | "walk" | "transit" | "noise" | "no2" | "pm25" | "green" | "water" | "garden" | "roads";

export type MapOverlays = Record<OverlayId, boolean>;

export type MapSceneId = "street" | "reach" | "health" | "nature";

const ALL_OFF: MapOverlays = {
  nearby: false,
  walk: false,
  transit: false,
  noise: false,
  no2: false,
  pm25: false,
  green: false,
  water: false,
  garden: false,
  roads: false,
};

export const MAP_SCENES: { id: MapSceneId; label: string; hint: string; overlays: OverlayId[] }[] = [
  { id: "street", label: "Straat", hint: "Deze woning en buren", overlays: ["nearby", "garden"] },
  { id: "reach", label: "Bereik", hint: "Lopen en OV", overlays: ["walk", "transit", "nearby"] },
  { id: "health", label: "Lucht", hint: "Geluid en NO₂ — klik om te meten", overlays: ["noise", "no2"] },
  { id: "nature", label: "Groen", hint: "Bomen, water, tuin", overlays: ["green", "water", "garden"] },
];

export function overlaysForScene(scene: MapSceneId): MapOverlays {
  const next = { ...ALL_OFF };
  for (const id of MAP_SCENES.find((item) => item.id === scene)?.overlays ?? []) next[id] = true;
  return next;
}

export function defaultMapOverlays(signals: { key: string; severity: string }[]): MapOverlays {
  const byKey = Object.fromEntries(signals.map((signal) => [signal.key, signal.severity]));
  return {
    nearby: true,
    walk: false,
    transit: byKey.transit === "attention",
    noise: byKey.noise === "attention",
    no2: byKey.air === "attention",
    pm25: false,
    green: byKey.green === "good" || byKey.green === "attention",
    water: byKey.water === "attention",
    garden: true,
    roads: false,
  };
}
