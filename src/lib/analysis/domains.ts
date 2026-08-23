import type { Analysis, DomainSummary, Signal } from "@/src/lib/types";

export const DOMAIN_LABELS = {
  woning: "Woning",
  gezondheid: "Gezondheid & hinder",
  klimaat: "Klimaat & bodem",
  mobiliteit: "Mobiliteit",
  buurt: "Buurt & voorzieningen",
  toekomst: "Toekomst",
} as const;

export type SignalDomain = keyof typeof DOMAIN_LABELS;

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

export function domainSummaries(signals: Signal[]): DomainSummary[] {
  return Object.entries(DOMAIN_LABELS).map(([key, label]) => {
    const domainSignals = signals.filter((signal) => signal.category === key);
    const availableSignals = domainSignals.filter((signal) => isAvailable(signal) && typeof signal.score === "number");
    const hasUnscoredAttention = domainSignals.some(
      (signal) => isAvailable(signal) && typeof signal.score !== "number" && signal.severity === "attention",
    );
    let score = availableSignals.length
      ? Math.round((availableSignals.reduce((sum, signal) => sum + (signal.score ?? 0), 0) / availableSignals.length) * 10) / 10
      : null;
    if (score != null && hasUnscoredAttention) score = Math.min(score, UNSCORED_ATTENTION_SCORE_CAP);
    return {
      key: key as SignalDomain,
      label,
      score,
      signalKeys: domainSignals.map((signal) => signal.key),
      available: availableSignals.length > 0,
      hasUnscoredAttention,
      summary: score == null
        ? "Voor dit domein is nu geen betrouwbare bron beschikbaar."
        : hasUnscoredAttention
          ? `Gemiddelde indicatie ${score.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} / 10 — met een open aandachtspunt zonder score (zie hieronder); laat het cijfer dit niet verbloemen.`
          : `Gemiddelde indicatie ${score.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} / 10.`,
    };
  });
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
