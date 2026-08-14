import type { GeoJsonFeature } from "@/src/lib/types";
import { getBgtFeatures, getFeatureId, pdokUrls } from "@/src/lib/sources/pdok/client";

export type BgtContext = {
  roads: GeoJsonFeature[];
  greenAreas: GeoJsonFeature[];
  water: GeoJsonFeature[];
  fetchedAt: string;
};

export async function getBgtContext(coordinates: { lat: number; lng: number }): Promise<BgtContext> {
  const [roads, greenAreas, water] = await Promise.all([
    getBgtFeatures("wegdeel", coordinates),
    getBgtFeatures("begroeidterreindeel", coordinates),
    getBgtFeatures("waterdeel", coordinates),
  ]);

  return { roads, greenAreas, water, fetchedAt: new Date().toISOString() };
}

export function bgtEvidenceId(collection: string, feature: GeoJsonFeature, index: number) {
  return `bgt-${collection}-${getFeatureId(feature) ?? index}`;
}

export { pdokUrls };
