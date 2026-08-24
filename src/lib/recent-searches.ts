import type { LocationSearchResult } from "@/src/lib/types";

const recentSearchesKey = "woonreality.recent-searches";

export const recentSearchesLimit = 5;

export function readRecentSearches(): LocationSearchResult[] {
  try {
    const raw = localStorage.getItem(recentSearchesKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is LocationSearchResult =>
      !!item && typeof item === "object" && typeof (item as LocationSearchResult).kind === "string");
  } catch { /* private mode */ }
  return [];
}

export function writeRecentSearches(results: LocationSearchResult[]) {
  try {
    localStorage.setItem(recentSearchesKey, JSON.stringify(results.slice(0, recentSearchesLimit)));
  } catch { /* private mode */ }
}

export function recentSearchKey(result: LocationSearchResult) {
  return result.kind === "adres" ? result.bagVboId : result.code;
}
