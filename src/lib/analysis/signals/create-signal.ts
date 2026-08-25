import type { Confidence, Evidence, Severity, Signal, SignalCategory } from "@/src/lib/types";
import { scoreSeverity } from "@/src/lib/scoring/score";

export type CreateSignalInput = {
  key: string;
  label: string;
  category?: SignalCategory;
  value: number | string;
  unit?: string;
  score?: number;
  /**
   * Overrides the derived severity. Without a score the default is "neutral";
   * with one it comes from scoreSeverity().
   */
  severity?: Severity;
  summary: string;
  action: string;
  raw?: Signal["raw"];
  confidence: Confidence;
  measuredAt?: string;
  spatialScale?: string;
  /**
   * Overrides the derived availability. By default a signal is available iff
   * it carries a numeric score; context-driven signals (e.g. BGT-backed)
   * pass this explicitly so data absence is disclosed, not hidden.
   */
  available?: boolean;
  evidence: Evidence | Evidence[];
};

/**
 * Factory for the Signal contract. Centralizes the invariants previously
 * repeated as ternaries in every builder literal: severity derives from the
 * score unless stated otherwise, availability derives from scored presence
 * unless the source context dictates otherwise, and single evidence objects
 * are normalized into arrays.
 */
export function createSignal(input: CreateSignalInput): Signal {
  const score = typeof input.score === "number" && Number.isFinite(input.score) ? input.score : undefined;
  const evidence = Array.isArray(input.evidence) ? input.evidence : [input.evidence];
  const signal: Signal = {
    key: input.key,
    label: input.label,
    value: input.value,
    score,
    severity: input.severity ?? (score != null ? scoreSeverity(score) : "neutral"),
    summary: input.summary,
    action: input.action,
    confidence: input.confidence,
    evidence,
    availability: (input.available ?? score != null) ? "available" : "unavailable",
  };
  if (input.category !== undefined) signal.category = input.category;
  if (input.unit !== undefined) signal.unit = input.unit;
  if (input.raw !== undefined) signal.raw = input.raw;
  if (input.measuredAt !== undefined) signal.measuredAt = input.measuredAt;
  if (input.spatialScale !== undefined) signal.spatialScale = input.spatialScale;
  return signal;
}
