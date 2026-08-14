import { eq, and, desc } from "drizzle-orm";
import type { AiPropertyReport, AiReportStatus, Analysis } from "@/src/lib/types";
import { aiReports, evidence, analyses, properties } from "@/src/lib/db/schema";
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

export async function getAiReport(bagVboId: string, reportVersion: string) {
  const db = getDatabase();
  if (!db) return null;
  const [property] = await db.select({ id: properties.id }).from(properties).where(eq(properties.bagVboId, bagVboId)).limit(1);
  if (!property) return null;
  const [report] = await db.select().from(aiReports)
    .where(and(eq(aiReports.propertyId, property.id), eq(aiReports.reportVersion, reportVersion)))
    .orderBy(desc(aiReports.updatedAt)).limit(1);
  return report ?? null;
}

export async function persistAiReport(analysis: Analysis, report: AiPropertyReport, inputFingerprint: string): Promise<"database" | "cache-only"> {
  const db = getDatabase();
  if (!db) return "cache-only";
  const [property] = await db.select({ id: properties.id }).from(properties).where(eq(properties.bagVboId, analysis.property.bagVboId)).limit(1);
  if (!property) return "cache-only";
  await db.insert(aiReports).values({
    propertyId: property.id,
    reportVersion: report.reportVersion,
    promptVersion: report.promptVersion,
    inputFingerprint,
    status: "ready",
    reportJson: report,
    sourceManifestJson: report.sources,
    researchModel: report.researchModel,
    synthesisModel: report.synthesisModel,
    generatedAt: new Date(report.generatedAt),
    expiresAt: new Date(report.expiresAt),
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [aiReports.propertyId, aiReports.reportVersion],
    set: {
      promptVersion: report.promptVersion,
      inputFingerprint,
      status: "ready",
      reportJson: report,
      sourceManifestJson: report.sources,
      researchModel: report.researchModel,
      synthesisModel: report.synthesisModel,
      generatedAt: new Date(report.generatedAt),
      expiresAt: new Date(report.expiresAt),
      errorCode: null,
      updatedAt: new Date(),
    },
  });
  return "database";
}

export async function markAiReportGenerating(analysis: Analysis, reportVersion: string, promptVersion: string, inputFingerprint: string): Promise<"database" | "cache-only"> {
  const db = getDatabase();
  if (!db) return "cache-only";
  const [property] = await db.select({ id: properties.id }).from(properties).where(eq(properties.bagVboId, analysis.property.bagVboId)).limit(1);
  if (!property) return "cache-only";
  await db.insert(aiReports).values({ propertyId: property.id, reportVersion, promptVersion, inputFingerprint, status: "generating", updatedAt: new Date() }).onConflictDoUpdate({
    target: [aiReports.propertyId, aiReports.reportVersion],
    set: { status: "generating", inputFingerprint, errorCode: null, updatedAt: new Date() },
  });
  return "database";
}

export async function persistAiReportFailure(analysis: Analysis, reportVersion: string, promptVersion: string, inputFingerprint: string, errorCode: string): Promise<"database" | "cache-only"> {
  const db = getDatabase();
  if (!db) return "cache-only";
  const [property] = await db.select({ id: properties.id }).from(properties).where(eq(properties.bagVboId, analysis.property.bagVboId)).limit(1);
  if (!property) return "cache-only";
  await db.insert(aiReports).values({ propertyId: property.id, reportVersion, promptVersion, inputFingerprint, status: "failed", errorCode, updatedAt: new Date() }).onConflictDoUpdate({
    target: [aiReports.propertyId, aiReports.reportVersion],
    set: { status: "failed", inputFingerprint, errorCode, updatedAt: new Date() },
  });
  return "database";
}

export function aiReportStatus(row: typeof aiReports.$inferSelect | null): AiReportStatus {
  if (!row) return "missing";
  if (row.status === "ready" && row.expiresAt && row.expiresAt.getTime() > Date.now()) return "ready";
  if (row.status === "generating") return "generating";
  if (row.status === "failed") return "failed";
  return "stale";
}
