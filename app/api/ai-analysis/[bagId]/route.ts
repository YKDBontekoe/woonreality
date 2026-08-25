import { NextResponse } from "next/server";
import { apiContext } from "@/src/lib/api/handlers";
import { logError, logWarn } from "@/src/lib/logger";
import { toUserMessage } from "@/src/lib/errors";
import { aiInputFingerprint, aiReportVersions, generateAiPropertyReport } from "@/src/lib/analysis/research";
import { isSupabaseConfigured } from "@/src/lib/supabase/server";
import { allowAnonymousLlmGeneration, loadAiContext } from "@/src/lib/analysis/llm-context";
import { claimAiReportGeneration, getAiReport, persistAiReport, persistAiReportFailure, releaseAiReportClaim, resolveReadyReport } from "@/src/lib/db/repository";
import type { Analysis } from "@/src/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The Funda browser extension and paste-import both write to `user_listings`.
 * That is the richest, freshest listing data we have for this address, so it
 * takes priority over a licensed feed for AI research. Fields the user's
 * listing doesn't have fall back to the licensed feed, if one is configured.
 */
export async function GET(request: Request, context: { params: Promise<{ bagId: string }> }) {
  const { locale, t } = apiContext(request);
  if (!process.env.AI_GATEWAY_API_KEY || !isSupabaseConfigured()) return NextResponse.json({ status: "unavailable", message: t("errors.aiNotConfigured") }, { status: 503 });
  const { bagId } = await context.params;
  try {
    const { analysis, listing, userId } = await loadAiContext(bagId, locale);
    const fingerprint = aiInputFingerprint(analysis, listing);
    const row = await getAiReport(analysis.property.bagVboId, aiReportVersions.report, userId);
    const resolved = resolveReadyReport(row, fingerprint);
    return NextResponse.json(resolved);
  } catch (error) {
    logError("WoonReality AI report status failed", error);
    return NextResponse.json({ status: "failed", message: toUserMessage(error, t("errors.aiStatusLoad")) }, { status: 502 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ bagId: string }> }) {
  const { locale, t } = apiContext(request);
  if (!process.env.AI_GATEWAY_API_KEY || !isSupabaseConfigured()) return NextResponse.json({ status: "unavailable", message: t("errors.aiNotConfigured") }, { status: 503 });
  const { bagId } = await context.params;
  let claimedBagVboId: string | null = null;
  let claimUserId: string | null = null;
  try {
    const { analysis, listing, userId } = await loadAiContext(bagId, locale);
    if (!userId && !allowAnonymousLlmGeneration(request, `report:${bagId}`, false)) {
      return NextResponse.json({ status: "failed", message: t("errors.tooManyRequests") }, { status: 429 });
    }
    const inputFingerprint = aiInputFingerprint(analysis, listing);
    const existing = await getAiReport(analysis.property.bagVboId, aiReportVersions.report, userId);
    const resolved = resolveReadyReport(existing, inputFingerprint);
    if (resolved.status === "ready" && resolved.report) {
      return NextResponse.json({ status: "ready", report: resolved.report });
    }
    if (existing && existing.status === "generating") return NextResponse.json({ status: "generating" }, { status: 202 });

    // Atomic claim: exactly one concurrent request may start an LLM run.
    // "cache-only" means no Supabase lock exists; proceed unlocked rather
    // than refusing generation.
    const claim = await claimAiReportGeneration(
      analysis,
      aiReportVersions.report,
      aiReportVersions.prompt,
      inputFingerprint,
      userId,
    );
    if (claim === "in-flight") return NextResponse.json({ status: "generating" }, { status: 202 });
    if (claim === "claimed") {
      claimedBagVboId = analysis.property.bagVboId;
      claimUserId = userId;
    }

    const report = await generateAiPropertyReport(analysis.property, analysis, listing, locale);
    if (!report) {
      await persistFailureSafely(analysis, inputFingerprint, userId, "empty_report");
      return NextResponse.json({ status: "failed", message: t("errors.aiGeneration") }, { status: 502 });
    }
    await persistAiReport(analysis, report, inputFingerprint, userId);
    claimedBagVboId = null;
    return NextResponse.json({ status: "ready", report });
  } catch (error) {
    logError("WoonReality AI report failed", error);
    if (claimedBagVboId) await releaseAiReportClaim(claimedBagVboId, aiReportVersions.report, claimUserId);
    return NextResponse.json({ status: "failed", message: toUserMessage(error, t("errors.aiGeneration")) }, { status: 502 });
  }
}

async function persistFailureSafely(analysis: Analysis, inputFingerprint: string, userId: string | null, errorCode: string) {
  try {
    await persistAiReportFailure(analysis, aiReportVersions.report, aiReportVersions.prompt, inputFingerprint, errorCode, userId);
  } catch (error) {
    logWarn("Could not persist AI failure state", error);
  }
}
