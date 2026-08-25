import type { AiPropertyReport, AiReportStatus, Analysis } from "@/src/lib/types";
import type { AiReportRow } from "@/src/lib/supabase/database.types";
import { createSupabaseAdminClient } from "@/src/lib/supabase/server";
import { logWarn } from "@/src/lib/logger";

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
    logWarn("Supabase persistence unavailable; serving cache-only analysis", error);
    return "cache-only";
  }
}

export async function getLatestPersistedAnalysis(bagVboId: string) {
  const db = createSupabaseAdminClient();
  if (!db) return null;
  const { data } = await db.from("properties").select("id").eq("bag_vbo_id", bagVboId).maybeSingle();
  return data;
}

/**
 * Shared cache for expensive multi-source computations (full property
 * analyses, place analyses) so every consumer — API routes, server-rendered
 * pages, AI pipelines — reuses one computation instead of refetching all
 * upstream sources. Backed by the dormant `source_cache` table.
 */
export async function getSourceCache<T>(source: string, cacheKey: string, schemaVersion: string): Promise<T | null> {
  const db = createSupabaseAdminClient();
  if (!db) return null;
  try {
    const { data } = await db.from("source_cache")
      .select("payload_json, expires_at")
      .eq("source", source)
      .eq("cache_key", cacheKey)
      .eq("schema_version", schemaVersion)
      .maybeSingle();
    if (!data) return null;
    if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return null;
    return data.payload_json as T;
  } catch (error) {
    logWarn("source_cache read failed", error);
    return null;
  }
}

export async function putSourceCache(source: string, cacheKey: string, payload: unknown, schemaVersion: string, ttlSeconds: number): Promise<void> {
  const db = createSupabaseAdminClient();
  if (!db) return;
  try {
    const now = new Date();
    const row = {
      source,
      cache_key: cacheKey,
      payload_json: asJson(payload),
      schema_version: schemaVersion,
      fetched_at: now.toISOString(),
      expires_at: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
    };
    const { error } = await db.from("source_cache").upsert(row, { onConflict: "source,cache_key" });
    if (error) throw error;
  } catch (error) {
    logWarn("source_cache write failed", error);
  }
}

async function propertyId(db: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, bagVboId: string) {
  const { data } = await db.from("properties").select("id").eq("bag_vbo_id", bagVboId).maybeSingle();
  return data?.id ?? null;
}

export async function getAiReport(bagVboId: string, reportVersion: string, userId: string | null = null) {
  const db = createSupabaseAdminClient();
  if (!db) return null;
  const id = await propertyId(db, bagVboId);
  if (!id) return null;
  let query = db.from("ai_reports").select("*").eq("property_id", id).eq("report_version", reportVersion);
  query = userId ? query.eq("user_id", userId) : query.is("user_id", null);
  const { data } = await query.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return data;
}

export function resolveReadyReport(row: AiReportRow | null, fingerprint: string) {
  const status = aiReportStatus(row);
  if (status === "ready" && row && row.input_fingerprint === fingerprint) {
    return {
      status: "ready" as const,
      report: row.report_json,
      generatedAt: row.generated_at,
      expiresAt: row.expires_at,
    };
  }
  if (status === "ready") {
    return {
      status: "stale" as const,
      report: null,
      generatedAt: row?.generated_at ?? null,
      expiresAt: row?.expires_at ?? null,
    };
  }
  return {
    status,
    report: null,
    generatedAt: row?.generated_at ?? null,
    expiresAt: row?.expires_at ?? null,
  };
}

export async function persistStructuredAiReport(
  analysis: Analysis,
  input: {
    reportVersion: string;
    promptVersion: string;
    generatedAt: string;
    expiresAt: string;
    researchModel: string;
    synthesisModel: string;
    reportJson: unknown;
    usage?: AiPropertyReport["usage"];
  },
  inputFingerprint: string,
  userId: string | null = null,
): Promise<"database" | "cache-only"> {
  return persistReadyReport(analysis, {
    ...input,
    sourceManifest: [],
  }, inputFingerprint, userId);
}

export async function persistAiReport(analysis: Analysis, report: AiPropertyReport, inputFingerprint: string, userId: string | null = null): Promise<"database" | "cache-only"> {
  return persistReadyReport(analysis, {
    reportVersion: report.reportVersion,
    promptVersion: report.promptVersion,
    generatedAt: report.generatedAt,
    expiresAt: report.expiresAt,
    researchModel: report.researchModel,
    synthesisModel: report.synthesisModel,
    reportJson: report,
    sourceManifest: report.sources,
    usage: report.usage,
  }, inputFingerprint, userId);
}

type ReportPersistInput = {
  reportVersion: string;
  promptVersion: string;
  generatedAt: string;
  expiresAt: string;
  researchModel: string;
  synthesisModel: string;
  reportJson: unknown;
  sourceManifest: unknown;
  usage?: AiPropertyReport["usage"];
};

type AiReportUpsertInput = {
  bagVboId: string;
  userId: string | null;
  reportVersion: string;
  promptVersion?: string;
  inputFingerprint?: string;
  values: Record<string, unknown>;
};

/**
 * Shared "existing row → update, otherwise insert" writer for ai_reports so
 * every status transition (ready/generating/failed) follows one code path.
 */
async function upsertAiReport(input: AiReportUpsertInput, warnLabel: string): Promise<"database" | "cache-only"> {
  const db = createSupabaseAdminClient();
  if (!db) return "cache-only";
  try {
    const id = await propertyId(db, input.bagVboId);
    if (!id) return "cache-only";
    const payload = {
      property_id: id,
      user_id: input.userId,
      report_version: input.reportVersion,
      ...(input.promptVersion !== undefined ? { prompt_version: input.promptVersion } : {}),
      ...(input.inputFingerprint !== undefined ? { input_fingerprint: input.inputFingerprint } : {}),
      ...input.values,
      updated_at: new Date().toISOString(),
    };
    const existing = await getAiReport(input.bagVboId, input.reportVersion, input.userId);
    const { error } = existing?.id
      ? await db.from("ai_reports").update(payload).eq("id", existing.id)
      : await db.from("ai_reports").insert(payload);
    if (error) throw error;
    return "database";
  } catch (error) {
    logWarn(warnLabel, error);
    return "cache-only";
  }
}

async function persistReadyReport(
  analysis: Analysis,
  input: ReportPersistInput,
  inputFingerprint: string,
  userId: string | null,
): Promise<"database" | "cache-only"> {
  return upsertAiReport({
    bagVboId: analysis.property.bagVboId,
    userId,
    reportVersion: input.reportVersion,
    promptVersion: input.promptVersion,
    inputFingerprint,
    values: {
      status: "ready",
      report_json: asJson(input.reportJson),
      source_manifest_json: asJson(input.sourceManifest),
      research_model: input.researchModel,
      synthesis_model: input.synthesisModel,
      generated_at: input.generatedAt,
      expires_at: input.expiresAt,
      usage_json: input.usage ? asJson(input.usage) : null,
      error_code: null,
    },
  }, "Supabase AI report persistence unavailable");
}

function updateAiReport(analysis: Analysis, values: Record<string, unknown>, reportVersion: string, promptVersion: string, inputFingerprint: string, userId: string | null = null) {
  return upsertAiReport({
    bagVboId: analysis.property.bagVboId,
    userId,
    reportVersion,
    promptVersion,
    inputFingerprint,
    values,
  }, "Supabase AI report status persistence unavailable");
}

export type GenerationClaim = "claimed" | "in-flight" | "cache-only";

/**
 * Atomically transition this report row into "generating" so two concurrent
 * POSTs never both pay for a full LLM run. Uses a conditional UPDATE
 * (status must not already be "generating") and checks how many rows changed:
 * zero means another request holds the claim. For a first-time row the unique
 * index on (property_id, report_version[, user_id]) makes a duplicate insert
 * fail, which is treated as "someone else just claimed it".
 */
export async function claimAiReportGeneration(analysis: Analysis, reportVersion: string, promptVersion: string, inputFingerprint: string, userId: string | null = null): Promise<GenerationClaim> {
  const db = createSupabaseAdminClient();
  if (!db) return "cache-only";
  try {
    const id = await propertyId(db, analysis.property.bagVboId);
    if (!id) return "cache-only";
    const payload = {
      property_id: id,
      user_id: userId,
      report_version: reportVersion,
      prompt_version: promptVersion,
      input_fingerprint: inputFingerprint,
      status: "generating",
      error_code: null,
      updated_at: new Date().toISOString(),
    };
    const existing = await getAiReport(analysis.property.bagVboId, reportVersion, userId);
    if (existing?.id) {
      const { data, error } = await db.from("ai_reports")
        .update(payload)
        .eq("id", existing.id)
        .neq("status", "generating")
        .select("id");
      if (error) throw error;
      return data && data.length > 0 ? "claimed" : "in-flight";
    }
    const { error } = await db.from("ai_reports").insert(payload);
    if (error) {
      // Unique-index violation: a concurrent request inserted first.
      logWarn("AI report claim insert conflicted; treating as in-flight", error);
      return "in-flight";
    }
    return "claimed";
  } catch (error) {
    logWarn("Supabase AI report claim unavailable; proceeding without lock", error);
    return "cache-only";
  }
}

/** Releases a stale "generating" flag after a crash between claim and persist. */
export async function releaseAiReportClaim(bagVboId: string, reportVersion: string, userId: string | null = null) {
  const db = createSupabaseAdminClient();
  if (!db) return;
  try {
    const id = await propertyId(db, bagVboId);
    if (!id) return;
    const existing = await getAiReport(bagVboId, reportVersion, userId);
    if (!existing?.id || existing.status !== "generating") return;
    await db.from("ai_reports")
      .update({ status: "failed", error_code: "claim_released", updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .eq("status", "generating");
  } catch (error) {
    logWarn("AI report claim release failed", error);
  }
}

export function markAiReportGenerating(analysis: Analysis, reportVersion: string, promptVersion: string, inputFingerprint: string, userId: string | null = null) {
  return updateAiReport(analysis, { status: "generating", error_code: null }, reportVersion, promptVersion, inputFingerprint, userId);
}

export function persistAiReportFailure(analysis: Analysis, reportVersion: string, promptVersion: string, inputFingerprint: string, errorCode: string, userId: string | null = null) {
  return updateAiReport(analysis, { status: "failed", error_code: errorCode }, reportVersion, promptVersion, inputFingerprint, userId);
}

export function aiReportStatus(row: AiReportRow | null): AiReportStatus {
  if (!row) return "missing";
  if (row.status === "ready" && row.expires_at && new Date(row.expires_at).getTime() > Date.now()) return "ready";
  if (row.status === "generating") return "generating";
  if (row.status === "failed") return "failed";
  return "stale";
}
