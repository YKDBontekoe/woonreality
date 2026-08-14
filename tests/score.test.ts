import assert from "node:assert/strict";
import test from "node:test";
import { calculateOverallScore, componentFromSignal, scoreSeverity } from "@/src/lib/scoring/score";
import type { Signal } from "@/src/lib/types";

const signal: Signal = {
  key: "green",
  label: "Groen",
  value: "25%",
  score: 8.4,
  severity: "good",
  summary: "Een testindicatie.",
  action: "Controleer de omgeving.",
  confidence: "medium",
  evidence: [{
    id: "evidence-1",
    source: "Testbron",
    sourceUrl: "https://example.com/source",
    fetchedAt: "2026-01-01T00:00:00.000Z",
    confidence: "medium",
  }],
};

test("calculateOverallScore returns a weighted, one-decimal score", () => {
  const components = [
    { key: "noise", label: "Geluid", score: 8, weight: 0.25, confidence: 1, explanation: "", evidenceIds: [] },
    { key: "green", label: "Groen", score: 6, weight: 0.75, confidence: 1, explanation: "", evidenceIds: [] },
  ];

  assert.equal(calculateOverallScore(components), 6.5);
  assert.equal(calculateOverallScore([]), 0);
});

test("componentFromSignal preserves signal evidence and maps confidence", () => {
  const component = componentFromSignal(signal, "green", "Groen", "A test explanation.");

  assert.deepEqual(component, {
    key: "green",
    label: "Groen",
    score: 8.4,
    weight: 0.2,
    confidence: 0.7,
    explanation: "A test explanation.",
    evidenceIds: ["evidence-1"],
  });
});

test("scoreSeverity uses stable score bands", () => {
  assert.equal(scoreSeverity(7), "good");
  assert.equal(scoreSeverity(5), "neutral");
  assert.equal(scoreSeverity(4.9), "attention");
});
