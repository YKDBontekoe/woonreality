import assert from "node:assert/strict";
import test from "node:test";
import { CASE_STAGES } from "../src/lib/journey";
import { JOURNEY_CHECKLIST, journeyChecklistForStage, journeyStageStatus } from "../src/lib/journey-checklist";

test("JOURNEY_CHECKLIST covers every case stage exactly once", () => {
  assert.equal(JOURNEY_CHECKLIST.length, CASE_STAGES.length);
  const stages = JOURNEY_CHECKLIST.map((entry) => entry.stage);
  assert.deepEqual([...stages].sort(), [...CASE_STAGES].sort());
});

test("every stage has at least one concrete checklist item", () => {
  for (const stage of CASE_STAGES) {
    const items = journeyChecklistForStage(stage);
    assert.ok(items.length > 0, `expected items for stage ${stage}`);
  }
});

test("journeyStageStatus classifies stages relative to the current one", () => {
  assert.equal(journeyStageStatus("intake", "offer"), "done");
  assert.equal(journeyStageStatus("offer", "offer"), "current");
  assert.equal(journeyStageStatus("transfer", "offer"), "upcoming");
});
