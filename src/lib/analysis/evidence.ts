import type { Confidence, Evidence } from "@/src/lib/types";

export function createEvidence(input: {
  id: string;
  source: string;
  sourceUrl: string;
  sourceRecordId?: string;
  sourceUpdatedAt?: string;
  confidence: Confidence;
  spatialResolution?: string;
  caveat?: string;
  fetchedAt?: string;
}): Evidence {
  return {
    ...input,
    fetchedAt: input.fetchedAt ?? new Date().toISOString(),
  };
}

export function confidenceLabel(confidence: Confidence) {
  return confidence === "high" ? "Hoge zekerheid" : confidence === "medium" ? "Indicatie" : "Beperkte data";
}
