import type { Evidence, Signal } from "@/src/lib/types";
import { createEvidence } from "@/src/lib/analysis/evidence";
import { clamp, round1 } from "@/src/lib/math";
import { scoreSeverity } from "@/src/lib/scoring/score";
import { rivmFloodLayer, rivmUrls, type RivmContext } from "@/src/lib/sources/rivm";

export function rivmEvidence(context: RivmContext | null): Evidence {
  return createEvidence({
    id: "rivm-air-noise",
    source: "RIVM geo-services",
    sourceUrl: rivmUrls.noise,
    confidence: "medium",
    fetchedAt: context?.fetchedAt,
    spatialResolution: "RIVM rastercel",
    caveat: "RIVM-waarden zijn model- of rasterwaarden; gevel, verdieping en momentane omstandigheden kunnen afwijken.",
  });
}

export function rivmFloodEvidence(context: RivmContext | null): Evidence {
  return createEvidence({
    id: "rivm-flood",
    source: "RIVM geo-services",
    sourceUrl: `https://data.rivm.nl/geo/alo/wms?request=GetLegendGraphic&format=image/png&layer=${rivmFloodLayer}`,
    confidence: "low",
    fetchedAt: context?.fetchedAt,
    spatialResolution: "landelijke rastercel (Klimaateffectenatlas)",
    caveat: "Modelklasse voor overstroming door falen van primaire keringen. Geeft geen waterdiepte en geen regenwateroverlast; check risicokaart.nl voor het officiële beeld.",
  });
}

/** dB Lden above this floor starts costing score points. */
const NOISE_FLOOR_DB = 35;
const NOISE_DB_PER_POINT = 4;

export function noiseScoreFromLden(noiseLden: number) {
  return clamp(10 - Math.max(0, noiseLden - NOISE_FLOOR_DB) / NOISE_DB_PER_POINT);
}

function formatDb(value: number) {
  return value.toLocaleString("nl-NL", { maximumFractionDigits: 1 });
}

export function noiseSignal(input: { rivm: RivmContext | null; evidence: Evidence; fallback?: Partial<Signal> }): Signal {
  const { rivm, evidence, fallback } = input;
  const hasModelValue = rivm?.noiseLden != null;
  const score = hasModelValue ? noiseScoreFromLden(rivm!.noiseLden!) : undefined;
  return {
    key: "noise",
    label: "Geluidsscreening",
    category: "gezondheid",
    value: hasModelValue ? round1(score!) : (fallback?.value ?? "Geen data"),
    unit: hasModelValue ? "/ 10" : undefined,
    score,
    severity: hasModelValue ? scoreSeverity(score!) : (fallback?.severity ?? "neutral"),
    summary: hasModelValue
      ? `RIVM-modelwaarde voor wegverkeersgeluid is ${formatDb(rivm!.noiseLden!)} dB Lden.`
      : (fallback?.summary ?? "Er is geen geluidsindicatie beschikbaar."),
    action: "Luister tijdens de avondspits met ramen open én dicht; dit is geen officiële geluidmeting.",
    raw: hasModelValue
      ? { value: rivm!.noiseLden!, unit: "dB Lden", metric: "RIVM wegverkeersgeluid" }
      : fallback?.raw,
    confidence: "medium",
    spatialScale: hasModelValue ? "RIVM rastercel" : (fallback?.spatialScale ?? "onbekend"),
    evidence: [evidence],
    availability: hasModelValue || (fallback?.availability != null && fallback.availability !== "unavailable") ? "available" : "unavailable",
  };
}

export function airSignal(input: { rivm: RivmContext | null; evidence: Evidence }): Signal {
  const { rivm, evidence } = input;
  const no2Score = rivm?.no2 != null ? clamp(10 - Math.max(0, rivm.no2 - 10) / 3) : undefined;
  const pm25Score = rivm?.pm25 != null ? clamp(10 - Math.max(0, rivm.pm25 - 5) / 2) : undefined;
  const score = no2Score ?? pm25Score;
  return {
    key: "air",
    label: "Luchtkwaliteit",
    category: "gezondheid",
    value: rivm?.no2 != null
      ? `${formatDb(rivm.no2)} µg/m³ NO₂`
      : rivm?.pm25 != null
        ? `${formatDb(rivm.pm25)} µg/m³ PM₂·₅`
        : "Geen data",
    score,
    severity: score != null ? scoreSeverity(score) : "neutral",
    summary: rivm?.no2 != null
      ? `RIVM rapporteert ${formatDb(rivm.no2)} µg/m³ jaargemiddelde NO₂.`
      : rivm?.pm25 != null
        ? `RIVM rapporteert ${formatDb(rivm.pm25)} µg/m³ PM₂·₅.`
        : "Er is geen RIVM-luchtkwaliteitswaarde beschikbaar.",
    action: "Gebruik de waarde als buurtindicatie; ventilatie, verkeer op straatniveau en binnenlucht bepalen je werkelijke blootstelling.",
    raw: rivm?.no2 != null
      ? { value: rivm.no2, unit: "µg/m³", metric: "RIVM jaargemiddelde NO₂" }
      : rivm?.pm25 != null
        ? { value: rivm.pm25, unit: "µg/m³", metric: "RIVM jaargemiddelde PM₂·₅" }
        : undefined,
    confidence: "medium",
    spatialScale: "RIVM rastercel",
    evidence: [evidence],
    availability: score != null ? "available" : "unavailable",
  };
}

/**
 * Official legend of the RIVM "kans op overstroming" raster, in legend order.
 * The raster returns these as GRAY_INDEX 1–6; the mapping was calibrated
 * against known terrain (Veluwe = 1, IJsselmeer = 6, buitendijks Rotterdam = 2,
 * Verdronken Land van Saeftinghe = 5).
 */
export const FLOOD_RISK_CLASSES: Record<number, { label: string; score: number | null }> = {
  1: { label: "overstroomt niet", score: 9 },
  2: { label: "kans circa 1× per 100.000 jaar", score: 8.5 },
  3: { label: "kans circa 1× per 1.000 jaar", score: 7 },
  4: { label: "kans circa 1× per 100 jaar", score: 5 },
  5: { label: "kans circa 1× per 10 jaar", score: 2.5 },
  // Open water at the address point itself is descriptive, not a risk verdict.
  6: { label: "oppervlaktewater", score: null },
};

export function floodScoreFromClass(floodClass: number) {
  return FLOOD_RISK_CLASSES[floodClass]?.score ?? undefined;
}

export function floodSignal(input: { rivm: RivmContext | null; evidence: Evidence }): Signal {
  const { rivm, evidence } = input;
  const floodClass = rivm?.floodClass;
  const entry = floodClass != null ? FLOOD_RISK_CLASSES[floodClass] : undefined;
  const score = entry?.score ?? undefined;
  return {
    key: "flood",
    label: "Overstromingskans (indicatie)",
    category: "klimaat",
    value: entry?.label ?? "Geen data",
    unit: score != null ? "/ 10" : undefined,
    score,
    severity: score != null ? scoreSeverity(score) : "neutral",
    summary: floodClass != null && entry
      ? `RIVM modelleert voor deze locatie “${entry.label}” bij falen van primaire keringen. Dit is een grove rasterindicatie: geen waterdiepte en geen regenwateroverlast.`
      : "De RIVM-overstromingsrasterwaarde is niet beschikbaar voor dit punt.",
    action: "Bekijk de officiële diepte- en scenariokaarten op Risicokaart.nl en vraag bij de gemeente naar het rioleringsplan bij hevige regen.",
    raw: floodClass != null
      ? { value: floodClass, unit: "klasse", metric: "RIVM kans op overstroming (Klimaateffectenatlas)" }
      : undefined,
    confidence: "low",
    spatialScale: "landelijke rastercel (Klimaateffectenatlas)",
    evidence: [evidence],
    availability: floodClass != null ? "available" : "unavailable",
  };
}
