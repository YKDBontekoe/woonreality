import { ANALYSIS_VERSION, analyzeProperty } from "@/src/lib/analysis/analyze";
import { analyzePlace } from "@/src/lib/analysis/analyze-place";
import { SCORING_VERSION } from "@/src/lib/scoring/score";
import type { Locale } from "@/src/lib/i18n/config";
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
type MemoEntry<T> = { value: T; expiresAt: number };
const analysisMemo = new Map<string, MemoEntry<Analysis>>();
const placeMemo = new Map<string, MemoEntry<PlaceAnalysis>>();
const inflightAnalyses = new Map<string, Promise<Analysis>>();
const inflightPlaces = new Map<string, Promise<PlaceAnalysis | null>>();

function memoGet<T>(store: Map<string, MemoEntry<T>>, key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  // Refresh recency for LRU eviction ordering.
  store.delete(key);
  store.set(key, entry);
  return entry.value;
}

function memoSet<T>(store: Map<string, MemoEntry<T>>, key: string, value: T) {
  if (store.size >= MEMO_LIMIT && !store.has(key)) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { value, expiresAt: Date.now() + TTL_SECONDS * 1000 });
}

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
  const version = `${schemaVersion()}:${locale}`;
  const memoKey = `${version}:${key}`;
  const memoized = memoGet(analysisMemo, memoKey);
  if (memoized) return memoized;
  const inflight = inflightAnalyses.get(memoKey);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const cached = await getSourceCache<Analysis>(CACHE_SOURCE, key, version);
      if (cached && cached.property?.bagVboId === key && typeof cached.overallScore === "number") {
        const result = { ...cached, persistence: "database" as const };
        memoSet(analysisMemo, memoKey, result);
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
    void putSourceCache(CACHE_SOURCE, key, analysis, version, TTL_SECONDS);
    memoSet(analysisMemo, memoKey, analysis);
    return analysis;
  })().finally(() => { inflightAnalyses.delete(memoKey); });

  inflightAnalyses.set(memoKey, promise);
  return promise;
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
  const memoized = memoGet(placeMemo, memoKey);
  if (memoized) return memoized;
  const inflight = inflightPlaces.get(memoKey);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const cached = await getSourceCache<PlaceAnalysis>(PLACE_CACHE_SOURCE, key, version);
      if (cached && cached.code === code && Array.isArray(cached.signals)) {
        memoSet(placeMemo, memoKey, cached);
        return cached;
      }
    } catch {
      // Fall through to a fresh computation.
    }
    const place = await analyzePlace(kind, code, locale);
    if (place) {
      void putSourceCache(PLACE_CACHE_SOURCE, key, place, version, TTL_SECONDS);
      memoSet(placeMemo, memoKey, place);
    }
    return place;
  })().finally(() => { inflightPlaces.delete(memoKey); });

  inflightPlaces.set(memoKey, promise);
  return promise;
}
