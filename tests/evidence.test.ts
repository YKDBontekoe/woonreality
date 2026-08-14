import assert from "node:assert/strict";
import test from "node:test";
import { confidenceLabel, createEvidence } from "@/src/lib/analysis/evidence";

test("createEvidence adds a fetch timestamp without changing supplied metadata", () => {
  const evidence = createEvidence({
    id: "bag-123",
    source: "PDOK / BAG",
    sourceUrl: "https://example.com/bag",
    confidence: "high",
    fetchedAt: "2026-01-01T00:00:00.000Z",
  });

  assert.equal(evidence.fetchedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(evidence.source, "PDOK / BAG");
});

test("confidenceLabel stays user-facing and localized", () => {
  assert.equal(confidenceLabel("high"), "Hoge zekerheid");
  assert.equal(confidenceLabel("medium"), "Indicatie");
  assert.equal(confidenceLabel("low"), "Beperkte data");
});
