import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { analyzeProperty } from "@/src/lib/analysis/analyze";
import { aiReportVersions, generateAiPropertyReport } from "@/src/lib/analysis/research";
import { getPropertyById } from "@/src/lib/sources/pdok/bag";
import { getListingForProperty } from "@/src/lib/sources/listings";
import { getDatabase } from "@/src/lib/db/client";
import { aiReportStatus, getAiReport, markAiReportGenerating, persistAiReport, persistAiReportFailure, persistAnalysis } from "@/src/lib/db/repository";

export const runtime = "nodejs";
export const maxDuration = 60;

function fingerprint(analysis: Awaited<ReturnType<typeof analyzeProperty>>, listing: Awaited<ReturnType<typeof getListingForProperty>>) {
  return createHash("sha256").update(JSON.stringify({
    analysisVersion: analysis.analysisVersion,
    scoringVersion: analysis.scoringVersion,
    property: analysis.property,
    signals: analysis.signals.map((signal) => ({ key: signal.key, value: signal.value, score: signal.score, availability: signal.availability })),
    listing: listing ? { externalId: listing.externalId, fetchedAt: listing.fetchedAt, lastUpdatedAt: listing.lastUpdatedAt, description: listing.description, askingPrice: listing.askingPrice } : null,
  })).digest("hex");
}

async function loadContext(bagId: string) {
  const property = await getPropertyById(decodeURIComponent(bagId));
  const [analysis, listing] = await Promise.all([analyzeProperty(property), getListingForProperty(property).catch(() => null)]);
  return { property, analysis, listing };
}

export async function GET(_request: Request, context: { params: Promise<{ bagId: string }> }) {
  if (!process.env.AI_GATEWAY_API_KEY || !getDatabase()) return NextResponse.json({ status: "unavailable", message: "AI_GATEWAY_API_KEY en DATABASE_URL zijn nodig voor AI-research." }, { status: 503 });
  const { bagId } = await context.params;
  try {
    const property = await getPropertyById(decodeURIComponent(bagId));
    const row = await getAiReport(property.bagVboId, aiReportVersions.report);
    const status = aiReportStatus(row);
    return NextResponse.json({ status, report: status === "ready" ? row?.reportJson ?? null : null, generatedAt: row?.generatedAt?.toISOString() ?? null, expiresAt: row?.expiresAt?.toISOString() ?? null });
  } catch (error) {
    return NextResponse.json({ status: "failed", message: error instanceof Error ? error.message : "AI-status kon niet worden geladen" }, { status: 502 });
  }
}

export async function POST(_request: Request, context: { params: Promise<{ bagId: string }> }) {
  if (!process.env.AI_GATEWAY_API_KEY || !getDatabase()) return NextResponse.json({ status: "unavailable", message: "AI_GATEWAY_API_KEY en DATABASE_URL zijn nodig voor AI-research." }, { status: 503 });
  const { bagId } = await context.params;
  try {
    const { analysis, listing } = await loadContext(bagId);
    await persistAnalysis(analysis);
    const inputFingerprint = fingerprint(analysis, listing);
    const existing = await getAiReport(analysis.property.bagVboId, aiReportVersions.report);
    if (existing && aiReportStatus(existing) === "ready" && existing.inputFingerprint === inputFingerprint) {
      return NextResponse.json({ status: "ready", report: existing.reportJson });
    }
    if (existing && aiReportStatus(existing) === "generating") return NextResponse.json({ status: "generating" }, { status: 202 });
    await markAiReportGenerating(analysis, aiReportVersions.report, aiReportVersions.prompt, inputFingerprint);
    const report = await generateAiPropertyReport(analysis.property, analysis, listing);
    if (!report) {
      await persistAiReportFailure(analysis, aiReportVersions.report, aiReportVersions.prompt, inputFingerprint, "empty_report");
      return NextResponse.json({ status: "failed", message: "AI-rapport kon niet worden samengesteld." }, { status: 502 });
    }
    await persistAiReport(analysis, report, inputFingerprint);
    return NextResponse.json({ status: "ready", report });
  } catch (error) {
    console.error("WoonReality AI report failed", error);
    return NextResponse.json({ status: "failed", message: error instanceof Error ? error.message : "AI-rapport kon niet worden gemaakt" }, { status: 502 });
  }
}
