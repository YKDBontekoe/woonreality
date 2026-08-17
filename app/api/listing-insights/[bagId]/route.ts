import { NextResponse } from "next/server";
import { analyzeProperty } from "@/src/lib/analysis/analyze";
import {
  generateListingInsights,
  hasListingExtractText,
  listingExtractFingerprint,
  listingExtractVersions,
} from "@/src/lib/analysis/listing-extract";
import { persistAnalysis, persistAiReportFailure, persistStructuredAiReport, getAiReport, markAiReportGenerating, resolveReadyReport, aiReportStatus } from "@/src/lib/db/repository";
import { listingFromUserRecord } from "@/src/lib/listing-import";
import { mergeListings } from "@/src/lib/listing-merge";
import { getPropertyById } from "@/src/lib/sources/pdok/bag";
import { getListingForProperty } from "@/src/lib/sources/listings";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/src/lib/supabase/server";
import type { ListingInsights, PropertyListing } from "@/src/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

async function loadUserListing(bagId: string): Promise<{ listing: PropertyListing | null; userId: string | null }> {
  if (!isSupabaseConfigured()) return { listing: null, userId: null };
  try {
    const supabase = await createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return { listing: null, userId: null };
    const { data } = await supabase.from("user_listings").select("source_url, asking_price, extracted_json, updated_at").eq("user_id", user.id).eq("bag_vbo_id", bagId).maybeSingle();
    return { listing: data ? listingFromUserRecord(data) : null, userId: user.id };
  } catch {
    return { listing: null, userId: null };
  }
}

async function loadContext(bagId: string) {
  const property = await getPropertyById(decodeURIComponent(bagId));
  const [analysis, licensedListing, user] = await Promise.all([
    analyzeProperty(property),
    getListingForProperty(property).catch(() => null),
    loadUserListing(property.bagVboId).catch(() => ({ listing: null, userId: null })),
  ]);
  const listing = mergeListings(user.listing, licensedListing);
  const userId = user.listing && user.userId ? user.userId : null;
  return { property, analysis, listing, userId };
}

function asInsights(value: unknown): ListingInsights | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<ListingInsights>;
  if (!record.headline || !Array.isArray(record.points)) return null;
  return record as ListingInsights;
}

export async function GET(_request: Request, context: { params: Promise<{ bagId: string }> }) {
  if (!process.env.AI_GATEWAY_API_KEY) {
    return NextResponse.json({ status: "unavailable", message: "AI_GATEWAY_API_KEY is nodig voor listing-extractie." }, { status: 503 });
  }
  const { bagId } = await context.params;
  try {
    const { listing, userId, analysis } = await loadContext(bagId);
    if (!hasListingExtractText(listing)) {
      return NextResponse.json({ status: "missing", reason: "no-listing-text" });
    }
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ status: "missing" });
    }
    const fingerprint = listingExtractFingerprint(listing);
    const row = await getAiReport(analysis.property.bagVboId, listingExtractVersions.report, userId);
    const resolved = resolveReadyReport(row, fingerprint);
    return NextResponse.json({
      ...resolved,
      report: asInsights(resolved.report),
    });
  } catch (error) {
    return NextResponse.json({ status: "failed", message: error instanceof Error ? error.message : "Listing-inzichten konden niet worden geladen" }, { status: 502 });
  }
}

export async function POST(_request: Request, context: { params: Promise<{ bagId: string }> }) {
  if (!process.env.AI_GATEWAY_API_KEY) {
    return NextResponse.json({ status: "unavailable", message: "AI_GATEWAY_API_KEY is nodig voor listing-extractie." }, { status: 503 });
  }
  const { bagId } = await context.params;
  try {
    const { analysis, listing, userId } = await loadContext(bagId);
    if (!listing || !hasListingExtractText(listing)) {
      return NextResponse.json({ status: "missing", reason: "no-listing-text" });
    }
    await persistAnalysis(analysis);
    const fingerprint = listingExtractFingerprint(listing);
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
      await markAiReportGenerating(analysis, listingExtractVersions.report, listingExtractVersions.prompt, fingerprint, userId);
    }
    const report = await generateListingInsights(listing);
    if (!report) {
      await persistAiReportFailure(analysis, listingExtractVersions.report, listingExtractVersions.prompt, fingerprint, "empty_report", userId);
      return NextResponse.json({ status: "failed", message: "Advertentietekst kon niet worden geëxtraheerd." }, { status: 502 });
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
    console.error("WoonReality listing insights failed", error);
    return NextResponse.json({ status: "failed", message: error instanceof Error ? error.message : "Listing-inzichten konden niet worden gemaakt" }, { status: 502 });
  }
}
