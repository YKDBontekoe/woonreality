import { NextResponse } from "next/server";
import { apiContext } from "@/src/lib/api/handlers";
import { logError } from "@/src/lib/logger";
import {
  generateListingInsights,
  hasListingExtractText,
  listingExtractFingerprint,
  listingExtractVersions,
} from "@/src/lib/analysis/listing-extract";
import { claimAiReportGeneration, persistAnalysis, persistAiReportFailure, persistStructuredAiReport, getAiReport, resolveReadyReport, aiReportStatus } from "@/src/lib/db/repository";
import { isSupabaseConfigured } from "@/src/lib/supabase/server";
import { allowAnonymousLlmGeneration, loadAiContext, loadListingContext } from "@/src/lib/analysis/llm-context";
import type { Analysis, ListingInsights } from "@/src/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function asInsights(value: unknown): ListingInsights | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<ListingInsights>;
  if (!record.headline || !Array.isArray(record.points)) return null;
  return record as ListingInsights;
}

export async function GET(request: Request, context: { params: Promise<{ bagId: string }> }) {
  const { t } = apiContext(request);
  if (!process.env.AI_GATEWAY_API_KEY) {
    return NextResponse.json({ status: "unavailable", message: t("errors.aiKeyRequired") }, { status: 503 });
  }
  const { bagId } = await context.params;
  try {
    const { listing, userId, property } = await loadListingContext(bagId);
    if (!listing || !hasListingExtractText(listing)) {
      return NextResponse.json({ status: "missing", reason: "no-listing-text" });
    }
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ status: "missing" });
    }
    const fingerprint = listingExtractFingerprint(listing);
    const row = await getAiReport(property.bagVboId, listingExtractVersions.report, userId);
    const resolved = resolveReadyReport(row, fingerprint);
    return NextResponse.json({
      ...resolved,
      report: asInsights(resolved.report),
    });
  } catch (error) {
    console.error("WoonReality listing insights status failed", error);
    return NextResponse.json({ status: "failed", message: t("errors.listingInsightsLoadFailed") }, { status: 502 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ bagId: string }> }) {
  const { locale, t } = apiContext(request);
  if (!process.env.AI_GATEWAY_API_KEY) {
    return NextResponse.json({ status: "unavailable", message: t("errors.aiKeyRequired") }, { status: 503 });
  }
  const { bagId } = await context.params;
  let analysis: Analysis | null = null;
  let fingerprint = "";
  let userId: string | null = null;
  try {
    const loaded = await loadAiContext(bagId);
    analysis = loaded.analysis;
    userId = loaded.userId;
    const { listing, signedIn } = loaded;
    if (!listing || !hasListingExtractText(listing)) {
      return NextResponse.json({ status: "missing", reason: "no-listing-text" });
    }
    await persistAnalysis(analysis);
    fingerprint = listingExtractFingerprint(listing);
    if (isSupabaseConfigured()) {
      const existing = await getAiReport(analysis.property.bagVboId, listingExtractVersions.report, userId);
      const resolved = resolveReadyReport(existing, fingerprint);
      const cached = asInsights(resolved.report);
      if (resolved.status === "ready" && cached) {
        return NextResponse.json({ status: "ready", report: cached });
      }
      if (existing && aiReportStatus(existing) === "generating") {
        return NextResponse.json({ status: "generating" }, { status: 202 });
      }
      // Atomic claim so two concurrent POSTs cannot both start an LLM run.
      const claim = await claimAiReportGeneration(analysis, listingExtractVersions.report, listingExtractVersions.prompt, fingerprint, userId);
      if (claim === "in-flight") {
        return NextResponse.json({ status: "generating" }, { status: 202 });
      }
    }
    if (!signedIn && !allowAnonymousLlmGeneration(request, bagId, false)) {
      return NextResponse.json({ status: "failed", message: t("errors.tooManyRequests") }, { status: 429 });
    }
    const report = await generateListingInsights(listing, locale);
    if (!report) {
      await persistAiReportFailure(analysis, listingExtractVersions.report, listingExtractVersions.prompt, fingerprint, "empty_report", userId);
      return NextResponse.json({ status: "failed", message: t("errors.listingExtractFailed") }, { status: 502 });
    }
    await persistStructuredAiReport(analysis, {
      reportVersion: listingExtractVersions.report,
      promptVersion: listingExtractVersions.prompt,
      generatedAt: report.generatedAt,
      expiresAt: report.expiresAt,
      researchModel: report.model,
      synthesisModel: report.model,
      reportJson: report,
      usage: report.usage,
    }, fingerprint, userId);
    return NextResponse.json({ status: "ready", report });
  } catch (error) {
    logError("WoonReality listing insights failed", error);
    if (analysis && fingerprint) {
      await persistAiReportFailure(analysis, listingExtractVersions.report, listingExtractVersions.prompt, fingerprint, "generate_failed", userId);
    }
    return NextResponse.json({ status: "failed", message: t("errors.listingInsightsFailed") }, { status: 502 });
  }
}
