import type { Confidence, Evidence } from "@/src/lib/types";
import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";

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

export function confidenceLabel(confidence: Confidence, locale: Locale = "nl") {
  const t = getLibTranslator(locale, "lib-analysis");
  return t(`confidence.${confidence}`);
}
