import type { Signal, WozBenchmark } from "@/src/lib/types";
import { wozRatio } from "@/src/lib/types";
import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";

export type CompositeTone = "good" | "neutral" | "attention";

/**
 * A composite fuses two or more scored signals into one story that no single
 * signal tells on its own. Deterministic, evidence-linked via signalKeys,
 * and never feeds back into the Reality Score.
 */
export type CompositeStory = {
  key: "wintercomfort" | "health" | "runningCosts" | "valueContext";
  tone: CompositeTone;
  title: string;
  summary: string;
  signalKeys: string[];
};

/**
 * Two data points that point in opposite directions. These are negotiation
 * ammunition or due-diligence prompts, never score changes.
 */
export type ContradictionFlag = {
  key: "oldHouseHighLabel" | "priceAboveArea" | "priceBelowArea" | "noisePremium";
  severity: "low" | "medium" | "high";
  title: string;
  summary: string;
  action: string;
  signalKeys: string[];
};

const ATTENTION_BELOW = 5.5;
const GOOD_ABOVE = 6.5;

function findSignal(signals: Signal[], key: string) {
  return signals.find((item) => item.key === key && item.availability !== "unavailable");
}

function scoreOf(signals: Signal[], key: string) {
  return findSignal(signals, key)?.score;
}

function present(signals: Signal[], keys: string[]) {
  return keys.filter((key) => Boolean(findSignal(signals, key)));
}

function combinedTone(scores: (number | undefined)[]): CompositeTone {
  const effective = scores.map((score) => score ?? 5);
  if (effective.some((score) => score < ATTENTION_BELOW)) return "attention";
  if (effective.every((score) => score >= GOOD_ABOVE)) return "good";
  return "neutral";
}

function wintercomfort(signals: Signal[], locale: Locale): CompositeStory | null {
  const t = getLibTranslator(locale, "lib-analysis");
  const sun = scoreOf(signals, "sun");
  const energy = scoreOf(signals, "energy");
  // Isolation claims need an actual energy score; sun alone is not enough.
  const keys = present(signals, ["sun", "energy"]);
  if (sun == null || energy == null) return null;
  const tone = combinedTone([sun, energy]);
  return {
    key: "wintercomfort",
    tone,
    title: t("composite.wintercomfort.title"),
    summary:
      sun >= GOOD_ABOVE && energy < ATTENTION_BELOW
        ? t("composite.wintercomfort.sunGoodEnergyBad")
        : sun < ATTENTION_BELOW && energy >= GOOD_ABOVE
          ? t("composite.wintercomfort.energyGoodSunBad")
          : tone === "good"
            ? t("composite.wintercomfort.good")
            : tone === "attention"
              ? t("composite.wintercomfort.attention")
              : t("composite.wintercomfort.neutral"),
    signalKeys: keys,
  };
}

function health(signals: Signal[], locale: Locale): CompositeStory | null {
  const t = getLibTranslator(locale, "lib-analysis");
  const air = scoreOf(signals, "air");
  const noise = scoreOf(signals, "noise");
  const green = scoreOf(signals, "green");
  const keys = present(signals, ["air", "noise", "green"]);
  if (!air && !noise && !green) return null;
  const tone = combinedTone([air, noise, green]);
  return {
    key: "health",
    tone,
    title: t("composite.health.title"),
    summary:
      noise != null && noise < ATTENTION_BELOW
        ? t("composite.health.noiseAttention")
        : air != null && air < ATTENTION_BELOW
          ? t("composite.health.airAttention")
          : tone === "attention"
            ? t("composite.health.attention")
            : tone === "good"
              ? t("composite.health.good")
              : t("composite.health.neutral"),
    signalKeys: keys,
  };
}

function runningCosts(signals: Signal[], locale: Locale): CompositeStory | null {
  const t = getLibTranslator(locale, "lib-analysis");
  const energy = scoreOf(signals, "energy");
  const heat = scoreOf(signals, "heat");
  const keys = present(signals, ["energy", "heat"]);
  if (energy == null) return null;
  const tone = combinedTone([energy, heat]);
  return {
    key: "runningCosts",
    tone,
    title: t("composite.runningCosts.title"),
    summary:
      energy < ATTENTION_BELOW
        ? t("composite.runningCosts.improve", { label: String(findSignal(signals, "energy")?.value ?? "") })
        : heat != null && heat < ATTENTION_BELOW
          ? t("composite.runningCosts.heatAttention")
          : tone === "good"
            ? t("composite.runningCosts.good")
            : t("composite.runningCosts.neutral"),
    signalKeys: keys,
  };
}

function valueContext(
  signals: Signal[],
  askingPrice: number | undefined,
  wozBenchmark: WozBenchmark | null | undefined,
  attentionCount: number,
  locale: Locale,
): { story: CompositeStory | null; contradictions: ContradictionFlag[] } {
  const t = getLibTranslator(locale, "lib-analysis");
  const ratio = askingPrice && wozBenchmark ? wozRatio(askingPrice, wozBenchmark.buurtAverage) : null;
  const keys = present(signals, ["noise", "energy"]);
  const story: CompositeStory | null = ratio == null
    ? null
    : {
      key: "valueContext",
      tone: ratio >= 1.2 ? "attention" : ratio <= 0.9 ? "neutral" : "neutral",
      title: t("composite.valueContext.title"),
      summary:
        ratio >= 1.2
          ? t("composite.valueContext.above", { pct: Math.round((ratio - 1) * 100) })
          : ratio <= 0.9
            ? t("composite.valueContext.below", { pct: Math.round((1 - ratio) * 100) })
            : t("composite.valueContext.around"),
      signalKeys: keys,
    };

  const contradictions: ContradictionFlag[] = [];
  if (ratio != null && ratio >= 1.15 && attentionCount >= 2) {
    contradictions.push({
      key: "priceAboveArea",
      severity: "high",
      title: t("contradiction.priceAboveArea.title"),
      summary: t("contradiction.priceAboveArea.summary", { pct: Math.round((ratio - 1) * 100), count: attentionCount }),
      action: t("contradiction.priceAboveArea.action"),
      signalKeys: keys,
    });
  }
  if (ratio != null && ratio <= 0.85) {
    contradictions.push({
      key: "priceBelowArea",
      severity: "medium",
      title: t("contradiction.priceBelowArea.title"),
      summary: t("contradiction.priceBelowArea.summary", { pct: Math.round((1 - ratio) * 100) }),
      action: t("contradiction.priceBelowArea.action"),
      signalKeys: keys,
    });
  }
  return { story, contradictions };
}

function oldHouseHighLabel(
  signals: Signal[],
  buildingYear: number | undefined,
  locale: Locale,
): ContradictionFlag | null {
  const t = getLibTranslator(locale, "lib-analysis");
  const energy = findSignal(signals, "energy");
  if (!energy || buildingYear == null || buildingYear >= 1945) return null;
  const label = String(energy.value).toUpperCase();
  if (!(label.startsWith("A") || label.startsWith("B"))) return null;
  return {
    key: "oldHouseHighLabel",
    severity: "medium",
    title: t("contradiction.oldHouseHighLabel.title", { year: buildingYear }),
    summary: t("contradiction.oldHouseHighLabel.summary", { label }),
    action: t("contradiction.oldHouseHighLabel.action"),
    signalKeys: ["energy", "foundation"].filter((key) => Boolean(findSignal(signals, key))),
  };
}

function noisePremium(
  signals: Signal[],
  askingPrice: number | undefined,
  wozBenchmark: WozBenchmark | null | undefined,
  locale: Locale,
): ContradictionFlag | null {
  const t = getLibTranslator(locale, "lib-analysis");
  const noise = scoreOf(signals, "noise");
  const ratio = askingPrice && wozBenchmark ? wozRatio(askingPrice, wozBenchmark.buurtAverage) : null;
  if (noise == null || ratio == null) return null;
  if (noise >= ATTENTION_BELOW || ratio < 1.05) return null;
  return {
    key: "noisePremium",
    severity: "high",
    title: t("contradiction.noisePremium.title"),
    summary: t("contradiction.noisePremium.summary", { pct: Math.round((ratio - 1) * 100) }),
    action: t("contradiction.noisePremium.action"),
    signalKeys: ["noise"],
  };
}

export function insightComposites(
  input: {
    signals: Signal[];
    buildingYear?: number | null;
    askingPrice?: number | null;
    wozBenchmark?: WozBenchmark | null;
  },
  locale: Locale = "nl",
): { stories: CompositeStory[]; contradictions: ContradictionFlag[] } {
  const { signals, buildingYear, askingPrice, wozBenchmark } = input;
  const attentionCount = signals.filter(
    (signal) => signal.severity === "attention" && signal.availability !== "unavailable",
  ).length;

  const { story: valueStory, contradictions: valueContradictions } = valueContext(
    signals,
    askingPrice ?? undefined,
    wozBenchmark,
    attentionCount,
    locale,
  );

  const stories = [
    wintercomfort(signals, locale),
    health(signals, locale),
    runningCosts(signals, locale),
    valueStory,
  ].filter((story): story is CompositeStory => story != null);

  const contradictions = [
    ...valueContradictions,
    oldHouseHighLabel(signals, buildingYear ?? undefined, locale),
    noisePremium(signals, askingPrice ?? undefined, wozBenchmark, locale),
  ].filter((flag): flag is ContradictionFlag => flag != null);

  return { stories, contradictions };
}
