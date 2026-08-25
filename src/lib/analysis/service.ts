import { ANALYSIS_VERSION, analyzeProperty } from "@/src/lib/analysis/analyze";
import { analyzePlace } from "@/src/lib/analysis/analyze-place";
import { SCORING_VERSION } from "@/src/lib/scoring/score";
import type { Locale } from "@/src/lib/i18n/config";
import { createInflightDeduper, createTtlCache } from "@/src/lib/cache/ttl";
import { getSourceCache, persistAnalysis, putSourceCache } from "@/src/lib/db/repository";
import type { Analysis, PlaceAnalysis, PlaceKind, Property } from "@/src/lib/types";

const CACHE_SOURCE = "analysis";
const PLACE_CACHE_SOURCE = "place-analysis";
// Matches the public CDN cache window on /api/analysis.
const TTL_SECONDS = 60 * 60 * 24;

/**
 * Process-local memoization in front of the Supabase-backed source_cache.
 * Keeps the documented no-Supabase mode from recomputing all eleven upstream
 * sources on every view, and dedupes concurrent requests for the same key so
 * a burst of visitors triggers one computation instead of N.
 */
const MEMO_LIMIT = 200;
const analysisMemo = createTtlCache<Analysis>({ ttlMs: TTL_SECONDS * 1000, limit: MEMO_LIMIT });
const placeMemo = createTtlCache<PlaceAnalysis>({ ttlMs: TTL_SECONDS * 1000, limit: MEMO_LIMIT });
const dedupeAnalysis = createInflightDeduper<Analysis>();
const dedupePlace = createInflightDeduper<PlaceAnalysis | null>();

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
export async function getSharedAnalysis(property: Property, locale: Locale = "nl"): Promise<Analysis> {
  const key = property.bagVboId;
  // Localized copy is baked into the analysis payload, so the cache is
  // partitioned per locale alongside the analysis/scoring version.
  const memoKey = `${schemaVersion()}:${locale}:${key}`;
  return dedupeAnalysis(memoKey, async () => {
    const memoized = analysisMemo.get(memoKey);
    if (memoized) return memoized;
    try {
      const cached = await getSourceCache<Analysis>(CACHE_SOURCE, key, `${schemaVersion()}:${locale}`);
      if (cached && cached.property?.bagVboId === key && typeof cached.overallScore === "number") {
        const result = { ...cached, persistence: "database" as const };
        analysisMemo.set(memoKey, result);
        return result;
      }
    } catch {
      // Fall through to a fresh computation.
    }
    const analysis = await analyzeProperty(property, locale);
    try {
      analysis.persistence = await persistAnalysis(analysis);
    } catch {
      analysis.persistence = "cache-only";
    }
    void putSourceCache(CACHE_SOURCE, key, analysis, `${schemaVersion()}:${locale}`, TTL_SECONDS);
    analysisMemo.set(memoKey, analysis);
    return analysis;
  });
}

/**
 * Same sharing for place analyses (buurt/gemeente/woonplaats): the CBS/PDOK/
 * politie upstreams are expensive and slow-moving, so /api/place, place pages
 * and the place comparison all reuse one computation per kind:code.
 */
export async function getSharedPlaceAnalysis(kind: PlaceKind, code: string, locale: Locale = "nl"): Promise<PlaceAnalysis | null> {
  const key = `${kind}:${code}`;
  const version = `${schemaVersion()}:${locale}`;
  const memoKey = `${version}:${key}`;
  return dedupePlace(memoKey, async () => {
    const memoized = placeMemo.get(memoKey);
    if (memoized) return memoized;
    try {
      const cached = await getSourceCache<PlaceAnalysis>(PLACE_CACHE_SOURCE, key, version);
      if (cached && cached.code === code && Array.isArray(cached.signals)) {
        placeMemo.set(memoKey, cached);
        return cached;
      }
    } catch {
      // Fall through to a fresh computation.
    }
    const place = await analyzePlace(kind, code, locale);
    if (place) {
      void putSourceCache(PLACE_CACHE_SOURCE, key, place, version, TTL_SECONDS);
      placeMemo.set(memoKey, place);
    }
    return place;
  });
}
