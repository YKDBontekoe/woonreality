import type { Evidence, Signal } from "@/src/lib/types";
import { createEvidence } from "@/src/lib/analysis/evidence";
import { distanceToGeometryM, geometryAreaM2 } from "@/src/lib/geo/measure";
import { clamp, round1 } from "@/src/lib/math";
import { scoreSeverity } from "@/src/lib/scoring/score";
import { pdokUrls, type BgtContext } from "@/src/lib/sources/pdok/bgt";
import type { Coordinates } from "@/src/lib/types";

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

export function formatDistance(distance: number) {
  if (!Number.isFinite(distance)) return "meer dan 250 m";
  return distance < 1000
    ? `${Math.round(distance / 10) * 10} m`
    : `${(distance / 1000).toFixed(1).replace(".", ",")} km`;
}

export function bgtRoadEvidence(fetchedAt: string): Evidence {
  return createEvidence({
    id: "bgt-roads",
    source: "PDOK / BGT",
    sourceUrl: `${pdokUrls.bgt}collections/wegdeel/items`,
    confidence: "medium",
    fetchedAt,
    spatialResolution: "lokale topografie",
    caveat: "De BGT-proxy zegt iets over lokale wegstructuur, niet over een officiële gevelmeting of verkeersmodel.",
  });
}

export function bgtGreenEvidence(fetchedAt: string): Evidence {
  return createEvidence({
    id: "bgt-green",
    source: "PDOK / BGT",
    sourceUrl: `${pdokUrls.bgt}collections/begroeidterreindeel/items`,
    confidence: "medium",
    fetchedAt,
    spatialResolution: "lokale topografie",
    caveat: "Groenpercentage is een eerste geometrische indicatie binnen circa 250 meter.",
  });
}

export function bgtWaterEvidence(fetchedAt: string): Evidence {
  return createEvidence({
    id: "bgt-water",
    source: "PDOK / BGT",
    sourceUrl: `${pdokUrls.bgt}collections/waterdeel/items`,
    confidence: "medium",
    fetchedAt,
    spatialResolution: "lokale topografie",
    caveat: "Dit is alleen de aanwezigheid van geregistreerd oppervlaktewater, geen overstromings- of wateroverlastmodel.",
  });
}

export function noiseFallbackScore(nearestRoadM: number) {
  return clamp(nearestRoadM === Infinity ? 8 : 8 - Math.max(0, 120 - nearestRoadM) / 25);
}

function noiseFallbackSummary(nearestRoadM: number) {
  return nearestRoadM === Infinity
    ? "Binnen de eerste zoekbuffer is geen BGT-wegdeel gevonden."
    : `Dichtstbijzijnde BGT-wegdeel ligt op ongeveer ${formatDistance(nearestRoadM)}.`;
}

export function greenSignal(input: { metrics: BgtMetrics; evidence: Evidence; bgtAvailable: boolean }): Signal {
  const { metrics, evidence, bgtAvailable } = input;
  const score = clamp(4 + metrics.greenPercent / 8);
  const truncatedNote = metrics.greenTruncated
    ? " Let op: de BGT-bevraging is afgekapt op 100 vlakken; in dicht bebouwd gebied kan het werkelijke groenpercentage hierdoor afwijken."
    : "";
  return {
    key: "green",
    label: "Groen",
    category: "klimaat",
    value: `${Math.round(metrics.greenPercent)}%`,
    score,
    severity: scoreSeverity(score),
    summary: `Ongeveer ${Math.round(metrics.greenPercent)}% van de lokale BGT-oppervlakken is als begroeid terrein geregistreerd.${truncatedNote}`,
    action: "Check bij een bezichtiging ook de boomkroon, privacy en het groen dat je daadwerkelijk vanuit de woning ziet.",
    raw: { value: Math.round(metrics.greenPercent), unit: "%", metric: "BGT-begroeid terrein binnen circa 250 m" },
    confidence: metrics.greenTruncated ? "low" : "medium",
    spatialScale: "circa 250 m zoekbuffer",
    evidence: [evidence],
    availability: bgtAvailable ? "available" : "unavailable",
  };
}

export function heatSignal(input: { metrics: BgtMetrics; evidence: Evidence; bgtAvailable: boolean }): Signal {
  const { metrics, evidence, bgtAvailable } = input;
  const score = clamp(9 - (100 - metrics.greenPercent) / 18);
  const truncatedNote = metrics.greenTruncated
    ? " De BGT-bevraging is afgekapt op 100 vlakken, dus deze proxy is minder betrouwbaar in dicht bebouwd gebied."
    : "";
  return {
    key: "heat",
    label: "Verstening & hitte",
    category: "klimaat",
    value: round1(score),
    unit: "/ 10",
    score,
    severity: scoreSeverity(score),
    summary: `De eerste groen/verharding-proxy komt uit op ${Math.round(metrics.greenPercent)}% groen in de zoekbuffer.${truncatedNote}`,
    action: "Kijk op een hete dag naar schaduw, geveloriëntatie en de hoeveelheid verharding rond tuin en straat.",
    raw: { value: Math.round(100 - metrics.greenPercent), unit: "% verhardingsproxy", metric: "afgeleid uit BGT" },
    confidence: "low",
    spatialScale: "circa 250 m zoekbuffer",
    evidence: [evidence],
    availability: bgtAvailable ? "available" : "unavailable",
  };
}

export function waterSignal(input: { metrics: BgtMetrics; evidence: Evidence; bgtAvailable: boolean }): Signal {
  const { metrics, evidence, bgtAvailable } = input;
  const nearWater = metrics.nearestWaterM < 30;
  return {
    key: "water",
    label: "Oppervlaktewater",
    category: "klimaat",
    value: Number.isFinite(metrics.nearestWaterM) ? formatDistance(metrics.nearestWaterM) : "Geen water gevonden",
    severity: nearWater ? "attention" : Number.isFinite(metrics.nearestWaterM) ? "good" : "neutral",
    summary: nearWater
      ? `BGT registreert oppervlaktewater op circa ${formatDistance(metrics.nearestWaterM)}. Zo dicht op open water is het grondwaterpeil vaak hoger, wat kruipruimte- en funderingsvocht kan beïnvloeden.`
      : Number.isFinite(metrics.nearestWaterM)
        ? `BGT registreert oppervlaktewater op circa ${formatDistance(metrics.nearestWaterM)} (${Math.round(metrics.waterPercent)}% van de zoekbuffer).`
        : "BGT registreert geen oppervlaktewater binnen de zoekbuffer van circa 250 m.",
    action: nearWater
      ? "Vraag naar het grondwaterpeil, de kruipruimte en vochtwering; laat dit meenemen in de bouwkundige keuring."
      : "Dit zegt niets over overstromings- of wateroverlastrisico. Check risicokaart.nl (Overstroming) voor een officiële inschatting.",
    confidence: "low",
    spatialScale: "circa 250 m zoekbuffer",
    evidence: [evidence],
    availability: bgtAvailable ? "available" : "unavailable",
  };
}

export function accessSignal(input: { roadCount: number; truncated: boolean; evidence: Evidence; bgtAvailable: boolean }): Signal {
  const { roadCount, truncated, evidence, bgtAvailable } = input;
  return {
    key: "access",
    label: "Lokale wegstructuur",
    category: "mobiliteit",
    value: `${roadCount} wegdelen`,
    severity: "neutral",
    summary: `${roadCount} BGT-wegdelen zijn in de eerste zoekbuffer aangetroffen; dit beschrijft de straatstructuur, geen bereikbaarheid.${truncated ? " De telling is afgekapt op 100 wegdelen; het werkelijke aantal kan hoger liggen." : ""}`,
    action: "Controleer looproutes, scholen, OV en dagelijkse voorzieningen; deze eerste indicatie meet die niet.",
    confidence: "medium",
    spatialScale: "circa 250 m zoekbuffer",
    evidence: [evidence],
    availability: bgtAvailable ? "available" : "unavailable",
  };
}

export function noiseFallbackParts(input: {
  nearestRoadM: number;
  roadEvidence: Evidence;
  bgtAvailable: boolean;
}): Pick<Signal, "value" | "score" | "severity" | "summary" | "raw" | "spatialScale" | "evidence" | "availability"> {
  const { nearestRoadM, roadEvidence, bgtAvailable } = input;
  const score = noiseFallbackScore(nearestRoadM);
  return {
    value: round1(score),
    score,
    severity: scoreSeverity(score),
    summary: noiseFallbackSummary(nearestRoadM),
    raw: { value: Math.round(nearestRoadM), unit: "m", metric: "afstand tot dichtstbijzijnde BGT-wegdeel" },
    spatialScale: "circa 250 m zoekbuffer",
    evidence: [roadEvidence],
    availability: bgtAvailable ? "available" : "unavailable",
  };
}
