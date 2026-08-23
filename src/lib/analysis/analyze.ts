import type { Analysis, Evidence, Property, Signal } from "@/src/lib/types";
import { fetchAnalysisContexts, siblingResidentialUnits, type AnalysisContexts } from "@/src/lib/analysis/context";
import {
  accessSignal,
  bgtGreenEvidence,
  bgtMetrics,
  bgtRoadEvidence,
  bgtWaterEvidence,
  greenSignal,
  heatSignal,
  noiseFallbackParts,
  waterSignal,
} from "@/src/lib/analysis/signals/bgt-signals";
import { contextSignal, foundationSignal, identityEvidence, usageSignal, vveSignal } from "@/src/lib/analysis/signals/property-signals";
import { airSignal, floodSignal, noiseScoreFromLden, rivmEvidence, rivmFloodEvidence } from "@/src/lib/analysis/signals/rivm-signals";
import { energyEvidence, energySignal } from "@/src/lib/analysis/signals/energy-signal";
import { dsoEvidence, futureSignal, ndovEvidence, transitSignal } from "@/src/lib/analysis/signals/mobility-signals";
import { bodemEvidence, soilSignal } from "@/src/lib/analysis/signals/soil-signal";
import { sunEvidence, sunSignal } from "@/src/lib/analysis/signals/sun-signal";
import { cbsContextSignal, createCbsEvidence, createCrimeEvidence, createSesEvidence, neighborhoodSignals } from "@/src/lib/analysis/neighborhood-signals";
import { analysisHighlights, domainSummaries } from "@/src/lib/analysis/domains";
import { everydayInsights } from "@/src/lib/analysis/everyday-insights";
import { KNOWN_GAPS, sourceStatuses } from "@/src/lib/analysis/statuses";
import { calculateOverallScore, componentFromSignal, scoreSeverity, SCORING_VERSION } from "@/src/lib/scoring/score";
import { cbsBuurtenUrl } from "@/src/lib/sources/cbs";
import { sesStatLineTableUrl } from "@/src/lib/sources/ses";
import { politieMisdrijvenTableUrl } from "@/src/lib/sources/politie";

const ANALYSIS_VERSION = "2026.08.v2";

/**
 * Signal order is part of the product contract: the dashboard renders this
 * array top-to-bottom. Keep noise → climate → mobility → property → neighborhood.
 */
function buildSignals(contexts: AnalysisContexts, property: Property): Signal[] {
  const identity = identityEvidence(property);
  const siblings = siblingResidentialUnits(contexts, property);
  const bgt = contexts.bgt;
  const bgtAvailable = bgt != null;
  const metrics = bgt ? bgtMetrics(bgt, property.coordinates) : null;

  const roadEvi = bgt ? bgtRoadEvidence(bgt.fetchedAt) : null;
  const greenEvi = bgt ? bgtGreenEvidence(bgt.fetchedAt) : null;
  const waterEvi = bgt ? bgtWaterEvidence(bgt.fetchedAt) : null;
  const rivmEvi = rivmEvidence(contexts.rivm);

  // RIVM model value wins; BGT road distance is the audible fallback proxy.
  const hasRivmNoise = contexts.rivm?.noiseLden != null;
  const fallbackParts = !hasRivmNoise && metrics && roadEvi
    ? noiseFallbackParts({ nearestRoadM: metrics.nearestRoadM, roadEvidence: roadEvi, bgtAvailable })
    : undefined;
  const noiseScore = hasRivmNoise ? noiseScoreFromLden(contexts.rivm!.noiseLden!) : fallbackParts?.score;
  const noiseSignal: Signal = hasRivmNoise
    ? {
      key: "noise",
      label: "Geluidsscreening",
      category: "gezondheid",
      value: Math.round(noiseScore! * 10) / 10,
      unit: "/ 10",
      score: noiseScore,
      severity: scoreSeverity(noiseScore!),
      summary: `RIVM-modelwaarde voor wegverkeersgeluid is ${contexts.rivm!.noiseLden!.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} dB Lden.`,
      action: "Luister tijdens de avondspits met ramen open én dicht; dit is geen officiële geluidmeting.",
      raw: { value: contexts.rivm!.noiseLden!, unit: "dB Lden", metric: "RIVM wegverkeersgeluid" },
      confidence: "medium",
      spatialScale: "RIVM rastercel",
      evidence: [rivmEvi],
      availability: "available",
    }
    : {
      key: "noise",
      label: "Geluidsscreening",
      category: "gezondheid",
      value: fallbackParts?.value ?? "Geen data",
      unit: fallbackParts ? "/ 10" : undefined,
      score: fallbackParts?.score,
      severity: fallbackParts?.severity ?? "neutral",
      summary: fallbackParts?.summary ?? "Binnen de eerste zoekbuffer is geen BGT-wegdeel gevonden.",
      action: "Luister tijdens de avondspits met ramen open én dicht; dit is geen officiële geluidmeting.",
      raw: fallbackParts?.raw,
      confidence: "medium",
      spatialScale: fallbackParts?.spatialScale ?? "circa 250 m zoekbuffer",
      evidence: fallbackParts ? [roadEvi!] : [rivmEvi],
      availability: fallbackParts?.availability ?? "unavailable",
    };

  return [
    noiseSignal,
    ...(metrics && greenEvi ? [greenSignal({ metrics, evidence: greenEvi, bgtAvailable })] : []),
    ...(metrics && greenEvi ? [heatSignal({ metrics, evidence: greenEvi, bgtAvailable })] : []),
    ...(metrics && waterEvi ? [waterSignal({ metrics, evidence: waterEvi, bgtAvailable })] : []),
    floodSignal({ rivm: contexts.rivm, evidence: rivmFloodEvidence(contexts.rivm) }),
    sunSignal({ bgt, property, evidence: sunEvidence(contexts.bgt?.fetchedAt), bgtAvailable }),
    ...buildSoilSignals(contexts),
    ...(metrics && roadEvi
      ? [accessSignal({ roadCount: bgt!.roads.length, truncated: metrics.roadsTruncated, evidence: roadEvi, bgtAvailable })]
      : []),
    contextSignal({ property, evidence: identity }),
    usageSignal({ property, evidence: identity }),
    vveSignal({ siblings, evidence: identity, nearbyAvailable: contexts.nearbyAvailable }),
    foundationSignal({ property, evidence: identity }),
    energySignal({
      energyLabel: contexts.energyLabel,
      evidence: energyEvidence({ bagVboId: property.bagVboId, labelUpdatedAt: contexts.energyRegistratedAt }),
      energyAvailable: contexts.energyLabel != null,
    }),
    airSignal({ rivm: contexts.rivm, evidence: rivmEvi }),
    cbsContextSignal({ cbs: contexts.cbs, cbsEvidence: createCbsEvidence(contexts.cbs, cbsBuurtenUrl) }),
    ...neighborhoodSignals({
      cbs: contexts.cbs,
      ses: contexts.ses,
      crime: contexts.crime,
      cbsEvidence: createCbsEvidence(contexts.cbs, cbsBuurtenUrl),
      sesEvidence: createSesEvidence(contexts.ses, sesStatLineTableUrl),
      crimeEvidence: createCrimeEvidence(contexts.crime, politieMisdrijvenTableUrl),
    }),
    transitSignal({ ndov: contexts.ndov, evidence: ndovEvidence(contexts.ndov), available: contexts.ndov != null }),
    futureSignal({ dso: contexts.dso, evidence: dsoEvidence(contexts.dso), available: contexts.dso != null }),
  ];
}

/** A bodem hit list only exists when the WFS sweep returned matches. */
function buildSoilSignals(contexts: AnalysisContexts): Signal[] {
  if (!contexts.bodem || contexts.bodem.totalMatches <= 0) return [];
  const signal = soilSignal({ bodem: contexts.bodem, evidence: bodemEvidence(contexts.bodem) });
  return signal ? [signal] : [];
}

/**
 * Evidence mirrors the original insertion order; the report UI groups by
 * position within each source family, so keep BAG first and WFS last.
 */
function collectEvidence(contexts: AnalysisContexts, property: Property): Evidence[] {
  const bgt = contexts.bgt;
  const energyAvailable = contexts.energyLabel != null;
  const rivmMetricCount = [contexts.rivm?.noiseLden, contexts.rivm?.no2, contexts.rivm?.pm25, contexts.rivm?.floodClass].filter((value) => value != null).length;
  return [
    identityEvidence(property),
    ...(bgt ? [bgtRoadEvidence(bgt.fetchedAt)] : []),
    ...(bgt ? [bgtGreenEvidence(bgt.fetchedAt)] : []),
    ...(energyAvailable ? [energyEvidence({ bagVboId: property.bagVboId, labelUpdatedAt: contexts.energyRegistratedAt })] : []),
    ...(rivmMetricCount > 0 ? [rivmEvidence(contexts.rivm)] : []),
    ...(contexts.cbs ? [createCbsEvidence(contexts.cbs, cbsBuurtenUrl)] : []),
    ...(contexts.rivm?.floodClass != null ? [rivmFloodEvidence(contexts.rivm)] : []),
    ...(contexts.ses ? [createSesEvidence(contexts.ses, sesStatLineTableUrl)] : []),
    ...(contexts.crime ? [createCrimeEvidence(contexts.crime, politieMisdrijvenTableUrl)] : []),
    ...(contexts.ndov ? [ndovEvidence(contexts.ndov)] : []),
    ...(contexts.dso ? [dsoEvidence(contexts.dso)] : []),
    ...(contexts.bodem && contexts.bodem.totalMatches > 0 ? [bodemEvidence(contexts.bodem)] : []),
  ];
}

export async function analyzeProperty(property: Property): Promise<Analysis> {
  const contexts = await fetchAnalysisContexts(property);
  const signals = buildSignals(contexts, property);

  // Only signals with an actual score contribute. Descriptive context, such as
  // BGT road segments, remains useful to show but must not imply a score.
  const components = signals
    .filter((signal) => signal.availability !== "unavailable" && typeof signal.score === "number")
    .map((signal) => componentFromSignal(signal, signal.key, signal.label, signal.summary));
  const domains = domainSummaries(signals);
  const availableDomainCount = domains.filter((domain) => domain.available).length;

  return {
    property,
    overallScore: calculateOverallScore(components),
    analysisVersion: ANALYSIS_VERSION,
    scoringVersion: SCORING_VERSION,
    signals,
    components,
    evidence: collectEvidence(contexts, property),
    generatedAt: new Date().toISOString(),
    sources: analysisSources(contexts),
    domains,
    everydayInsights: everydayInsights(signals),
    highlights: analysisHighlights(signals),
    dataCoverage: {
      available: availableDomainCount,
      total: domains.length,
      label: `${availableDomainCount} van ${domains.length} onderwerpen beschikbaar`,
    },
    sourceStatuses: sourceStatuses(contexts),
    knownGaps: KNOWN_GAPS,
    nearbyProperties: contexts.nearbyProperties,
    wozBenchmark: contexts.wozBenchmark,
  };
}

function analysisSources(contexts: AnalysisContexts): string[] {
  const bgtAvailable = contexts.bgt != null;
  const energyAvailable = contexts.energyLabel != null;
  const rivmMetricCount = [contexts.rivm?.noiseLden, contexts.rivm?.no2, contexts.rivm?.pm25, contexts.rivm?.floodClass].filter((value) => value != null).length;
  return [
    "PDOK Location API",
    "PDOK BAG",
    ...(bgtAvailable ? ["PDOK BGT"] : []),
    ...(energyAvailable ? ["EP-Online / RVO"] : []),
    ...(rivmMetricCount > 0 ? ["RIVM geo-services"] : []),
    ...(contexts.cbs ? ["CBS Wijk- en Buurtkaart"] : []),
    ...(contexts.ses ? ["CBS SES-WOA"] : []),
    ...(contexts.crime ? ["Politie / CBS misdrijven"] : []),
    ...(contexts.ndov ? ["NDOV haltes"] : []),
    ...(contexts.dso ? ["DSO Omgevingsdocumenten"] : []),
    ...(contexts.bodem ? ["Lokale bodemregisters (WFS)"] : []),
  ];
}
