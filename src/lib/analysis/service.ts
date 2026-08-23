import { ANALYSIS_VERSION, analyzeProperty } from "@/src/lib/analysis/analyze";
import { analyzePlace } from "@/src/lib/analysis/analyze-place";
import { SCORING_VERSION } from "@/src/lib/scoring/score";
import { getSourceCache, persistAnalysis, putSourceCache } from "@/src/lib/db/repository";
import type { Analysis, PlaceAnalysis, PlaceKind, Property } from "@/src/lib/types";

const CACHE_SOURCE = "analysis";
const PLACE_CACHE_SOURCE = "place-analysis";
// Matches the public CDN cache window on /api/analysis.
const TTL_SECONDS = 60 * 60 * 24;

function schemaVersion() {
  return `${ANALYSIS_VERSION}:${SCORING_VERSION}`;
}

/**
 * Single entry point for the deterministic property analysis. Reads a cached
 * analysis from `source_cache` (keyed by bagId + analysis/scoring version) so
 * API routes, server-rendered pages and AI pipelines share one computation —
 * and one set of persisted rows — instead of refetching all upstream sources
 * per consumer.
 */
export async function getSharedAnalysis(property: Property): Promise<Analysis> {
  const key = property.bagVboId;
  const version = schemaVersion();
  try {
    const cached = await getSourceCache<Analysis>(CACHE_SOURCE, key, version);
    if (cached && cached.property?.bagVboId === key && typeof cached.overallScore === "number") {
      return { ...cached, persistence: "database" };
    }
  } catch {
    // Fall through to a fresh computation.
  }
  const analysis = await analyzeProperty(property);
  try {
    analysis.persistence = await persistAnalysis(analysis);
  } catch {
    analysis.persistence = "cache-only";
  }
  void putSourceCache(CACHE_SOURCE, key, analysis, version, TTL_SECONDS);
  return analysis;
}

/**
 * Same sharing for place analyses (buurt/gemeente/woonplaats): the CBS/PDOK/
 * politie upstreams are expensive and slow-moving, so /api/place, place pages
 * and the place comparison all reuse one computation per kind:code.
 */
export async function getSharedPlaceAnalysis(kind: PlaceKind, code: string): Promise<PlaceAnalysis | null> {
  const key = `${kind}:${code}`;
  const version = schemaVersion();
  try {
    const cached = await getSourceCache<PlaceAnalysis>(PLACE_CACHE_SOURCE, key, version);
    if (cached && cached.code === code && Array.isArray(cached.signals)) return cached;
  } catch {
    // Fall through to a fresh computation.
  }
  const place = await analyzePlace(kind, code);
  if (place) void putSourceCache(PLACE_CACHE_SOURCE, key, place, version, TTL_SECONDS);
  return place;
}
