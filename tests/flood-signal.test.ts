import assert from "node:assert/strict";
import test from "node:test";
import { FLOOD_RISK_CLASSES, floodScoreFromClass, floodSignal } from "@/src/lib/analysis/signals/rivm-signals";
import { rivmFloodLayer } from "@/src/lib/sources/rivm";
import type { Evidence } from "@/src/lib/types";

const evidence: Evidence = {
  id: "test",
  source: "Test",
  sourceUrl: "https://example.com",
  fetchedAt: "2026-01-01T00:00:00.000Z",
  confidence: "low",
};

test("flood classes cover the six legend values in official order", () => {
  assert.deepEqual(Object.keys(FLOOD_RISK_CLASSES).map(Number).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
  assert.match(FLOOD_RISK_CLASSES[1].label, /overstroomt niet/);
  assert.match(FLOOD_RISK_CLASSES[6].label, /oppervlaktewater/);
});

test("higher flood frequency lowers the score; open water never scores", () => {
  const scores = [1, 2, 3, 4, 5].map(floodScoreFromClass);
  for (let index = 1; index < scores.length; index += 1) {
    assert.ok(scores[index]! < scores[index - 1]!, `class ${index + 1} must score below class ${index}`);
  }
  assert.equal(floodScoreFromClass(6), undefined);
  assert.equal(floodScoreFromClass(99), undefined);
});

test("flood signal reports the legend label with a score when available", () => {
  const signal = floodSignal({ rivm: { floodClass: 5, fetchedAt: "2026-01-01T00:00:00.000Z" }, evidence });
  assert.equal(signal.key, "flood");
  assert.equal(signal.severity, "attention");
  assert.equal(signal.score, 2.5);
  assert.match(signal.summary, /1× per 10 jaar/);
  assert.equal(signal.availability, "available");
});

test("flood signal degrades to unavailable without raster data", () => {
  const signal = floodSignal({ rivm: null, evidence });
  assert.equal(signal.availability, "unavailable");
  assert.equal(signal.score, undefined);
});

test("flood layer name points at the RIVM klimaateffectenatlas raster", () => {
  assert.equal(rivmFloodLayer, "20231201_kans_overstroming");
});
