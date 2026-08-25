import type { Analysis, DomainSummary, Signal, SignalCategory } from "@/src/lib/types";
import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import { formatLocaleTag } from "@/src/lib/format-locale";

const DOMAIN_KEYS = ["woning", "gezondheid", "klimaat", "mobiliteit", "buurt", "toekomst"] as const satisfies readonly SignalCategory[];

export type SignalDomain = (typeof DOMAIN_KEYS)[number];

export function domainLabels(locale: Locale = "nl"): Record<SignalDomain, string> {
  const t = getLibTranslator(locale, "lib-analysis");
  return Object.fromEntries(
    DOMAIN_KEYS.map((key) => [key, t(`domain.labels.${key}`)]),
  ) as Record<SignalDomain, string>;
}

function isAvailable(signal: Signal) {
  return signal.availability !== "unavailable";
}

/**
 * A signal such as "fundering" can carry severity "attention" without a
 * numeric score (BAG has no funderingsregistratie). Averaging only the scored
 * signals would silently drop that warning from the domain score — e.g.
 * showing "Woning 9.1/10" while an unresolved foundation flag is open — so
 * the score is capped instead of letting it look clean.
 */
const UNSCORED_ATTENTION_SCORE_CAP = 6.4;

export type DomainSummaryOptions = {
  /** Skip domains without signals (place analyses only surface present categories). */
  skipEmpty?: boolean;
};

/**
 * Single canonical domain-scoring implementation, shared by the property
 * analysis (all six domains) and place dashboards (only present categories).
 */
export function domainSummaries(signals: Signal[], locale: Locale = "nl", options: DomainSummaryOptions = {}): DomainSummary[] {
  const t = getLibTranslator(locale, "lib-analysis");
  const summaries: DomainSummary[] = [];
  for (const key of DOMAIN_KEYS) {
    const domainSignals = signals.filter((signal) => signal.category === key);
    if (options.skipEmpty && !domainSignals.length) continue;
    const availableSignals = domainSignals.filter((signal) => isAvailable(signal) && typeof signal.score === "number");
    const hasUnscoredAttention = domainSignals.some(
      (signal) => isAvailable(signal) && typeof signal.score !== "number" && signal.severity === "attention",
    );
    let score = availableSignals.length
      ? Math.round((availableSignals.reduce((sum, signal) => sum + (signal.score ?? 0), 0) / availableSignals.length) * 10) / 10
      : null;
    if (score != null && hasUnscoredAttention) score = Math.min(score, UNSCORED_ATTENTION_SCORE_CAP);
    const formattedScore = score?.toLocaleString(formatLocaleTag(locale), { maximumFractionDigits: 1 });
    summaries.push({
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
  return summaries;
}

const MAX_HIGHLIGHTS = 3;
/** Score thresholds for the highlight buckets; below 5.5 warns, above 6.5 praises. */
const ATTENTION_BELOW = 5.5;
const POSITIVE_ABOVE = 6.5;

export function analysisHighlights(signals: Signal[]): Analysis["highlights"] {
  const availableSignals = signals.filter(isAvailable);
  // Signals without a numeric score (e.g. "context", "access") must never
  // fall into the attention/positive buckets: defaulting them to a score of
  // 5 previously made plain facts ("107 m² woonoppervlak") show up as
  // "aandachtspunten", crowding out genuine risks.
  const scoredSignals = availableSignals.filter((signal): signal is Signal & { score: number } => typeof signal.score === "number");
  const flaggedUnscored = availableSignals.filter((signal) => typeof signal.score !== "number" && signal.severity === "attention");
  const attention = [
    ...flaggedUnscored.map((signal) => ({ type: "attention" as const, signalKey: signal.key, text: signal.summary })),
    ...scoredSignals
      .filter((signal) => signal.score < ATTENTION_BELOW)
      .sort((a, b) => a.score - b.score)
      .map((signal) => ({ type: "attention" as const, signalKey: signal.key, text: signal.summary })),
  ].slice(0, MAX_HIGHLIGHTS);
  const positives = scoredSignals
    .filter((signal) => signal.score >= POSITIVE_ABOVE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_HIGHLIGHTS)
    .map((signal) => ({ type: "positive" as const, signalKey: signal.key, text: signal.summary }));
  return [...attention, ...positives];
}
