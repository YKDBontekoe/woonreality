import type { Evidence, Signal } from "@/src/lib/types";
import { createEvidence } from "@/src/lib/analysis/evidence";
import { clamp, round1, roundToStep } from "@/src/lib/math";
import { scoreSeverity } from "@/src/lib/scoring/score";
import { ndovHaltesUrl, type NdovContext } from "@/src/lib/sources/ndov";
import { dsoOnderwerpenUrl, type DsoContext } from "@/src/lib/sources/dso";

export function ndovEvidence(context: NdovContext | null): Evidence {
  return createEvidence({
    id: "ndov-haltes",
    source: "NDOV haltes",
    sourceUrl: ndovHaltesUrl,
    confidence: "high",
    sourceRecordId: context?.catalogDate,
    fetchedAt: context?.fetchedAt,
    spatialResolution: "haltecoördinaat",
    caveat: "Een nabijgelegen halte zegt niets over frequentie, reistijd of toegankelijkheid van de specifieke lijn.",
  });
}

/** Score slope: a stop 150 m away scores ~9, one at 750 m ~5. */
const TRANSIT_M_PER_POINT = 150;

export function transitScoreForDistance(nearestDistanceM: number) {
  return clamp(10 - nearestDistanceM / TRANSIT_M_PER_POINT);
}

export function transitSignal(input: { ndov: NdovContext | null; evidence: Evidence; available: boolean }): Signal {
  const { ndov, evidence, available } = input;
  const score = ndov?.nearestDistanceM != null ? transitScoreForDistance(ndov.nearestDistanceM) : ndov ? 3 : undefined;
  const summary = ndov?.nearestDistanceM != null
    ? `Dichtstbijzijnde NDOV-halte ligt op circa ${Math.round(ndov.nearestDistanceM / 10) * 10} m; ${ndov.stopCount} halte(n) binnen 1 km${ndov.catalogDate ? ` (catalogus ${ndov.catalogDate})` : ""}.`
    : ndov
      ? "Geen NDOV-halte binnen 1 kilometer gevonden; controleer de catalogus en lokale dienstregeling voordat je hierop beslist."
      : "De NDOV-haltecatalogus kon niet worden opgehaald.";
  return {
    key: "transit",
    label: "OV-haltes",
    category: "mobiliteit",
    value: ndov?.nearestDistanceM != null ? `${roundToStep(ndov.nearestDistanceM, 10)} m` : ndov ? "Geen halte < 1 km" : "Geen data",
    score,
    severity: ndov ? scoreSeverity(score!) : "neutral",
    summary,
    action: "Controleer lijnfrequentie, avondritten en de daadwerkelijke looproute vanaf de voordeur.",
    raw: ndov?.nearestDistanceM != null
      ? { value: Math.round(ndov.nearestDistanceM), unit: "m", metric: "afstand tot dichtstbijzijnde NDOV-halte" }
      : undefined,
    confidence: "high",
    spatialScale: "haltecoördinaat",
    evidence: [evidence],
    availability: available ? "available" : "unavailable",
  };
}

export function dsoEvidence(context: DsoContext | null): Evidence {
  return createEvidence({
    id: "dso-onderwerpen",
    source: "DSO Omgevingsdocumenten",
    sourceUrl: dsoOnderwerpenUrl,
    confidence: "medium",
    fetchedAt: context?.fetchedAt,
    spatialResolution: "puntbevraging",
    caveat: "De DSO-bevraging signaleert relevante onderwerpen; controleer de actuele regeling en kaartlagen voor juridische conclusies.",
  });
}

/** More overlapping planning topics slightly lower the future outlook, capped at −3. */
export function futureScoreForTopics(topicCount: number) {
  return clamp(7 - Math.min(3, topicCount / 10));
}

export function futureSignal(input: { dso: DsoContext | null; evidence: Evidence; available: boolean }): Signal {
  const { dso, evidence, available } = input;
  return {
    key: "future",
    label: "Omgevingsontwikkelingen",
    category: "toekomst",
    value: dso ? `${dso.topicCount} onderwerpen` : "Geen data",
    score: dso ? futureScoreForTopics(dso.topicCount) : undefined,
    severity: "neutral",
    summary: dso
      ? `${dso.topicCount} DSO-onderwerp(en) raken deze locatie${dso.topicNames.length ? `, waaronder ${dso.topicNames.join(", ")}` : ""}.`
      : "Er is geen DSO-onderwerpenbevraging beschikbaar.",
    action: "Open de relevante omgevingsdocumenten en controleer status, besluitdatum en kaartbegrenzing voordat je conclusies trekt.",
    confidence: "medium",
    spatialScale: "puntbevraging",
    evidence: [evidence],
    availability: available ? "available" : "unavailable",
  };
}

export function roundDistance(value: number) {
  return round1(value);
}
