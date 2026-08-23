import type { Evidence, Signal } from "@/src/lib/types";
import { createEvidence } from "@/src/lib/analysis/evidence";
import { scoreSeverity } from "@/src/lib/scoring/score";
import { epOnlineUrl } from "@/src/lib/sources/ep-online";

export function energyEvidence(input: { bagVboId: string; labelUpdatedAt?: string }): Evidence {
  return createEvidence({
    id: "ep-online-energy",
    source: "EP-Online / RVO",
    sourceUrl: epOnlineUrl,
    sourceRecordId: input.bagVboId,
    sourceUpdatedAt: input.labelUpdatedAt,
    confidence: "high",
    spatialResolution: "BAG-verblijfsobject",
    caveat: "Een energielabel zegt niets over de actuele staat of het werkelijke verbruik van de woning.",
  });
}

export function energyScore(label: string) {
  const normalized = label.toUpperCase().replace("PLUS", "+");
  if (normalized.startsWith("A++++")) return 10;
  if (normalized.startsWith("A+++")) return 9.7;
  if (normalized.startsWith("A++")) return 9.4;
  if (normalized.startsWith("A+")) return 9.1;
  if (normalized.startsWith("A")) return 8.7;
  if (normalized.startsWith("B")) return 7.6;
  if (normalized.startsWith("C")) return 6.5;
  if (normalized.startsWith("D")) return 5.4;
  if (normalized.startsWith("E")) return 4.3;
  if (normalized.startsWith("F")) return 3.2;
  return 2;
}

export function energySignal(input: { energyLabel: string | null; evidence: Evidence; energyAvailable: boolean }): Signal {
  const { energyLabel, evidence, energyAvailable } = input;
  const score = energyLabel ? energyScore(energyLabel) : undefined;
  return {
    key: "energy",
    label: "Energielabel",
    category: "woning",
    value: energyLabel ?? "Geen data",
    score,
    severity: energyLabel ? scoreSeverity(score!) : "neutral",
    summary: energyLabel ? `Geregistreerd energielabel ${energyLabel}.` : "Er is geen energielabel beschikbaar in deze analyse.",
    action: "Vraag naar de originele labelstukken en recente verbeteringen aan isolatie, glas en installaties.",
    confidence: "high",
    spatialScale: "BAG-verblijfsobject",
    availability: energyAvailable ? "available" : "unavailable",
    evidence: [evidence],
  };
}
