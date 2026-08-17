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
import type { Analysis, ListingInsights, PropertyListing } from "@/src/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const ANON_WINDOW_MS = 10 * 60 * 1000;
const ANON_MAX_GENERATIONS = 5;
const anonymousGenerations = new Map<string, number[]>();

function clientKey(request: Request, bagId: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
  return `${ip}:${bagId}`;
}

function allowAnonymousGeneration(request: Request, bagId: string) {
  const key = clientKey(request, bagId);
  const now = Date.now();
  const hits = (anonymousGenerations.get(key) ?? []).filter((stamp) => now - stamp < ANON_WINDOW_MS);
  if (hits.length >= ANON_MAX_GENERATIONS) {
    anonymousGenerations.set(key, hits);
    return false;
  }
  hits.push(now);
  anonymousGenerations.set(key, hits);
  return true;
}

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

async function loadListingContext(bagId: string) {
  const property = await getPropertyById(decodeURIComponent(bagId));
  const [licensedListing, user] = await Promise.all([
    getListingForProperty(property).catch(() => null),
    loadUserListing(property.bagVboId).catch(() => ({ listing: null, userId: null })),
  ]);
  const listing = mergeListings(user.listing, licensedListing);
  return {
    property,
    listing,
    userId: user.listing && user.userId ? user.userId : null,
    signedIn: Boolean(user.userId),
  };
}

async function loadContext(bagId: string) {
  const base = await loadListingContext(bagId);
  const analysis = await analyzeProperty(base.property);
  return { ...base, analysis };
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
    return NextResponse.json({ status: "failed", message: "Listing-inzichten konden niet worden geladen" }, { status: 502 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ bagId: string }> }) {
  if (!process.env.AI_GATEWAY_API_KEY) {
    return NextResponse.json({ status: "unavailable", message: "AI_GATEWAY_API_KEY is nodig voor listing-extractie." }, { status: 503 });
  }
  const { bagId } = await context.params;
  let analysis: Analysis | undefined;
  let fingerprint = "";
  let userId: string | null = null;
  try {
    const loaded = await loadContext(bagId);
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
    }
    if (!signedIn && !allowAnonymousGeneration(request, bagId)) {
      return NextResponse.json({ status: "failed", message: "Te veel verzoeken. Probeer het later opnieuw of log in." }, { status: 429 });
    }
    if (isSupabaseConfigured()) {
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
    if (analysis && fingerprint) {
      await persistAiReportFailure(analysis, listingExtractVersions.report, listingExtractVersions.prompt, fingerprint, "generate_failed", userId);
    }
    return NextResponse.json({ status: "failed", message: "Listing-inzichten konden niet worden gemaakt" }, { status: 502 });
  }
}
