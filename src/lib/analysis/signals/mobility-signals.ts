import type { Evidence, Signal } from "@/src/lib/types";
import { createEvidence } from "@/src/lib/analysis/evidence";
import { createSignal } from "@/src/lib/analysis/signals/create-signal";
import { clamp, round1, roundToStep } from "@/src/lib/math";
import { ndovHaltesUrl, type NdovContext } from "@/src/lib/sources/ndov";
import { dsoOnderwerpenUrl, type DsoContext } from "@/src/lib/sources/dso";
import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";

export function ndovEvidence(context: NdovContext | null, locale: Locale = "nl"): Evidence {
  const t = getLibTranslator(locale, "lib-analysis");
  return createEvidence({
    id: "ndov-haltes",
    source: "NDOV haltes",
    sourceUrl: ndovHaltesUrl,
    confidence: "high",
    sourceRecordId: context?.catalogDate,
    fetchedAt: context?.fetchedAt,
    spatialResolution: "haltecoördinaat",
    caveat: t("mobility.ndovCaveat"),
  });
}

/** Score slope: a stop 150 m away scores ~9, one at 750 m ~5. */
const TRANSIT_M_PER_POINT = 150;

export function transitScoreForDistance(nearestDistanceM: number) {
  return clamp(10 - nearestDistanceM / TRANSIT_M_PER_POINT);
}

export function transitSignal(input: { ndov: NdovContext | null; evidence: Evidence; available: boolean }, locale: Locale = "nl"): Signal {
  const { ndov, evidence, available } = input;
  const t = getLibTranslator(locale, "lib-analysis");
  const score = ndov?.nearestDistanceM != null ? transitScoreForDistance(ndov.nearestDistanceM) : ndov ? 3 : undefined;
  const summary = ndov?.nearestDistanceM != null
    ? t("mobility.transit.summaryDistance", {
      distance: Math.round(ndov.nearestDistanceM / 10) * 10,
      stops: ndov.stopCount,
      catalog: ndov.catalogDate ? t("mobility.transit.catalogSuffix", { date: ndov.catalogDate }) : "",
    })
    : ndov
      ? t("mobility.transit.summaryNoStop")
      : t("mobility.transit.summaryUnavailable");
  return createSignal({
    key: "transit",
    label: t("mobility.transit.label"),
    category: "mobiliteit",
    value: ndov?.nearestDistanceM != null ? `${roundToStep(ndov.nearestDistanceM, 10)} m` : ndov ? t("mobility.transit.valueNoneNearby") : t("common.noData"),
    score,
    summary,
    action: t("mobility.transit.action"),
    raw: ndov?.nearestDistanceM != null
      ? { value: Math.round(ndov.nearestDistanceM), unit: "m", metric: "afstand tot dichtstbijzijnde NDOV-halte" }
      : undefined,
    confidence: "high",
    spatialScale: "haltecoördinaat",
    available,
    evidence,
  });
}

export function dsoEvidence(context: DsoContext | null, locale: Locale = "nl"): Evidence {
  const t = getLibTranslator(locale, "lib-analysis");
  return createEvidence({
    id: "dso-onderwerpen",
    source: "DSO Omgevingsdocumenten",
    sourceUrl: dsoOnderwerpenUrl,
    confidence: "medium",
    fetchedAt: context?.fetchedAt,
    spatialResolution: "puntbevraging",
    caveat: t("mobility.dsoCaveat"),
  });
}

/** More overlapping planning topics slightly lower the future outlook, capped at −3. */
export function futureScoreForTopics(topicCount: number) {
  return clamp(7 - Math.min(3, topicCount / 10));
}

export function futureSignal(input: { dso: DsoContext | null; evidence: Evidence; available: boolean }, locale: Locale = "nl"): Signal {
  const { dso, evidence, available } = input;
  const t = getLibTranslator(locale, "lib-analysis");
  return createSignal({
    key: "future",
    label: t("mobility.future.label"),
    category: "toekomst",
    value: dso ? t("mobility.future.valueTopics", { count: dso.topicCount }) : t("common.noData"),
    score: dso ? futureScoreForTopics(dso.topicCount) : undefined,
    severity: "neutral",
    summary: dso
      ? t("mobility.future.summary", {
        count: dso.topicCount,
        names: dso.topicNames.length ? t("mobility.future.namesSuffix", { names: dso.topicNames.join(", ") }) : "",
      })
      : t("mobility.future.summaryUnavailable"),
    action: t("mobility.future.action"),
    confidence: "medium",
    spatialScale: "puntbevraging",
    available,
    evidence,
  });
}

export function roundDistance(value: number) {
  return round1(value);
}
