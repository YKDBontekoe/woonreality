import type { Evidence, Signal } from "@/src/lib/types";
import { createEvidence } from "@/src/lib/analysis/evidence";
import { clamp, round1 } from "@/src/lib/math";
import { geometryAreaM2 } from "@/src/lib/geo/measure";
import { scoreSeverity } from "@/src/lib/scoring/score";
import { pdokUrls, type BgtContext } from "@/src/lib/sources/pdok/bgt";
import type { Coordinates, GeoJsonFeature } from "@/src/lib/types";
import {
  bearingDeg,
  distanceM,
  orientationLabel,
  polygonCentroid,
  polygonLongestEdgeBearing,
} from "@/src/lib/solar";

export function sunEvidence(fetchedAt?: string): Evidence {
  return createEvidence({
    id: "bgt-sun",
    source: "PDOK / BGT",
    sourceUrl: `${pdokUrls.bgt}collections/pand/items`,
    confidence: "low",
    fetchedAt,
    spatialResolution: "BGT-pandvlakken rond dit adres",
    caveat: "Geometrische indicatie uit BGT-vlakken en zonnestand-berekening. Geen AHN-3D schaduwmodel; bomen, hoogteverschil en dakkapellen zijn niet meegenomen.",
  });
}

/** Facade-orientation proxy: BGT gives footprints, so the longest edge is the building axis and facades sit perpendicular to it. */
const ORIENTATION_SCORES: Record<string, number> = {
  zuid: 10,
  zuidoost: 8.5,
  zuidwest: 8.5,
  oost: 6.5,
  west: 6.5,
  noordoost: 5,
  noordwest: 5,
  noord: 3.5,
};

export type SunMetrics = {
  orientationBearing: number | null;
  blockingSouthCount: number;
  nearestBlockingM: number | null;
};

function currentBuildings(bgt: BgtContext): GeoJsonFeature[] {
  // The BGT pand collection also returns historical features; only the ones
  // without an end-of-life timestamp describe today's buildings.
  return bgt.buildings.filter((feature) => feature.properties?.eind_registratie == null);
}

function pointInPolygon(point: Coordinates, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > point.lat !== yj > point.lat && point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function ownBuildingFootprint(buildings: GeoJsonFeature[], coordinates: Coordinates): GeoJsonFeature | null {
  for (const feature of buildings) {
    const geometry = feature.geometry;
    if (geometry?.type === "Polygon") {
      if (pointInPolygon(coordinates, geometry.coordinates[0] as [number, number][])) return feature;
    }
  }
  let nearest: GeoJsonFeature | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const feature of buildings) {
    const centroid = polygonCentroid(feature.geometry);
    if (!centroid) continue;
    const distance = distanceM(coordinates, centroid);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = feature;
    }
  }
  // A detached neighbour is not this house; only accept a very close fallback.
  return nearestDistance <= 30 ? nearest : null;
}

/** Sheds and garden houses (BGT registers them as pand too) rarely shade living spaces; only substantial footprints count. */
const BLOCKER_MIN_AREA_M2 = 40;

/**
 * Buildings roughly due south of the subject block low winter sun (elevation
 * ~15–25° around noon in December), which matters far more than summer shade.
 */
export function southBlockingBuildings(buildings: GeoJsonFeature[], origin: Coordinates): { count: number; nearestM: number | null } {
  let count = 0;
  let nearestM: number | null = null;
  for (const feature of buildings) {
    const centroid = polygonCentroid(feature.geometry);
    if (!centroid) continue;
    const distance = distanceM(origin, centroid);
    if (distance > 60 || distance < 3) continue;
    const bearing = bearingDeg(origin, centroid);
    const inSouthernSector = bearing >= 135 && bearing <= 225;
    if (!inSouthernSector) continue;
    if (geometryAreaM2(feature.geometry, origin) < BLOCKER_MIN_AREA_M2) continue;
    count += 1;
    if (nearestM == null || distance < nearestM) nearestM = Math.round(distance);
  }
  return { count, nearestM };
}

/** Each close southern neighbour costs light; farther ones only a little, capped so a dense street does not zero the score. */
export function blockingPenalty(count: number, nearestM: number | null) {
  if (count <= 0) return 0;
  const perBuilding = nearestM != null && nearestM <= 35 ? 1.5 : 0.75;
  return Math.min(4, count * perBuilding);
}

export function sunScoreFromMetrics(metrics: SunMetrics): number | null {
  if (metrics.orientationBearing == null) return null;
  const normalized = ((metrics.orientationBearing % 360) + 360) % 360;
  // Longest-edge bearing runs along the facade line; facades face ±90° of it.
  // Pick whichever perpendicular direction scores higher (garden vs street side).
  const left = ORIENTATION_SCORES[orientationLabel(normalized + 90)];
  const right = ORIENTATION_SCORES[orientationLabel(normalized - 90)];
  const base = Math.max(left ?? 5, right ?? 5);
  return clamp(round1(base - blockingPenalty(metrics.blockingSouthCount, metrics.nearestBlockingM)));
}

export function sunSignal(input: { bgt: BgtContext | null; property: { coordinates: Coordinates }; evidence: Evidence; bgtAvailable: boolean }): Signal {
  const { bgt, property, evidence, bgtAvailable } = input;
  const buildings = bgt ? currentBuildings(bgt) : [];
  const own = ownBuildingFootprint(buildings, property.coordinates);
  const others = own ? buildings.filter((feature) => feature !== own) : buildings;
  const orientationBearing = own ? polygonLongestEdgeBearing(own.geometry) : null;
  const blocking = southBlockingBuildings(others, property.coordinates);
  const metrics: SunMetrics = { orientationBearing, blockingSouthCount: blocking.count, nearestBlockingM: blocking.nearestM };
  const score = sunScoreFromMetrics(metrics);

  if (orientationBearing == null) {
    return {
      key: "sun",
      label: "Zon & licht",
      category: "woning",
      value: "Geen data",
      severity: "neutral",
      summary: "Er is geen BGT-pandvlak gevonden voor dit adres, dus de geveloriëntatie kan niet worden afgeleid.",
      action: "Check bij de bezichtiging waar de tuin/balkon op ligt en wanneer de zon in de woonkamer staat.",
      confidence: "low",
      spatialScale: "BGT-pandvlakken rond dit adres",
      evidence: [evidence],
      availability: "unavailable",
    };
  }

  const facadeBearing = ((orientationBearing + 90) % 360 + 360) % 360;
  const label = orientationLabel(facadeBearing);
  const axisLabel = orientationLabel(orientationBearing);
  const blockingText = blocking.count > 0
    ? `${blocking.count} pand${blocking.count === 1 ? "" : "en"} op het zuiden binnen circa ${blocking.nearestM ?? 60} m kunnen lage (winter)zon wegnemen`
    : "geen panden direct op het zuiden die laag zonlicht blokkeren";

  return {
    key: "sun",
    label: "Zon & licht",
    category: "woning",
    value: round1(score!),
    unit: "/ 10",
    score: score ?? undefined,
    severity: scoreSeverity(score!),
    summary: `Het BGT-pandvlak heeft een lange zijde richting ${axisLabel}; de gunstigste gevelrichting komt daarmee uit op ${label}. Verder: ${blockingText}.`,
    action: "Sta bij de bezichtiging minimaal één keer in de tuin/woonkamer vóór 12u én na 17u; schaduw van bomen en aanbouwen zit niet in deze indicatie.",
    raw: {
      value: Math.round(orientationBearing),
      unit: "°",
      metric: "langste zijde BGT-pandvlak (gevel-as)",
    },
    confidence: "low",
    spatialScale: "BGT-pandvlakken rond dit adres",
    evidence: [evidence],
    availability: bgtAvailable ? "available" : "unavailable",
  };
}
