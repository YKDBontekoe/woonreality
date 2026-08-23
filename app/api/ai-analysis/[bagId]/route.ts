import { NextResponse } from "next/server";
import { analyzeProperty } from "@/src/lib/analysis/analyze";
import { logError, logWarn } from "@/src/lib/logger";
import { toUserMessage } from "@/src/lib/errors";
import { aiInputFingerprint, aiReportVersions, generateAiPropertyReport } from "@/src/lib/analysis/research";
import { getPropertyById } from "@/src/lib/sources/pdok/bag";
import { getListingForProperty } from "@/src/lib/sources/listings";
import { listingFromUserRecord } from "@/src/lib/listing-import";
import { mergeListings } from "@/src/lib/listing-merge";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/src/lib/supabase/server";
import { claimAiReportGeneration, getAiReport, persistAiReport, persistAiReportFailure, persistAnalysis, releaseAiReportClaim, resolveReadyReport } from "@/src/lib/db/repository";
import type { Analysis } from "@/src/lib/types";
import type { PropertyListing } from "@/src/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The Funda browser extension and paste-import both write to `user_listings`.
 * That is the richest, freshest listing data we have for this address, so it
 * takes priority over a licensed feed for AI research. Fields the user's
 * listing doesn't have fall back to the licensed feed, if one is configured.
 */
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

function cacheUserId(userListing: PropertyListing | null, userId: string | null) {
  return userListing && userId ? userId : null;
}

async function loadContext(bagId: string) {
  const property = await getPropertyById(decodeURIComponent(bagId));
  const [analysis, licensedListing, user] = await Promise.all([
    analyzeProperty(property),
    getListingForProperty(property).catch(() => null),
    loadUserListing(property.bagVboId).catch(() => ({ listing: null, userId: null })),
  ]);
  const listing = mergeListings(user.listing, licensedListing);
  return { property, analysis, listing, userId: cacheUserId(user.listing, user.userId) };
}

const STATUS_LOAD_FAILED = "AI-status kon niet worden geladen.";
const GENERATION_FAILED = "De AI-analyse kon nu niet worden gemaakt. Probeer het later opnieuw.";

export async function GET(_request: Request, context: { params: Promise<{ bagId: string }> }) {
  if (!process.env.AI_GATEWAY_API_KEY || !isSupabaseConfigured()) return NextResponse.json({ status: "unavailable", message: "AI_GATEWAY_API_KEY en Supabase-configuratie zijn nodig voor AI-research." }, { status: 503 });
  const { bagId } = await context.params;
  try {
    const { analysis, listing, userId } = await loadContext(bagId);
    const fingerprint = aiInputFingerprint(analysis, listing);
    const row = await getAiReport(analysis.property.bagVboId, aiReportVersions.report, userId);
    const resolved = resolveReadyReport(row, fingerprint);
    return NextResponse.json(resolved);
  } catch (error) {
    logError("WoonReality AI report status failed", error);
    return NextResponse.json({ status: "failed", message: toUserMessage(error, STATUS_LOAD_FAILED) }, { status: 502 });
  }
}

export async function POST(_request: Request, context: { params: Promise<{ bagId: string }> }) {
  if (!process.env.AI_GATEWAY_API_KEY || !isSupabaseConfigured()) return NextResponse.json({ status: "unavailable", message: "AI_GATEWAY_API_KEY en Supabase-configuratie zijn nodig voor AI-research." }, { status: 503 });
  const { bagId } = await context.params;
  let claimedBagVboId: string | null = null;
  let claimUserId: string | null = null;
  try {
    const { analysis, listing, userId } = await loadContext(bagId);
    await persistAnalysis(analysis);
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

    const report = await generateAiPropertyReport(analysis.property, analysis, listing);
    if (!report) {
      await persistFailureSafely(analysis, inputFingerprint, userId, "empty_report");
      return NextResponse.json({ status: "failed", message: GENERATION_FAILED }, { status: 502 });
    }
    await persistAiReport(analysis, report, inputFingerprint, userId);
    claimedBagVboId = null;
    return NextResponse.json({ status: "ready", report });
  } catch (error) {
    logError("WoonReality AI report failed", error);
    if (claimedBagVboId) await releaseAiReportClaim(claimedBagVboId, aiReportVersions.report, claimUserId);
    return NextResponse.json({ status: "failed", message: toUserMessage(error, GENERATION_FAILED) }, { status: 502 });
  }
}

async function persistFailureSafely(analysis: Analysis, inputFingerprint: string, userId: string | null, errorCode: string) {
  try {
    await persistAiReportFailure(analysis, aiReportVersions.report, aiReportVersions.prompt, inputFingerprint, errorCode, userId);
  } catch (error) {
    logWarn("Could not persist AI failure state", error);
  }
}
