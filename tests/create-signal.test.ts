import assert from "node:assert/strict";
import { test } from "node:test";
import { createSignal } from "@/src/lib/analysis/signals/create-signal";
import type { Evidence } from "@/src/lib/types";

const evidence: Evidence = {
  id: "test",
  source: "Test",
  sourceUrl: "https://example.com",
  confidence: "medium",
  fetchedAt: "2026-01-01T00:00:00Z",
};

test("createSignal derives severity from score and availability from scored presence", () => {
  const scored = createSignal({
    key: "air", label: "Lucht", value: 8.1, score: 8.1,
    summary: "s", action: "a", confidence: "medium", evidence,
  });
  assert.equal(scored.severity, "good");
  assert.equal(scored.availability, "available");
  assert.deepEqual(scored.evidence, [evidence]);

  const unscored = createSignal({
    key: "water", label: "Water", value: "geen data",
    summary: "s", action: "a", confidence: "low", evidence,
  });
  assert.equal(unscored.severity, "neutral");
  assert.equal(unscored.availability, "unavailable");
});

test("createSignal honors explicit severity and context-driven availability overrides", () => {
  const signal = createSignal({
    key: "soil", label: "Bodem", value: "zand",
    severity: "attention", available: false,
    summary: "s", action: "a", confidence: "high", evidence,
  });
  assert.equal(signal.severity, "attention");
  assert.equal(signal.availability, "unavailable");
});

test("createSignal omits optional fields when undefined and ignores non-finite scores", () => {
  const signal = createSignal({
    key: "x", label: "X", value: 1,
    summary: "s", action: "a", confidence: "low", evidence,
    score: Number.NaN, unit: undefined, raw: undefined,
  });
  assert.equal(signal.score, undefined);
  assert.equal("unit" in signal, false);
  assert.equal("raw" in signal, false);
  assert.equal("category" in signal, false);
});
