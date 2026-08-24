import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import type { PlaceAnalysis, PlaceKind } from "@/src/lib/types";

export const PLACE_COMPARE_STORAGE_KEY = "woonreality.placeCompare";
export const PLACE_COMPARE_MAX = 4;

const PLACE_KINDS: PlaceKind[] = ["buurt", "gemeente", "woonplaats"];

export type PlaceRef = { kind: PlaceKind; code: string };

/** Parse `places=buurt:BU03980600,gemeente:GM1586` into validated refs (max 4). */
export function parsePlaceParam(value: string | undefined): PlaceRef[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, PLACE_COMPARE_MAX)
    .flatMap((entry) => {
      const separator = entry.indexOf(":");
      const kind = separator > -1 ? entry.slice(0, separator) : "";
      const code = separator > -1 ? entry.slice(separator + 1) : entry;
      return PLACE_KINDS.includes(kind as PlaceKind) && /^[A-Za-z0-9-]+$/.test(code)
        ? [{ kind: kind as PlaceKind, code }]
        : [];
    });
}

export function placeRefKey(ref: PlaceRef) {
  return `${ref.kind}:${ref.code}`;
}

type StoredPlace = PlaceRef & { name?: string };

function isStoredPlace(value: unknown): value is StoredPlace {
  return typeof value === "object" && value != null
    && typeof (value as StoredPlace).kind === "string"
    && PLACE_KINDS.includes((value as StoredPlace).kind)
    && typeof (value as StoredPlace).code === "string"
    && /^[A-Za-z0-9-]+$/.test((value as StoredPlace).code);
}

export function loadStoredPlaces(): PlaceRef[] {
  try {
    const raw = window.sessionStorage.getItem(PLACE_COMPARE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown[] : [];
    const seen = new Set<string>();
    return parsed.filter(isStoredPlace).map(({ kind, code }) => ({ kind, code })).filter((ref) => {
      const key = placeRefKey(ref);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, PLACE_COMPARE_MAX);
  } catch {
    return [];
  }
}

export function saveStoredPlace(ref: PlaceRef) {
  try {
    const existing = loadStoredPlaces();
    const key = placeRefKey(ref);
    const next = [ref, ...existing.filter((item) => placeRefKey(item) !== key)].slice(0, PLACE_COMPARE_MAX);
    window.sessionStorage.setItem(PLACE_COMPARE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Session-only feature; private-mode failures must not break navigation.
  }
}

export function removeStoredPlace(ref: PlaceRef) {
  try {
    const next = loadStoredPlaces().filter((item) => placeRefKey(item) !== placeRefKey(ref));
    window.sessionStorage.setItem(PLACE_COMPARE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore.
  }
}

/**
 * One row per signal that at least one place reports. Signals are matched by
 * key so places of different kinds stay comparable; scores (0–10) are
 * higher-is-better, raw distances are lower-is-better.
 */
export type PlaceMetricRow = {
  key: string;
  label: string;
  unit?: string;
  higherIsBetter: boolean;
  values: (number | null)[];
};

export function placeSignalRows(places: PlaceAnalysis[]): PlaceMetricRow[] {
  const byKey = new Map<string, { label: string; unit?: string; higherIsBetter: boolean; values: (number | null)[] }>();
  places.forEach((place, placeIndex) => {
    for (const signal of place.signals) {
      const scored = signal.availability !== "unavailable" && typeof signal.score === "number";
      const numericValue = typeof signal.value === "number" ? signal.value : null;
      if (!scored && numericValue == null) continue;
      const existing = byKey.get(signal.key);
      const entry = existing ?? {
        label: signal.label,
        unit: signal.unit,
        higherIsBetter: signal.unit === "/ 10",
        values: Array.from({ length: places.length }, () => null as number | null),
      };
      entry.values[placeIndex] = scored ? Math.round((signal.score ?? 0) * 10) / 10 : numericValue;
      byKey.set(signal.key, entry);
    }
  });
  return [...byKey.entries()]
    .filter(([, entry]) => entry.values.some((value) => value != null))
    .map(([key, entry]) => ({ key, ...entry }));
}

/** True when `value` is strictly the best in the row (ties share nothing). */
export function isBestInRow(values: (number | null)[], index: number, higherIsBetter: boolean) {
  const value = values[index];
  if (value == null) return false;
  return values.every((other, otherIndex) => otherIndex === index || other == null || (higherIsBetter ? value > other : value < other));
}

export type PlaceFactRow = {
  key: string;
  label: string;
  values: (string | null)[];
};

function localeTag(locale: Locale) {
  return locale === "en" ? "en-IE" : "nl-NL";
}

function factFormatters(locale: Locale) {
  const t = getLibTranslator(locale, "lib-domain");
  const tag = localeTag(locale);
  return [
    { key: "inhabitants", label: t("placeCompare.inhabitants"), get: (place: PlaceAnalysis) => place.cbs?.inhabitants, fmt: (value: number) => value.toLocaleString(tag) },
    { key: "density", label: t("placeCompare.densityPerKm2"), get: (place: PlaceAnalysis) => place.cbs?.populationDensity, fmt: (value: number) => Math.round(value).toLocaleString(tag) },
    { key: "woz", label: t("placeCompare.avgWozValue"), get: (place: PlaceAnalysis) => place.cbs?.averageWoz, fmt: (value: number) => `€ ${Math.round(value).toLocaleString(tag)}` },
    { key: "children", label: t("placeCompare.householdsWithChildren"), get: (place: PlaceAnalysis) => place.cbs?.shareHouseholdsWithChildrenPct, fmt: (value: number) => `${Math.round(value)}%` },
    { key: "school-distance", label: t("placeCompare.primarySchoolDistance"), get: (place: PlaceAnalysis) => place.cbs?.primarySchoolDistanceKm, fmt: (value: number) => `${value.toLocaleString(tag, { maximumFractionDigits: 1 })} km` },
  ] as const;
}

export function placeFactRows(places: PlaceAnalysis[], locale: Locale = "nl"): PlaceFactRow[] {
  return factFormatters(locale).map(({ key, label, get, fmt }) => ({
    key,
    label,
    values: places.map((place) => {
      const value = get(place);
      return typeof value === "number" && Number.isFinite(value) ? fmt(value) : null;
    }),
  })).filter((row) => row.values.some((value) => value != null));
}
