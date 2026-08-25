import type { Evidence, Signal } from "@/src/lib/types";
import { createEvidence } from "@/src/lib/analysis/evidence";
import { createSignal } from "@/src/lib/analysis/signals/create-signal";
import { distanceToGeometryM, geometryAreaM2 } from "@/src/lib/geo/measure";
import { clamp, round1 } from "@/src/lib/math";
import { scoreSeverity } from "@/src/lib/scoring/score";
import { pdokUrls, type BgtContext } from "@/src/lib/sources/pdok/bgt";
import type { Coordinates } from "@/src/lib/types";
import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator, type LibTranslator } from "@/src/lib/i18n/lib-translator";

/** getBgtFeatures queries a square bbox of ±250 m (500 m side), not a circle. */
export const BGT_SEARCH_RADIUS_M = 250;
/**
 * The BGT collection endpoints cap results at limit=100. Dense city centres
 * can genuinely have >100 road or green-terrain parts within the search box;
 * at the cap the percentages silently underrepresent reality.
 */
export const BGT_PAGE_CAP = 100;

export type BgtMetrics = {
  greenPercent: number;
  waterPercent: number;
  nearestRoadM: number;
  nearestWaterM: number;
  greenTruncated: boolean;
  roadsTruncated: boolean;
};

export function bgtMetrics(bgt: BgtContext, origin: Coordinates): BgtMetrics {
  const searchAreaM2 = (BGT_SEARCH_RADIUS_M * 2) ** 2;
  const greenAreaM2 = bgt.greenAreas.reduce((sum, feature) => sum + geometryAreaM2(feature.geometry, origin), 0);
  const waterAreaM2 = bgt.water.reduce((sum, feature) => sum + geometryAreaM2(feature.geometry, origin), 0);
  return {
    greenPercent: clamp((greenAreaM2 / searchAreaM2) * 100, 0, 100),
    waterPercent: clamp((waterAreaM2 / searchAreaM2) * 100, 0, 100),
    nearestRoadM: bgt.roads.length
      ? Math.min(...bgt.roads.map((feature) => distanceToGeometryM(origin, feature.geometry)))
      : Number.POSITIVE_INFINITY,
    nearestWaterM: bgt.water.length
      ? Math.min(...bgt.water.map((feature) => distanceToGeometryM(origin, feature.geometry)))
      : Number.POSITIVE_INFINITY,
    greenTruncated: bgt.greenAreas.length >= BGT_PAGE_CAP,
    roadsTruncated: bgt.roads.length >= BGT_PAGE_CAP,
  };
}

export function formatDistance(distance: number, locale: Locale = "nl") {
  if (!Number.isFinite(distance)) return getLibTranslator(locale, "lib-analysis")("bgt.over250m");
  return distance < 1000
    ? `${Math.round(distance / 10) * 10} m`
    : `${(distance / 1000).toFixed(1).replace(".", ",")} km`;
}

export function bgtRoadEvidence(fetchedAt: string, locale: Locale = "nl"): Evidence {
  const t = getLibTranslator(locale, "lib-analysis");
  return createEvidence({
    id: "bgt-roads",
    source: "PDOK / BGT",
    sourceUrl: `${pdokUrls.bgt}collections/wegdeel/items`,
    confidence: "medium",
    fetchedAt,
    spatialResolution: "lokale topografie",
    caveat: t("bgt.roadCaveat"),
  });
}

export function bgtGreenEvidence(fetchedAt: string, locale: Locale = "nl"): Evidence {
  const t = getLibTranslator(locale, "lib-analysis");
  return createEvidence({
    id: "bgt-green",
    source: "PDOK / BGT",
    sourceUrl: `${pdokUrls.bgt}collections/begroeidterreindeel/items`,
    confidence: "medium",
    fetchedAt,
    spatialResolution: "lokale topografie",
    caveat: t("bgt.greenCaveat"),
  });
}

export function bgtWaterEvidence(fetchedAt: string, locale: Locale = "nl"): Evidence {
  const t = getLibTranslator(locale, "lib-analysis");
  return createEvidence({
    id: "bgt-water",
    source: "PDOK / BGT",
    sourceUrl: `${pdokUrls.bgt}collections/waterdeel/items`,
    confidence: "medium",
    fetchedAt,
    spatialResolution: "lokale topografie",
    caveat: t("bgt.waterCaveat"),
  });
}

export function noiseFallbackScore(nearestRoadM: number) {
  return clamp(nearestRoadM === Infinity ? 8 : 8 - Math.max(0, 120 - nearestRoadM) / 25);
}

function noiseFallbackSummary(t: LibTranslator, nearestRoadM: number) {
  return nearestRoadM === Infinity
    ? t("bgt.noiseFallback.noRoad")
    : t("bgt.noiseFallback.nearest", { distance: formatDistance(nearestRoadM) });
}

export function greenSignal(input: { metrics: BgtMetrics; evidence: Evidence; bgtAvailable: boolean }, locale: Locale = "nl"): Signal {
  const { metrics, evidence, bgtAvailable } = input;
  const t = getLibTranslator(locale, "lib-analysis");
  const score = clamp(4 + metrics.greenPercent / 8);
  const truncatedNote = metrics.greenTruncated ? t("bgt.green.truncatedNote") : "";
  return createSignal({
    key: "green",
    label: t("bgt.green.label"),
    category: "klimaat",
    value: `${Math.round(metrics.greenPercent)}%`,
    score,
    summary: t("bgt.green.summary", { pct: Math.round(metrics.greenPercent), note: truncatedNote }),
    action: t("bgt.green.action"),
    raw: { value: Math.round(metrics.greenPercent), unit: "%", metric: "BGT-begroeid terrein binnen circa 250 m" },
    confidence: metrics.greenTruncated ? "low" : "medium",
    spatialScale: "circa 250 m zoekbuffer",
    available: bgtAvailable,
    evidence,
  });
}

export function heatSignal(input: { metrics: BgtMetrics; evidence: Evidence; bgtAvailable: boolean }, locale: Locale = "nl"): Signal {
  const { metrics, evidence, bgtAvailable } = input;
  const t = getLibTranslator(locale, "lib-analysis");
  const score = clamp(9 - (100 - metrics.greenPercent) / 18);
  const truncatedNote = metrics.greenTruncated ? t("bgt.heat.truncatedNote") : "";
  return createSignal({
    key: "heat",
    label: t("bgt.heat.label"),
    category: "klimaat",
    value: round1(score),
    unit: "/ 10",
    score,
    summary: t("bgt.heat.summary", { pct: Math.round(metrics.greenPercent), note: truncatedNote }),
    action: t("bgt.heat.action"),
    raw: { value: Math.round(100 - metrics.greenPercent), unit: "% verhardingsproxy", metric: "afgeleid uit BGT" },
    confidence: "low",
    spatialScale: "circa 250 m zoekbuffer",
    available: bgtAvailable,
    evidence,
  });
}

export function waterSignal(input: { metrics: BgtMetrics; evidence: Evidence; bgtAvailable: boolean }, locale: Locale = "nl"): Signal {
  const { metrics, evidence, bgtAvailable } = input;
  const t = getLibTranslator(locale, "lib-analysis");
  const nearWater = metrics.nearestWaterM < 30;
  return createSignal({
    key: "water",
    label: t("bgt.water.label"),
    category: "klimaat",
    value: Number.isFinite(metrics.nearestWaterM) ? formatDistance(metrics.nearestWaterM) : t("bgt.water.noneFound"),
    severity: nearWater ? "attention" : Number.isFinite(metrics.nearestWaterM) ? "good" : "neutral",
    summary: nearWater
      ? t("bgt.water.summaryClose", { distance: formatDistance(metrics.nearestWaterM) })
      : Number.isFinite(metrics.nearestWaterM)
        ? t("bgt.water.summaryFar", { distance: formatDistance(metrics.nearestWaterM), pct: Math.round(metrics.waterPercent) })
        : t("bgt.water.summaryNone"),
    action: nearWater
      ? t("bgt.water.actionClose")
      : t("bgt.water.actionDefault"),
    confidence: "low",
    spatialScale: "circa 250 m zoekbuffer",
    available: bgtAvailable,
    evidence,
  });
}

export function accessSignal(input: { roadCount: number; truncated: boolean; evidence: Evidence; bgtAvailable: boolean }, locale: Locale = "nl"): Signal {
  const { roadCount, truncated, evidence, bgtAvailable } = input;
  const t = getLibTranslator(locale, "lib-analysis");
  return createSignal({
    key: "access",
    label: t("bgt.access.label"),
    category: "mobiliteit",
    value: t("bgt.access.valueRoadParts", { count: roadCount }),
    severity: "neutral",
    summary: t("bgt.access.summary", { count: roadCount, note: truncated ? t("bgt.access.truncatedNote") : "" }),
    action: t("bgt.access.action"),
    confidence: "medium",
    spatialScale: "circa 250 m zoekbuffer",
    available: bgtAvailable,
    evidence,
  });
}

export function noiseFallbackParts(input: {
  nearestRoadM: number;
  roadEvidence: Evidence;
  bgtAvailable: boolean;
}, locale: Locale = "nl"): Pick<Signal, "value" | "score" | "severity" | "summary" | "raw" | "spatialScale" | "evidence" | "availability"> {
  const { nearestRoadM, roadEvidence, bgtAvailable } = input;
  const t = getLibTranslator(locale, "lib-analysis");
  const score = noiseFallbackScore(nearestRoadM);
  return {
    value: round1(score),
    score,
    severity: scoreSeverity(score),
    summary: noiseFallbackSummary(t, nearestRoadM),
    raw: { value: Math.round(nearestRoadM), unit: "m", metric: "afstand tot dichtstbijzijnde BGT-wegdeel" },
    spatialScale: "circa 250 m zoekbuffer",
    evidence: [roadEvidence],
    availability: bgtAvailable ? "available" : "unavailable",
  };
}
