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

const WHO_NO2 = 10;
const EU_NO2 = 40;
const WHO_PM25 = 5;
const EU_PM25 = 10;
const NOISE_QUIET = 55;
const NOISE_AVERAGE = 65;
const NOISE_LOUD = 70;
const SES_TYPICAL = 0.5;

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
  referenceLabel: string,
  referenceValue: number,
  scaleMin: number,
  scaleMax: number,
  secondary?: { label: string; value: number },
): SignalBenchmarkMarker[] {
  const markers: SignalBenchmarkMarker[] = [
    { label: "Jij", position, kind: "you" },
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

function scoreLabel(score: number): { verdict: InterpretationVerdict; label: string } {
  const severity = scoreSeverity(score);
  if (severity === "good") return { verdict: "good", label: "Sterk" };
  if (severity === "attention") return { verdict: "attention", label: "Aandacht" };
  return { verdict: "neutral", label: "Gemiddeld" };
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

function distanceLabel(km: number): { verdict: InterpretationVerdict; label: string; explainer: string } {
  if (km <= 0.5) {
    return {
      verdict: "good",
      label: "Dichtbij",
      explainer: "Op loop- of fietsafstand — vaak goed bereikbaar in het dagelijks leven.",
    };
  }
  if (km <= 1) {
    return {
      verdict: "neutral",
      label: "Redelijk bereikbaar",
      explainer: "Binnen ongeveer een kilometer — meestal nog met de fiets of een korte rit.",
    };
  }
  if (km <= 2) {
    return {
      verdict: "neutral",
      label: "Verder weg",
      explainer: "Meer dan een kilometer — plan bewust hoe je er dagelijks komt.",
    };
  }
  return {
    verdict: "attention",
    label: "Ver",
    explainer: "Relatief ver voor dagelijks gebruik — check of dat bij jouw leven past.",
  };
}

function interpretAir(signal: Signal): SignalInterpretation | null {
  const metric = signal.raw?.metric ?? "";
  const value = numericRaw(signal);
  if (value == null) return null;

  const isNo2 = mentionsNo2(metric) || mentionsNo2(String(signal.value));
  const whoLimit = isNo2 ? WHO_NO2 : WHO_PM25;
  const euLimit = isNo2 ? EU_NO2 : EU_PM25;
  const pollutant = isNo2 ? "stikstofdioxide (NO₂)" : "fijnstof (PM₂·₅)";

  let verdict: InterpretationVerdict = "neutral";
  let label = "Gemiddeld voor NL";
  if (value <= whoLimit) {
    verdict = "good";
    label = "Onder WHO-richtlijn";
  } else if (value >= euLimit) {
    verdict = "attention";
    label = "Boven EU-jaarlimiet";
  } else if (value > whoLimit * 1.5) {
    verdict = "attention";
    label = "Boven WHO-richtlijn";
  }

  return {
    verdict,
    label,
    explainer: `${value.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} µg/m³ ${pollutant} is een buurtgemiddelde uit RIVM-data — lager is gezonder, maar ventilatie en verkeer op straatniveau tellen ook mee.`,
    benchmark: buildBenchmark({
      referenceLabel: "WHO",
      referenceValue: whoLimit,
      value,
      unit: "µg/m³",
      min: 0,
      max: euLimit * 1.2,
      direction: "lower-is-better",
      secondary: isNo2 ? { label: "EU", value: euLimit } : undefined,
    }),
  };
}

function interpretNoise(signal: Signal): SignalInterpretation | null {
  const value = numericRaw(signal);
  if (value == null) return null;

  let verdict: InterpretationVerdict = "neutral";
  let label = "Gemiddeld stadsniveau";
  if (value <= NOISE_QUIET) {
    verdict = "good";
    label = "Relatief rustig";
  } else if (value >= NOISE_LOUD) {
    verdict = "attention";
    label = "Relatief luid";
  } else if (value >= NOISE_AVERAGE) {
    verdict = "attention";
    label = "Drukker straatniveau";
  }

  return {
    verdict,
    label,
    explainer: `${value.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} dB Lden is een modelwaarde voor wegverkeersgeluid — luister tijdens de bezichtiging met open ramen op verschillende tijdstippen.`,
    benchmark: buildBenchmark({
      referenceLabel: "Rustig",
      referenceValue: NOISE_QUIET,
      value,
      unit: "dB",
      min: 45,
      max: 80,
      direction: "lower-is-better",
      secondary: { label: "Luid", value: NOISE_LOUD },
    }),
  };
}

function interpretCrime(signal: Signal): SignalInterpretation | null {
  const value = numericRaw(signal);
  if (value == null) return null;

  const ratio = value / NL_CRIME_PER_1000;
  let verdict: InterpretationVerdict = "neutral";
  let label = "Rond NL-gemiddelde";
  if (ratio <= 0.85) {
    verdict = "good";
    label = "Lager dan NL-gemiddelde";
  } else if (ratio >= 1.15) {
    verdict = "attention";
    label = "Hoger dan NL-gemiddelde";
  }

  return {
    verdict,
    label,
    explainer: `${value.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} geregistreerde misdrijven per 1.000 inwoners — landelijk gemiddelde circa ${NL_CRIME_PER_1000}. Alleen politiecijfers, geen voorspelling voor jouw woning.`,
    benchmark: buildBenchmark({
      referenceLabel: "NL gem.",
      referenceValue: NL_CRIME_PER_1000,
      value,
      unit: "per 1.000",
      min: 0,
      max: NL_CRIME_PER_1000 * 2,
      direction: "lower-is-better",
    }),
  };
}

function interpretSes(signal: Signal): SignalInterpretation | null {
  const value = numericRaw(signal);
  if (value == null) return null;

  const verdict: InterpretationVerdict = "neutral";
  let label = "Rond NL-gemiddelde";
  if (value <= -SES_TYPICAL) {
    label = "Onder NL-gemiddelde";
  } else if (value >= SES_TYPICAL) {
    label = "Boven NL-gemiddelde";
  }

  return {
    verdict,
    label,
    explainer: `SES-WOA ${value.toLocaleString("nl-NL", { signDisplay: "exceptZero", maximumFractionDigits: 3 })} — Nederland ≈ 0. Dit is buurtcontext over welvaart, opleiding en werk, geen oordeel over de woning of je buren.`,
    benchmark: buildBenchmark({
      referenceLabel: "NL ≈ 0",
      referenceValue: 0,
      value,
      unit: "SES-WOA",
      min: -1,
      max: 1,
      direction: "center-is-typical",
      precision: 3,
    }),
  };
}

function interpretDistanceSignal(signal: Signal, noun: string): SignalInterpretation | null {
  const km = distanceKmFromSignal(signal);
  if (km == null) return null;
  const { verdict, label, explainer } = distanceLabel(km);
  return {
    verdict,
    label,
    explainer: `${noun}: ${explainer} CBS geeft buurtgemiddelden, geen exacte looproute vanaf de voordeur.`,
    benchmark: buildBenchmark({
      referenceLabel: "1 km",
      referenceValue: 1,
      value: km,
      unit: "km",
      min: 0,
      max: 3,
      direction: "lower-is-better",
    }),
  };
}

function interpretScored(signal: Signal): SignalInterpretation {
  if (typeof signal.score !== "number") {
    if (signal.severity === "attention") {
      return {
        verdict: "attention",
        label: "Check dit zelf",
        explainer: signal.action,
      };
    }
    return {
      verdict: "neutral",
      label: "Informatief",
      explainer: signal.summary,
    };
  }

  const { verdict, label } = scoreLabel(signal.score);
  return {
    verdict,
    label,
    explainer: `${label} op onze 0–10 schaal (${signal.score.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}). ${signal.summary}`,
    benchmark: buildBenchmark({
      referenceLabel: "Midden",
      referenceValue: 5,
      value: signal.score,
      unit: "/ 10",
      min: 0,
      max: 10,
      direction: "higher-is-better",
    }),
  };
}

export function interpretSignal(signal: Signal): SignalInterpretation | null {
  if (signal.availability === "unavailable") {
    return {
      verdict: "neutral",
      label: "Geen data",
      explainer: "Voor dit onderwerp is nu geen betrouwbare open-data bron beschikbaar.",
    };
  }

  switch (signal.key) {
    case "air":
      return interpretAir(signal);
    case "noise":
      return interpretNoise(signal);
    case "crime":
      return interpretCrime(signal);
    case "ses":
      return interpretSes(signal);
    case "transit":
      return interpretDistanceSignal(
        signal,
        "Afstand tot OV-halte",
      ) ?? interpretScored(signal);
    case "cbs-context":
    case "schools":
      return interpretDistanceSignal(signal, signal.label) ?? interpretScored(signal);
    case "foundation":
    case "vve":
    case "usage":
      if (signal.severity === "attention") {
        return {
          verdict: "attention",
          label: "Check dit zelf",
          explainer: signal.action,
        };
      }
      return interpretScored(signal);
    default:
      return interpretScored(signal);
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
): string {
  const domainSignals = signals.filter(
    (signal) => signal.category === domain.key && signal.availability !== "unavailable",
  );
  if (!domainSignals.length) return "Geen betrouwbare data voor dit onderwerp.";

  const labels = domainSignals
    .map((signal) => interpretSignal(signal))
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
