import assert from "node:assert/strict";
import test from "node:test";
import { CASE_STAGES } from "../src/lib/journey";
import { journeyChecklist, journeyChecklistForStage, journeyStageStatus } from "../src/lib/journey-checklist";

test("journeyChecklist covers every case stage exactly once", () => {
  const checklist = journeyChecklist();
  assert.equal(checklist.length, CASE_STAGES.length);
  const stages = checklist.map((entry) => entry.stage);
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
