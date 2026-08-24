import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import type {
  Analysis,
  EverydayInsight,
  Signal,
  SignalCategory,
} from "@/src/lib/types";

export type VerdictTone = "good" | "neutral" | "attention";

export type Verdict = {
  tone: VerdictTone;
  headline: string;
  summary: string;
};

export type TopThing = {
  tone: VerdictTone;
  title: string;
  text: string;
  signalKeys: string[];
};

export type SignalBucket = "attention" | "watch" | "good" | "unavailable";

export type TriagedSignals = {
  attention: Signal[];
  watch: Signal[];
  good: Signal[];
  unavailable: Signal[];
  byDomain: Partial<Record<SignalCategory, Signal[]>>;
};

export function scoreBand(score: number | null | undefined): VerdictTone {
  if (score == null) return "neutral";
  if (score >= 7) return "good";
  if (score >= 5) return "neutral";
  return "attention";
}

export function buildVerdict(analysis: Analysis, locale: Locale = "nl"): Verdict {
  const t = getLibTranslator(locale, "lib-domain");
  const attentionHighlights = (analysis.highlights ?? []).filter(
    (item) => item.type === "attention",
  );
  const scoreTone = scoreBand(analysis.overallScore);
  const tone: VerdictTone =
    attentionHighlights.length >= 2
      ? "attention"
      : attentionHighlights.length === 1 && scoreTone === "good"
        ? "neutral"
        : scoreTone;

  const score = analysis.overallScore.toLocaleString(locale === "en" ? "en-IE" : "nl-NL", { maximumFractionDigits: 1 });
  const headline =
    tone === "good"
      ? t("reportSummary.verdict.good.headline")
      : tone === "attention"
        ? t("reportSummary.verdict.attention.headline")
        : t("reportSummary.verdict.mixed.headline");

  const summary =
    tone === "good"
      ? t("reportSummary.verdict.good.summary", { score, coverage: analysis.dataCoverage.label })
      : tone === "attention"
        ? t("reportSummary.verdict.attention.summary", {
            count: attentionHighlights.length,
            plural: attentionHighlights.length === 1 ? "" : locale === "en" ? "s" : "en",
            score,
          })
        : t("reportSummary.verdict.mixed.summary", { score, coverage: analysis.dataCoverage.label });

  return { tone, headline, summary };
}

function insightToTopThing(insight: EverydayInsight): TopThing {
  return {
    tone: insight.tone === "good" ? "good" : insight.tone === "attention" ? "attention" : "neutral",
    title: insight.title,
    text: insight.summary,
    signalKeys: insight.signalKeys,
  };
}

export function topThings(analysis: Analysis, limit = 3): TopThing[] {
  const seen = new Set<string>();
  const items: TopThing[] = [];

  for (const highlight of analysis.highlights ?? []) {
    if (highlight.type !== "attention") continue;
    const key = `signal:${highlight.signalKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const signal = analysis.signals.find((item) => item.key === highlight.signalKey);
    items.push({
      tone: "attention",
      title: signal?.label ?? highlight.signalKey,
      text: highlight.text,
      signalKeys: [highlight.signalKey],
    });
    if (items.length >= limit) return items;
  }

  for (const insight of analysis.everydayInsights ?? []) {
    const key = `insight:${insight.signalKeys.join("\0")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(insightToTopThing(insight));
    if (items.length >= limit) return items;
  }

  for (const highlight of analysis.highlights ?? []) {
    if (highlight.type !== "positive") continue;
    const key = `signal:${highlight.signalKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const signal = analysis.signals.find((item) => item.key === highlight.signalKey);
    items.push({
      tone: "good",
      title: signal?.label ?? highlight.signalKey,
      text: highlight.text,
      signalKeys: [highlight.signalKey],
    });
    if (items.length >= limit) return items;
  }

  return items;
}

function bucketForSignal(signal: Signal): SignalBucket {
  if (signal.availability === "unavailable") return "unavailable";
  if (signal.severity === "attention") return "attention";
  if (typeof signal.score === "number") {
    if (signal.score >= 7) return "good";
    if (signal.score < 5) return "attention";
    return "watch";
  }
  if (signal.severity === "good") return "good";
  return "watch";
}

function sortByScore(signals: Signal[]) {
  return [...signals].sort((a, b) => {
    const aScore = typeof a.score === "number" ? a.score : 5;
    const bScore = typeof b.score === "number" ? b.score : 5;
    return aScore - bScore;
  });
}

export function triageSignals(signals: Signal[]): TriagedSignals {
  const buckets: TriagedSignals = {
    attention: [],
    watch: [],
    good: [],
    unavailable: [],
    byDomain: {},
  };

  for (const signal of signals) {
    const bucket = bucketForSignal(signal);
    buckets[bucket].push(signal);
    if (signal.category) {
      const list = buckets.byDomain[signal.category] ?? [];
      list.push(signal);
      buckets.byDomain[signal.category] = list;
    }
  }

  buckets.attention = sortByScore(buckets.attention);
  buckets.watch = sortByScore(buckets.watch);
  buckets.good = sortByScore(buckets.good).reverse();
  for (const key of Object.keys(buckets.byDomain) as SignalCategory[]) {
    buckets.byDomain[key] = sortByScore(buckets.byDomain[key] ?? []);
  }

  return buckets;
}
