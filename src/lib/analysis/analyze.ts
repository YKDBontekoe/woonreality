import type { Analysis, Evidence, Property, Signal } from "@/src/lib/types";
import { getBgtContext, pdokUrls } from "@/src/lib/sources/pdok/bgt";
import { createEvidence } from "@/src/lib/analysis/evidence";
import { distanceToGeometryM, geometryAreaM2 } from "@/src/lib/geo/measure";
import { calculateOverallScore, componentFromSignal, SCORING_VERSION, scoreSeverity } from "@/src/lib/scoring/score";

const ANALYSIS_VERSION = "2026.08.v0";

function clamp(value: number, min = 0, max = 10) {
  return Math.min(max, Math.max(min, value));
}

function formatDistance(distance: number) {
  if (!Number.isFinite(distance)) return "meer dan 250 m";
  return distance < 1000 ? `${Math.round(distance / 10) * 10} m` : `${(distance / 1000).toFixed(1).replace(".", ",")} km`;
}

function identityEvidence(property: Property): Evidence {
  return createEvidence({
    id: `bag-${property.bagVboId}`,
    source: "PDOK / BAG",
    sourceUrl: pdokUrls.bag,
    sourceRecordId: property.bagVboId,
    confidence: "high",
    spatialResolution: "BAG-object",
    caveat: "BAG is de objectidentiteit; een adreslabel kan in de tijd wijzigen.",
  });
}

export async function analyzeProperty(property: Property): Promise<Analysis> {
  const bgt = await getBgtContext(property.coordinates);
  const origin = property.coordinates;
  const greenAreaM2 = bgt.greenAreas.reduce((sum, feature) => sum + geometryAreaM2(feature.geometry, origin), 0);
  const searchAreaM2 = Math.PI * 250 ** 2;
  const greenPercent = clamp((greenAreaM2 / searchAreaM2) * 100, 0, 100);
  const nearestRoadM = bgt.roads.length
    ? Math.min(...bgt.roads.map((feature) => distanceToGeometryM(origin, feature.geometry)))
    : Number.POSITIVE_INFINITY;

  const identity = identityEvidence(property);
  const bgtRoadEvidence = createEvidence({
    id: "bgt-roads",
    source: "PDOK / BGT",
    sourceUrl: `${pdokUrls.bgt}collections/wegdeel/items`,
    confidence: "medium",
    spatialResolution: "lokale topografie",
    caveat: "De BGT-proxy zegt iets over lokale wegstructuur, niet over een officiële gevelmeting of verkeersmodel.",
  });
  const bgtGreenEvidence = createEvidence({
    id: "bgt-green",
    source: "PDOK / BGT",
    sourceUrl: `${pdokUrls.bgt}collections/begroeidterreindeel/items`,
    confidence: "medium",
    spatialResolution: "lokale topografie",
    caveat: "Groenpercentage is een eerste geometrische indicatie binnen circa 250 meter.",
  });

  const noiseScore = clamp(nearestRoadM === Infinity ? 8 : 8 - Math.max(0, 120 - nearestRoadM) / 25);
  const greenScore = clamp(4 + greenPercent / 8);
  const heatScore = clamp(9 - (100 - greenPercent) / 18);
  const accessScore = clamp(5.5 + Math.min(2.5, bgt.roads.length / 8));
  const contextScore = clamp(property.buildingYear ? 6.5 + (property.buildingYear >= 2000 ? 1 : 0) : 6);

  const signals: Signal[] = [
    {
      key: "noise",
      label: "Geluidsscreening",
      value: Math.round((noiseScore * 10) / 10),
      unit: "/ 10",
      score: noiseScore,
      severity: scoreSeverity(noiseScore),
      summary: nearestRoadM === Infinity
        ? "Binnen de eerste zoekbuffer is geen BGT-wegdeel gevonden."
        : `Dichtstbijzijnde BGT-wegdeel ligt op ongeveer ${formatDistance(nearestRoadM)}.`,
      action: "Luister tijdens de avondspits met ramen open én dicht; dit is geen officiële geluidmeting.",
      raw: { value: Math.round(nearestRoadM), unit: "m", metric: "afstand tot dichtstbijzijnde BGT-wegdeel" },
      confidence: "medium",
      evidence: [bgtRoadEvidence],
    },
    {
      key: "green",
      label: "Groen",
      value: `${Math.round(greenPercent)}%`,
      score: greenScore,
      severity: scoreSeverity(greenScore),
      summary: `Ongeveer ${Math.round(greenPercent)}% van de lokale BGT-oppervlakken is als begroeid terrein geregistreerd.`,
      action: "Check bij een bezichtiging ook de boomkroon, privacy en het groen dat je daadwerkelijk vanuit de woning ziet.",
      raw: { value: Math.round(greenPercent), unit: "%", metric: "BGT-begroeid terrein binnen circa 250 m" },
      confidence: "medium",
      evidence: [bgtGreenEvidence],
    },
    {
      key: "heat",
      label: "Verstening & hitte",
      value: Math.round(heatScore * 10) / 10,
      unit: "/ 10",
      score: heatScore,
      severity: scoreSeverity(heatScore),
      summary: `De eerste groen/verharding-proxy komt uit op ${Math.round(greenPercent)}% groen in de zoekbuffer.`,
      action: "Kijk op een hete dag naar schaduw, geveloriëntatie en de hoeveelheid verharding rond tuin en straat.",
      raw: { value: Math.round(100 - greenPercent), unit: "% verhardingsproxy", metric: "afgeleid uit BGT" },
      confidence: "low",
      evidence: [bgtGreenEvidence],
    },
    {
      key: "access",
      label: "Lokale bereikbaarheid",
      value: `${bgt.roads.length} wegdelen`,
      score: accessScore,
      severity: scoreSeverity(accessScore),
      summary: `${bgt.roads.length} BGT-wegdelen zijn in de eerste zoekbuffer aangetroffen.`,
      action: "De volgende slice voegt looproutes, scholen, OV en dagelijkse voorzieningen toe.",
      confidence: "medium",
      evidence: [bgtRoadEvidence],
    },
    {
      key: "context",
      label: "BAG-context",
      value: property.buildingYear ? String(property.buildingYear) : "bekend",
      unit: property.buildingYear ? "bouwjaar" : undefined,
      score: contextScore,
      severity: "neutral",
      summary: property.areaM2
        ? `BAG koppelt dit adres aan een verblijfsobject van ${property.areaM2} m².`
        : "BAG koppelt dit adres aan een verblijfsobject.",
      action: "Gebruik dit als startpunt; een bouwkundige keuring blijft nodig voor de staat van het gebouw.",
      confidence: "high",
      evidence: [identity],
    },
  ];

  const components = signals.map((signal) => componentFromSignal(
    signal,
    signal.key,
    signal.label,
    signal.summary,
  ));
  const evidence = [identity, bgtRoadEvidence, bgtGreenEvidence];

  return {
    property,
    overallScore: calculateOverallScore(components),
    analysisVersion: ANALYSIS_VERSION,
    scoringVersion: SCORING_VERSION,
    signals,
    components,
    evidence,
    generatedAt: new Date().toISOString(),
    sources: ["PDOK Location API", "PDOK BAG", "PDOK BGT"],
  };
}
