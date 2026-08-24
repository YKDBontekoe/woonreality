import type { EverydayInsight, Signal } from "@/src/lib/types";
import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";

const ATTENTION_BELOW = 5.5;
const GOOD_ABOVE = 6.5;
const DEFAULT_FALLBACK_SCORE = 5;

function findSignal(signals: Signal[], key: string) {
  return signals.find((item) => item.key === key && item.availability !== "unavailable");
}

function scoreOf(signals: Signal[], key: string) {
  return findSignal(signals, key)?.score;
}

/** Attention is driven by noise alone; a green score alone can lift the tone to "good". */
function streetTone(noise: number | undefined, green: number | undefined): EverydayInsight["tone"] {
  if ((noise ?? DEFAULT_FALLBACK_SCORE) < ATTENTION_BELOW) return "attention";
  if ((green ?? DEFAULT_FALLBACK_SCORE) >= GOOD_ABOVE) return "good";
  return "neutral";
}

/** Both comfort scores must be above the bar for "good"; either one below warns. */
function combinedTone(...scores: (number | undefined)[]): EverydayInsight["tone"] {
  const effective = scores.map((score) => score ?? DEFAULT_FALLBACK_SCORE);
  if (effective.some((score) => score < ATTENTION_BELOW)) return "attention";
  if (effective.every((score) => score >= GOOD_ABOVE)) return "good";
  return "neutral";
}

export function everydayInsights(signals: Signal[], locale: Locale = "nl"): EverydayInsight[] {
  const t = getLibTranslator(locale, "lib-analysis");
  const insights: EverydayInsight[] = [];

  const noise = scoreOf(signals, "noise");
  const green = scoreOf(signals, "green");
  if (noise != null || green != null) {
    const tone = streetTone(noise, green);
    insights.push({
      title: t("everyday.street.title"),
      summary: tone === "attention"
        ? t("everyday.street.attention")
        : tone === "good"
          ? t("everyday.street.good")
          : t("everyday.street.neutral"),
      tone,
      signalKeys: ["noise", "green"].filter((key) => Boolean(findSignal(signals, key))),
    });
  }

  const energy = scoreOf(signals, "energy");
  const heat = scoreOf(signals, "heat");
  if (energy != null || heat != null) {
    const tone = combinedTone(energy, heat);
    insights.push({
      title: t("everyday.comfort.title"),
      summary: (energy ?? DEFAULT_FALLBACK_SCORE) < ATTENTION_BELOW
        ? t("everyday.comfort.energyAttention")
        : (heat ?? DEFAULT_FALLBACK_SCORE) < ATTENTION_BELOW
          ? t("everyday.comfort.heatAttention")
          : t("everyday.comfort.neutral"),
      tone,
      signalKeys: ["energy", "heat"].filter((key) => Boolean(findSignal(signals, key))),
    });
  }

  const sun = scoreOf(signals, "sun");
  if (sun != null || heat != null) {
    const tone = combinedTone(sun, heat);
    insights.push({
      title: t("everyday.light.title"),
      summary: tone === "attention"
        ? t("everyday.light.attention")
        : tone === "good"
          ? t("everyday.light.good")
          : t("everyday.light.neutral"),
      tone,
      signalKeys: ["sun", "heat"].filter((key) => Boolean(findSignal(signals, key))),
    });
  }

  const transit = scoreOf(signals, "transit");
  const access = scoreOf(signals, "access");
  if (transit != null || access != null) {
    // Access carries no numeric score by design; both default to 5 here.
    const lowestScore = Math.min(transit ?? DEFAULT_FALLBACK_SCORE, access ?? DEFAULT_FALLBACK_SCORE);
    const tone: EverydayInsight["tone"] = lowestScore >= GOOD_ABOVE ? "good" : lowestScore < ATTENTION_BELOW ? "attention" : "neutral";
    insights.push({
      title: t("everyday.route.title"),
      summary: tone === "good"
        ? t("everyday.route.good")
        : t("everyday.route.neutral"),
      tone,
      signalKeys: ["transit", "access"].filter((key) => Boolean(findSignal(signals, key))),
    });
  }

  if (findSignal(signals, "schools") || findSignal(signals, "children")) {
    const school = scoreOf(signals, "schools");
    const tone: EverydayInsight["tone"] = school != null && school < ATTENTION_BELOW
      ? "attention"
      : school != null && school >= GOOD_ABOVE
        ? "good"
        : "neutral";
    insights.push({
      title: t("everyday.family.title"),
      summary: tone === "good"
        ? t("everyday.family.good")
        : tone === "attention"
          ? t("everyday.family.attention")
          : t("everyday.family.neutral"),
      tone,
      signalKeys: ["schools", "children"].filter((key) => Boolean(findSignal(signals, key))),
    });
  }

  return insights;
}
