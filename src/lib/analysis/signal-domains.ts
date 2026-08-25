import type { DomainSummary, Signal, SignalCategory } from "@/src/lib/types";
import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import { domainSummaries } from "@/src/lib/analysis/domains";

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

/**
 * Place variant of the canonical domain scoring in `domains.ts`: only
 * categories actually present on the place are surfaced.
 */
export function domainsFromSignals(signals: Signal[], locale: Locale = "nl"): DomainSummary[] {
  return domainSummaries(signals, locale, { skipEmpty: true });
}
