import type { Evidence, Signal } from "@/src/lib/types";
import { createEvidence } from "@/src/lib/analysis/evidence";
import { createSignal } from "@/src/lib/analysis/signals/create-signal";
import { epOnlineUrl } from "@/src/lib/sources/ep-online";
import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";

export function energyEvidence(input: { bagVboId: string; labelUpdatedAt?: string }, locale: Locale = "nl"): Evidence {
  const t = getLibTranslator(locale, "lib-analysis");
  return createEvidence({
    id: "ep-online-energy",
    source: "EP-Online / RVO",
    sourceUrl: epOnlineUrl,
    sourceRecordId: input.bagVboId,
    sourceUpdatedAt: input.labelUpdatedAt,
    confidence: "high",
    spatialResolution: "BAG-verblijfsobject",
    caveat: t("energy.caveat"),
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

export function energySignal(input: { energyLabel: string | null; evidence: Evidence; energyAvailable: boolean }, locale: Locale = "nl"): Signal {
  const { energyLabel, evidence, energyAvailable } = input;
  const t = getLibTranslator(locale, "lib-analysis");
  const score = energyLabel ? energyScore(energyLabel) : undefined;
  return createSignal({
    key: "energy",
    label: t("energy.label"),
    category: "woning",
    value: energyLabel ?? t("common.noData"),
    score,
    summary: energyLabel ? t("energy.summaryFound", { label: energyLabel }) : t("energy.summaryMissing"),
    action: t("energy.action"),
    confidence: "high",
    spatialScale: "BAG-verblijfsobject",
    available: energyAvailable,
    evidence,
  });
}
