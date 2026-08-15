import type { AiPropertyReport, AiReportStatus, Analysis } from "@/src/lib/types";
import type { AiReportRow } from "@/src/lib/supabase/database.types";
import { createSupabaseAdminClient } from "@/src/lib/supabase/server";

function asJson(value: unknown) {
  return value as never;
}

export async function persistAnalysis(analysis: Analysis): Promise<"database" | "cache-only"> {
  const db = createSupabaseAdminClient();
  if (!db) return "cache-only";
  try {
    const { property } = analysis;
    const { data: propertyRow, error: propertyError } = await db.from("properties").upsert({
      bag_vbo_id: property.bagVboId,
      address_label: property.addressLabel,
      postcode: property.postcode,
      house_number: String(property.houseNumber),
      house_number_addition: [property.houseLetter, property.addition].filter(Boolean).join(" ") || null,
      city: property.city,
      lat: property.coordinates.lat,
      lng: property.coordinates.lng,
      area_m2: property.areaM2 ?? null,
      build_year: property.buildingYear ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "bag_vbo_id" }).select("id").single();
    if (propertyError || !propertyRow) throw propertyError ?? new Error("Supabase kon de woning niet opslaan");

    const { error: evidenceError } = await db.from("evidence").insert(analysis.evidence.map((item) => ({
      property_id: propertyRow.id,
      source: item.source,
      source_record_id: item.sourceRecordId ?? null,
      source_url: item.sourceUrl,
      source_updated_at: item.sourceUpdatedAt ?? null,
      spatial_resolution: item.spatialResolution ?? null,
      confidence: item.confidence,
      caveat: item.caveat ?? null,
    })));
    if (evidenceError) throw evidenceError;

    const { error: analysisError } = await db.from("analyses").insert({
      property_id: propertyRow.id,
      analysis_version: analysis.analysisVersion,
      scoring_version: analysis.scoringVersion,
      overall_score: analysis.overallScore,
      components_json: asJson(analysis.components),
    });
    if (analysisError) throw analysisError;
    return "database";
  } catch (error) {
    console.warn("Supabase persistence unavailable; serving cache-only analysis", error);
    return "cache-only";
  }
}

export async function getLatestPersistedAnalysis(bagVboId: string) {
  const db = createSupabaseAdminClient();
  if (!db) return null;
  const { data } = await db.from("properties").select("id").eq("bag_vbo_id", bagVboId).maybeSingle();
  return data;
}

async function propertyId(db: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, bagVboId: string) {
  const { data } = await db.from("properties").select("id").eq("bag_vbo_id", bagVboId).maybeSingle();
  return data?.id ?? null;
}

export async function getAiReport(bagVboId: string, reportVersion: string) {
  const db = createSupabaseAdminClient();
  if (!db) return null;
  const id = await propertyId(db, bagVboId);
  if (!id) return null;
  const { data } = await db.from("ai_reports").select("*").eq("property_id", id).eq("report_version", reportVersion).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return data;
}

export async function persistAiReport(analysis: Analysis, report: AiPropertyReport, inputFingerprint: string): Promise<"database" | "cache-only"> {
  const db = createSupabaseAdminClient();
  if (!db) return "cache-only";
  try {
    const id = await propertyId(db, analysis.property.bagVboId);
    if (!id) return "cache-only";
    const { error } = await db.from("ai_reports").upsert({
      property_id: id,
      report_version: report.reportVersion,
      prompt_version: report.promptVersion,
      input_fingerprint: inputFingerprint,
      status: "ready",
      report_json: asJson(report),
      source_manifest_json: asJson(report.sources),
      research_model: report.researchModel,
      synthesis_model: report.synthesisModel,
      generated_at: report.generatedAt,
      expires_at: report.expiresAt,
      updated_at: new Date().toISOString(),
      error_code: null,
    }, { onConflict: "property_id,report_version" });
    if (error) throw error;
    return "database";
  } catch (error) {
    console.warn("Supabase AI report persistence unavailable", error);
    return "cache-only";
  }
}

async function updateAiReport(analysis: Analysis, values: Record<string, unknown>, reportVersion: string, promptVersion: string, inputFingerprint: string) {
  const db = createSupabaseAdminClient();
  if (!db) return "cache-only" as const;
  try {
    const id = await propertyId(db, analysis.property.bagVboId);
    if (!id) return "cache-only" as const;
    const { error } = await db.from("ai_reports").upsert({
      property_id: id,
      report_version: reportVersion,
      prompt_version: promptVersion,
      input_fingerprint: inputFingerprint,
      status: values.status as string,
      ...values,
      updated_at: new Date().toISOString(),
    }, { onConflict: "property_id,report_version" });
    if (error) throw error;
    return "database" as const;
  } catch (error) {
    console.warn("Supabase AI report status persistence unavailable", error);
    return "cache-only" as const;
  }
}

export function markAiReportGenerating(analysis: Analysis, reportVersion: string, promptVersion: string, inputFingerprint: string) {
  return updateAiReport(analysis, { status: "generating", error_code: null }, reportVersion, promptVersion, inputFingerprint);
}

export function persistAiReportFailure(analysis: Analysis, reportVersion: string, promptVersion: string, inputFingerprint: string, errorCode: string) {
  return updateAiReport(analysis, { status: "failed", error_code: errorCode }, reportVersion, promptVersion, inputFingerprint);
}

export function aiReportStatus(row: AiReportRow | null): AiReportStatus {
  if (!row) return "missing";
  if (row.status === "ready" && row.expires_at && new Date(row.expires_at).getTime() > Date.now()) return "ready";
  if (row.status === "generating") return "generating";
  if (row.status === "failed") return "failed";
  return "stale";
}
