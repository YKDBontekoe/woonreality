import assert from "node:assert/strict";
import test from "node:test";
import { PROFESSIONAL_GUIDES, professionalGuidesForStage } from "../src/lib/professionals";

test("every professional guide has selection criteria and an official registry link", () => {
  for (const guide of PROFESSIONAL_GUIDES) {
    assert.ok(guide.howToChoose.length > 0, `expected howToChoose for ${guide.key}`);
    assert.match(guide.registryUrl, /^https:\/\//);
  }
});

test("professionalGuidesForStage filters by stage", () => {
  const inspectionStage = professionalGuidesForStage("finance_inspection");
  assert.ok(inspectionStage.some((guide) => guide.key === "taxateur"));
  assert.ok(inspectionStage.some((guide) => guide.key === "keurder"));
  assert.equal(inspectionStage.some((guide) => guide.key === "notaris"), false);

  const transferStage = professionalGuidesForStage("transfer");
  assert.ok(transferStage.some((guide) => guide.key === "notaris"));
});
