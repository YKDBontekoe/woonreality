import type { Locale } from "@/src/lib/i18n/config";
import { getSharedAnalysis } from "@/src/lib/analysis/service";
import { listingFromUserRecord } from "@/src/lib/listing-import";
import { mergeListings } from "@/src/lib/listing-merge";
import { getPropertyById } from "@/src/lib/sources/pdok/bag";
import { getListingForProperty } from "@/src/lib/sources/listings";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/src/lib/supabase/server";
import type { PropertyListing } from "@/src/lib/types";

/**
 * Shared context loader for the AI endpoints (research report and listing
 * insights). One implementation so guards, merges and persistence stay in
 * step across both LLM features.
 */
export async function loadUserListing(bagId: string): Promise<{ listing: PropertyListing | null; userId: string | null }> {
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

/** The user's captured listing is personal data; only count it as "their" context when it exists. */
export function cacheUserId(userListing: PropertyListing | null, userId: string | null) {
  return userListing && userId ? userId : null;
}

export async function loadListingContext(bagId: string) {
  const property = await getPropertyById(decodeURIComponent(bagId));
  const [licensedListing, user] = await Promise.all([
    getListingForProperty(property).catch(() => null),
    loadUserListing(property.bagVboId).catch(() => ({ listing: null, userId: null })),
  ]);
  const listing = mergeListings(user.listing, licensedListing);
  return { property, listing, userId: cacheUserId(user.listing, user.userId), signedIn: Boolean(user.userId) };
}

export async function loadAiContext(bagId: string, locale: Locale = "nl") {
  const base = await loadListingContext(bagId);
  const analysis = await getSharedAnalysis(base.property, locale);
  return { ...base, analysis };
}

const ANON_WINDOW_MS = 10 * 60 * 1000;
const ANON_MAX_GENERATIONS = 5;
const anonymousGenerations = new Map<string, number[]>();

function clientKey(request: Request, scope: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
  return `${ip}:${scope}`;
}

/**
 * Anonymous visitors share one LLM budget per IP per address per window.
 * Signed-in users are metered by their account instead of their IP.
 */
export function allowAnonymousLlmGeneration(request: Request, scope: string, authenticated: boolean) {
  if (authenticated) return true;
  const key = clientKey(request, scope);
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
