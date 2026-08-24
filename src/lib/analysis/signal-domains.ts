import type { DomainSummary, Signal, SignalCategory } from "@/src/lib/types";
import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";

/** Stable category identifiers; display labels come from the lib-analysis catalog. */
export const signalCategoryLabels = {
  woning: "woning",
  gezondheid: "gezondheid",
  klimaat: "klimaat",
  mobiliteit: "mobiliteit",
  buurt: "buurt",
  toekomst: "toekomst",
} as const satisfies Record<SignalCategory, string>;

export function signalCategoryLabel(category: SignalCategory, locale: Locale = "nl"): string {
  return getLibTranslator(locale, "lib-analysis")(`domain.labels.${category}`);
}

export function domainsFromSignals(signals: Signal[], locale: Locale = "nl"): DomainSummary[] {
  const t = getLibTranslator(locale, "lib-analysis");
  const domains: DomainSummary[] = [];
  for (const [key] of Object.entries(signalCategoryLabels) as [SignalCategory, string][]) {
    const domainSignals = signals.filter((signal) => signal.category === key);
    if (!domainSignals.length) continue;
    const availableSignals = domainSignals.filter((signal) => signal.availability !== "unavailable" && typeof signal.score === "number");
    const hasUnscoredAttention = domainSignals.some((signal) => signal.availability !== "unavailable" && typeof signal.score !== "number" && signal.severity === "attention");
    let score = availableSignals.length
      ? Math.round((availableSignals.reduce((sum, signal) => sum + (signal.score ?? 0), 0) / availableSignals.length) * 10) / 10
      : null;
    if (score != null && hasUnscoredAttention) score = Math.min(score, 6.4);
    const formattedScore = score?.toLocaleString(locale === "en" ? "en-IE" : "nl-NL", { maximumFractionDigits: 1 });
    domains.push({
      key,
      label: t(`domain.labels.${key}`),
      score,
      signalKeys: domainSignals.map((signal) => signal.key),
      available: availableSignals.length > 0,
      hasUnscoredAttention,
      summary: score == null
        ? t("domain.summary.unavailable")
        : hasUnscoredAttention
          ? t("domain.summary.attention", { score: formattedScore })
          : t("domain.summary.plain", { score: formattedScore }),
    });
  }
  return domains;
}
