import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import { NL_CRIME_PER_1000 } from "@/src/lib/sources/politie";
import { scoreSeverity } from "@/src/lib/scoring/score";
import type { DomainSummary, Severity, Signal } from "@/src/lib/types";

export type InterpretationVerdict = "good" | "neutral" | "attention";

export type SignalBenchmarkMarker = {
  label: string;
  position: number;
  kind: "you" | "reference" | "secondary";
};

export type SignalBenchmark = {
  referenceLabel: string;
  referenceValue: number;
  secondaryReferenceLabel?: string;
  secondaryReferenceValue?: number;
  value: number;
  unit?: string;
  position: number;
  direction: "lower-is-better" | "higher-is-better" | "center-is-typical";
  markers: SignalBenchmarkMarker[];
  precision?: number;
};

export type SignalInterpretation = {
  verdict: InterpretationVerdict;
  label: string;
  explainer: string;
  benchmark?: SignalBenchmark;
};

type Translator = ReturnType<typeof getLibTranslator>;

const WHO_NO2 = 10;
const EU_NO2 = 40;
const WHO_PM25 = 5;
const EU_PM25 = 10;
const NOISE_QUIET = 55;
const NOISE_AVERAGE = 65;
const NOISE_LOUD = 70;
const SES_TYPICAL = 0.5;

const numberTag = (locale: Locale) => (locale === "en" ? "en-IE" : "nl-NL");

function buildBenchmark(input: {
  referenceLabel: string;
  referenceValue: number;
  value: number;
  unit?: string;
  min: number;
  max: number;
  direction: SignalBenchmark["direction"];
  secondary?: { label: string; value: number };
  precision?: number;
  youLabel: string;
}): SignalBenchmark {
  const position = clampPosition(input.value, input.min, input.max);
  return {
    referenceLabel: input.referenceLabel,
    referenceValue: input.referenceValue,
    secondaryReferenceLabel: input.secondary?.label,
    secondaryReferenceValue: input.secondary?.value,
    value: input.value,
    unit: input.unit,
    position,
    direction: input.direction,
    precision: input.precision,
    markers: benchmarkMarkers(
      position,
      input.youLabel,
      input.referenceLabel,
      input.referenceValue,
      input.min,
      input.max,
      input.secondary,
    ),
  };
}

function clampPosition(value: number, min: number, max: number) {
  if (max <= min) return 50;
  return Math.round(Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)));
}

function benchmarkMarkers(
  position: number,
  youLabel: string,
  referenceLabel: string,
  referenceValue: number,
  scaleMin: number,
  scaleMax: number,
  secondary?: { label: string; value: number },
): SignalBenchmarkMarker[] {
  const markers: SignalBenchmarkMarker[] = [
    { label: youLabel, position, kind: "you" },
    {
      label: referenceLabel,
      position: clampPosition(referenceValue, scaleMin, scaleMax),
      kind: "reference",
    },
  ];
  if (secondary) {
    markers.push({
      label: secondary.label,
      position: clampPosition(secondary.value, scaleMin, scaleMax),
      kind: "secondary",
    });
  }
  return markers;
}

function numericRaw(signal: Signal): number | null {
  if (signal.raw?.value != null && typeof signal.raw.value === "number") return signal.raw.value;
  if (typeof signal.value === "number") return signal.value;
  return null;
}

function scoreLabel(score: number, t: Translator): { verdict: InterpretationVerdict; label: string } {
  const severity = scoreSeverity(score);
  if (severity === "good") return { verdict: "good", label: t("signalInterpretation.scoreLabels.good") };
  if (severity === "attention") return { verdict: "attention", label: t("signalInterpretation.scoreLabels.attention") };
  return { verdict: "neutral", label: t("signalInterpretation.scoreLabels.neutral") };
}

function distanceKmFromSignal(signal: Signal): number | null {
  if (typeof signal.value === "string" && /km/i.test(signal.value)) {
    const parsed = Number.parseFloat(signal.value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  const value = numericRaw(signal);
  if (value == null) return null;
  const unit = signal.raw?.unit ?? signal.unit;
  if (unit === "km") return value;
  if (unit === "m") return value / 1000;
  return null;
}

function mentionsNo2(text: string) {
  return /NO\u2082|\bNO2\b/i.test(text);
}

function distanceLabel(km: number, t: Translator): { verdict: InterpretationVerdict; label: string; explainer: string } {
  if (km <= 0.5) {
    return {
      verdict: "good",
      label: t("signalInterpretation.distance.near.label"),
      explainer: t("signalInterpretation.distance.near.explainer"),
    };
  }
  if (km <= 1) {
    return {
      verdict: "neutral",
      label: t("signalInterpretation.distance.reachable.label"),
      explainer: t("signalInterpretation.distance.reachable.explainer"),
    };
  }
  if (km <= 2) {
    return {
      verdict: "neutral",
      label: t("signalInterpretation.distance.farther.label"),
      explainer: t("signalInterpretation.distance.farther.explainer"),
    };
  }
  return {
    verdict: "attention",
    label: t("signalInterpretation.distance.far.label"),
    explainer: t("signalInterpretation.distance.far.explainer"),
  };
}

function interpretAir(signal: Signal, t: Translator, locale: Locale): SignalInterpretation | null {
  const metric = signal.raw?.metric ?? "";
  const value = numericRaw(signal);
  if (value == null) return null;

  const isNo2 = mentionsNo2(metric) || mentionsNo2(String(signal.value));
  const whoLimit = isNo2 ? WHO_NO2 : WHO_PM25;
  const euLimit = isNo2 ? EU_NO2 : EU_PM25;
  const pollutant = isNo2 ? t("signalInterpretation.air.pollutantNo2") : t("signalInterpretation.air.pollutantPm25");

  let verdict: InterpretationVerdict = "neutral";
  let label = t("signalInterpretation.air.labels.neutral");
  if (value <= whoLimit) {
    verdict = "good";
    label = t("signalInterpretation.air.labels.good");
  } else if (value >= euLimit) {
    verdict = "attention";
    label = t("signalInterpretation.air.labels.aboveEu");
  } else if (value > whoLimit * 1.5) {
    verdict = "attention";
    label = t("signalInterpretation.air.labels.aboveWho");
  }

  return {
    verdict,
    label,
    explainer: t("signalInterpretation.air.explainer", { value: value.toLocaleString(numberTag(locale), { maximumFractionDigits: 1 }), pollutant }),
    benchmark: buildBenchmark({
      referenceLabel: t("signalInterpretation.benchmarks.who"),
      referenceValue: whoLimit,
      value,
      unit: "µg/m³",
      min: 0,
      max: euLimit * 1.2,
      direction: "lower-is-better",
      secondary: isNo2 ? { label: t("signalInterpretation.benchmarks.eu"), value: euLimit } : undefined,
      youLabel: t("signalInterpretation.youMarker"),
    }),
  };
}

function interpretNoise(signal: Signal, t: Translator, locale: Locale): SignalInterpretation | null {
  const value = numericRaw(signal);
  if (value == null) return null;

  let verdict: InterpretationVerdict = "neutral";
  let label = t("signalInterpretation.noise.labels.neutral");
  if (value <= NOISE_QUIET) {
    verdict = "good";
    label = t("signalInterpretation.noise.labels.good");
  } else if (value >= NOISE_LOUD) {
    verdict = "attention";
    label = t("signalInterpretation.noise.labels.loud");
  } else if (value >= NOISE_AVERAGE) {
    verdict = "attention";
    label = t("signalInterpretation.noise.labels.busy");
  }

  return {
    verdict,
    label,
    explainer: t("signalInterpretation.noise.explainer", { value: value.toLocaleString(numberTag(locale), { maximumFractionDigits: 1 }) }),
    benchmark: buildBenchmark({
      referenceLabel: t("signalInterpretation.benchmarks.quiet"),
      referenceValue: NOISE_QUIET,
      value,
      unit: "dB",
      min: 45,
      max: 80,
      direction: "lower-is-better",
      secondary: { label: t("signalInterpretation.benchmarks.loud"), value: NOISE_LOUD },
      youLabel: t("signalInterpretation.youMarker"),
    }),
  };
}

function interpretCrime(signal: Signal, t: Translator, locale: Locale): SignalInterpretation | null {
  const value = numericRaw(signal);
  if (value == null) return null;

  const ratio = value / NL_CRIME_PER_1000;
  let verdict: InterpretationVerdict = "neutral";
  let label = t("signalInterpretation.crime.labels.neutral");
  if (ratio <= 0.85) {
    verdict = "good";
    label = t("signalInterpretation.crime.labels.good");
  } else if (ratio >= 1.15) {
    verdict = "attention";
    label = t("signalInterpretation.crime.labels.attention");
  }

  return {
    verdict,
    label,
    explainer: t("signalInterpretation.crime.explainer", {
      value: value.toLocaleString(numberTag(locale), { maximumFractionDigits: 1 }),
      average: String(NL_CRIME_PER_1000),
    }),
    benchmark: buildBenchmark({
      referenceLabel: t("signalInterpretation.benchmarks.nlAverage"),
      referenceValue: NL_CRIME_PER_1000,
      value,
      unit: t("signalInterpretation.crime.unit"),
      min: 0,
      max: NL_CRIME_PER_1000 * 2,
      direction: "lower-is-better",
      youLabel: t("signalInterpretation.youMarker"),
    }),
  };
}

function interpretSes(signal: Signal, t: Translator, locale: Locale): SignalInterpretation | null {
  const value = numericRaw(signal);
  if (value == null) return null;

  const verdict: InterpretationVerdict = "neutral";
  let label = t("signalInterpretation.ses.labels.neutral");
  if (value <= -SES_TYPICAL) {
    label = t("signalInterpretation.ses.labels.below");
  } else if (value >= SES_TYPICAL) {
    label = t("signalInterpretation.ses.labels.above");
  }

  return {
    verdict,
    label,
    explainer: t("signalInterpretation.ses.explainer", {
      value: value.toLocaleString(numberTag(locale), { signDisplay: "exceptZero", maximumFractionDigits: 3 }),
    }),
    benchmark: buildBenchmark({
      referenceLabel: t("signalInterpretation.benchmarks.nlZero"),
      referenceValue: 0,
      value,
      unit: "SES-WOA",
      min: -1,
      max: 1,
      direction: "center-is-typical",
      precision: 3,
      youLabel: t("signalInterpretation.youMarker"),
    }),
  };
}

function interpretDistanceSignal(signal: Signal, noun: string, t: Translator): SignalInterpretation | null {
  const km = distanceKmFromSignal(signal);
  if (km == null) return null;
  const { verdict, label, explainer } = distanceLabel(km, t);
  return {
    verdict,
    label,
    explainer: t("signalInterpretation.distanceSuffix", { noun, explainer }),
    benchmark: buildBenchmark({
      referenceLabel: t("signalInterpretation.benchmarks.oneKm"),
      referenceValue: 1,
      value: km,
      unit: "km",
      min: 0,
      max: 3,
      direction: "lower-is-better",
      youLabel: t("signalInterpretation.youMarker"),
    }),
  };
}

function interpretScored(signal: Signal, t: Translator, locale: Locale): SignalInterpretation {
  if (typeof signal.score !== "number") {
    if (signal.severity === "attention") {
      return {
        verdict: "attention",
        label: t("signalInterpretation.selfCheck.label"),
        explainer: signal.action,
      };
    }
    return {
      verdict: "neutral",
      label: t("signalInterpretation.informational.label"),
      explainer: signal.summary,
    };
  }

  const { verdict, label } = scoreLabel(signal.score, t);
  return {
    verdict,
    label,
    explainer: t("signalInterpretation.scoredExplainer", {
      label,
      score: signal.score.toLocaleString(numberTag(locale), { maximumFractionDigits: 1 }),
      summary: signal.summary,
    }),
    benchmark: buildBenchmark({
      referenceLabel: t("signalInterpretation.benchmarks.middle"),
      referenceValue: 5,
      value: signal.score,
      unit: "/ 10",
      min: 0,
      max: 10,
      direction: "higher-is-better",
      youLabel: t("signalInterpretation.youMarker"),
    }),
  };
}

export function interpretSignal(signal: Signal, locale: Locale = "nl"): SignalInterpretation | null {
  const t = getLibTranslator(locale, "lib-domain");
  if (signal.availability === "unavailable") {
    return {
      verdict: "neutral",
      label: t("signalInterpretation.unavailable.label"),
      explainer: t("signalInterpretation.unavailable.explainer"),
    };
  }

  switch (signal.key) {
    case "air":
      return interpretAir(signal, t, locale);
    case "noise":
      return interpretNoise(signal, t, locale);
    case "crime":
      return interpretCrime(signal, t, locale);
    case "ses":
      return interpretSes(signal, t, locale);
    case "transit":
      return interpretDistanceSignal(signal, t("signalInterpretation.transitNoun"), t) ?? interpretScored(signal, t, locale);
    case "cbs-context":
    case "schools":
      return interpretDistanceSignal(signal, signal.label, t) ?? interpretScored(signal, t, locale);
    case "foundation":
    case "vve":
    case "usage":
      if (signal.severity === "attention") {
        return {
          verdict: "attention",
          label: t("signalInterpretation.selfCheck.label"),
          explainer: signal.action,
        };
      }
      return interpretScored(signal, t, locale);
    default:
      return interpretScored(signal, t, locale);
  }
}

export function interpretationToneFromVerdict(verdict: InterpretationVerdict): Severity {
  if (verdict === "good") return "good";
  if (verdict === "attention") return "attention";
  return "neutral";
}

export function interpretationForDomain(
  domain: DomainSummary,
  signals: Signal[],
  locale: Locale = "nl",
): string {
  const t = getLibTranslator(locale, "lib-domain");
  const domainSignals = signals.filter(
    (signal) => signal.category === domain.key && signal.availability !== "unavailable",
  );
  if (!domainSignals.length) return t("signalInterpretation.domainEmpty");

  const labels = domainSignals
    .map((signal) => interpretSignal(signal, locale))
    .filter((item): item is SignalInterpretation => Boolean(item))
    .slice(0, 2)
    .map((item) => item.label.toLowerCase());

  if (!labels.length) {
    return domain.summary;
  }

  return `${domain.label}: ${labels.join(", ")}.`;
}

export const SIGNAL_BENCHMARKS = {
  WHO_NO2,
  EU_NO2,
  WHO_PM25,
  EU_PM25,
  NL_CRIME_PER_1000,
  NOISE_QUIET,
  NOISE_AVERAGE,
  NOISE_LOUD,
} as const;
