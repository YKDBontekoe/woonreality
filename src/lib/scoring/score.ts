import type { ScoreComponent, Signal } from "@/src/lib/types";

export const SCORING_VERSION = "2026.08.v1";

const weights: Record<string, number> = {
  noise: 0.25,
  green: 0.2,
  heat: 0.15,
  access: 0.2,
  context: 0.2,
  energy: 0.15,
  air: 0.15,
  "cbs-context": 0.1,
  schools: 0.12,
  crime: 0.12,
  transit: 0.15,
  future: 0.15,
};

export function componentFromSignal(signal: Signal, key: string, label: string, explanation: string): ScoreComponent {
  return {
    key,
    label,
    score: typeof signal.score === "number" ? signal.score : 5,
    weight: weights[key] ?? 0.2,
    confidence: signal.confidence === "high" ? 1 : signal.confidence === "medium" ? 0.7 : 0.4,
    explanation,
    evidenceIds: signal.evidence.map((evidence) => evidence.id),
  };
}

export function calculateOverallScore(components: ScoreComponent[]) {
  const totalWeight = components.reduce((sum, component) => sum + component.weight, 0);
  if (!totalWeight) return 0;
  const score = components.reduce((sum, component) => sum + component.score * component.weight, 0) / totalWeight;
  return Math.round(score * 10) / 10;
}

export function scoreSeverity(score: number) {
  if (score >= 7) return "good" as const;
  if (score >= 5) return "neutral" as const;
  return "attention" as const;
}
