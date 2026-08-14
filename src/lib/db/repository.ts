import { eq } from "drizzle-orm";
import type { Analysis } from "@/src/lib/types";
import { evidence, analyses, properties } from "@/src/lib/db/schema";
import { getDatabase } from "@/src/lib/db/client";

export async function persistAnalysis(analysis: Analysis): Promise<"database" | "cache-only"> {
  const db = getDatabase();
  if (!db) return "cache-only";

  const { property } = analysis;
  const [propertyRow] = await db.insert(properties).values({
    bagVboId: property.bagVboId,
    addressLabel: property.addressLabel,
    postcode: property.postcode,
    houseNumber: String(property.houseNumber),
    houseNumberAddition: [property.houseLetter, property.addition].filter(Boolean).join(" ") || null,
    city: property.city,
    lat: property.coordinates.lat,
    lng: property.coordinates.lng,
    areaM2: property.areaM2,
    buildYear: property.buildingYear,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: properties.bagVboId,
    set: {
      addressLabel: property.addressLabel,
      postcode: property.postcode,
      city: property.city,
      lat: property.coordinates.lat,
      lng: property.coordinates.lng,
      areaM2: property.areaM2,
      buildYear: property.buildingYear,
      updatedAt: new Date(),
    },
  }).returning({ id: properties.id });

  if (!propertyRow) return "cache-only";

  await db.insert(evidence).values(analysis.evidence.map((item) => ({
    propertyId: propertyRow.id,
    source: item.source,
    sourceRecordId: item.sourceRecordId,
    sourceUrl: item.sourceUrl,
    sourceUpdatedAt: item.sourceUpdatedAt ? new Date(item.sourceUpdatedAt) : null,
    spatialResolution: item.spatialResolution,
    confidence: item.confidence,
    caveat: item.caveat,
  })));

  await db.insert(analyses).values({
    propertyId: propertyRow.id,
    analysisVersion: analysis.analysisVersion,
    scoringVersion: analysis.scoringVersion,
    overallScore: analysis.overallScore,
    componentsJson: analysis.components,
  });

  return "database";
}

export async function getLatestPersistedAnalysis(bagVboId: string) {
  const db = getDatabase();
  if (!db) return null;
  const [property] = await db.select({ id: properties.id }).from(properties).where(eq(properties.bagVboId, bagVboId)).limit(1);
  return property ?? null;
}
