import type { GeoJsonFeature } from "@/src/lib/types";
import { getBgtFeatures, getFeatureId, pdokUrls } from "@/src/lib/sources/pdok/client";

export type BgtContext = {
  roads: GeoJsonFeature[];
  greenAreas: GeoJsonFeature[];
  water: GeoJsonFeature[];
  /** Building footprints (BGT pand), including historical records; consumers filter on eind_registratie. */
  buildings: GeoJsonFeature[];
  fetchedAt: string;
};

export async function getBgtContext(coordinates: { lat: number; lng: number }): Promise<BgtContext> {
  // Building footprints feed the sun/light signal, which only looks ~60 m
  // around the house. The pand collection also contains historical records,
  // so a generous page limit keeps the subject's own building from being
  // pushed off a truncated result page.
  const [roads, greenAreas, water, buildings] = await Promise.all([
    getBgtFeatures("wegdeel", coordinates),
    getBgtFeatures("begroeidterreindeel", coordinates),
    getBgtFeatures("waterdeel", coordinates),
    // Sun signal degrades gracefully without footprints.
    getBgtFeatures("pand", coordinates, 120, 1000).catch(() => []),
  ]);

  return { roads, greenAreas, water, buildings, fetchedAt: new Date().toISOString() };
}

export function bgtEvidenceId(collection: string, feature: GeoJsonFeature, index: number) {
  return `bgt-${collection}-${getFeatureId(feature) ?? index}`;
}

export { pdokUrls };
