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

export function defaultMapOverlays(signals: { key: string; severity: string }[]) {
  const byKey = Object.fromEntries(signals.map((signal) => [signal.key, signal.severity]));
  return {
    nearby: true,
    walk: true,
    transit: true,
    noise: byKey.noise === "attention",
    no2: byKey.air === "attention" || byKey.health === "attention",
    pm25: byKey.air === "attention",
    green: byKey.green === "good",
    water: byKey.water === "attention",
    garden: true,
    roads: true,
  };
}
