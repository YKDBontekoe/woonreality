import type { DomainSummary, Signal, SignalCategory } from "@/src/lib/types";

export const signalCategoryLabels = {
  woning: "Woning",
  gezondheid: "Gezondheid & hinder",
  klimaat: "Klimaat & bodem",
  mobiliteit: "Mobiliteit",
  buurt: "Buurt & voorzieningen",
  toekomst: "Toekomst",
} as const satisfies Record<SignalCategory, string>;

export function domainsFromSignals(signals: Signal[]): DomainSummary[] {
  const domains: DomainSummary[] = [];
  for (const [key, label] of Object.entries(signalCategoryLabels) as [SignalCategory, string][]) {
    const domainSignals = signals.filter((signal) => signal.category === key);
    if (!domainSignals.length) continue;
    const availableSignals = domainSignals.filter((signal) => signal.availability !== "unavailable" && typeof signal.score === "number");
    const hasUnscoredAttention = domainSignals.some((signal) => signal.availability !== "unavailable" && typeof signal.score !== "number" && signal.severity === "attention");
    let score = availableSignals.length
      ? Math.round((availableSignals.reduce((sum, signal) => sum + (signal.score ?? 0), 0) / availableSignals.length) * 10) / 10
      : null;
    if (score != null && hasUnscoredAttention) score = Math.min(score, 6.4);
    domains.push({
      key,
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
    });
  }
  return domains;
}
