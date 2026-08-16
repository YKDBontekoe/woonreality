import assert from "node:assert/strict";
import test from "node:test";
import { PROFESSIONAL_GUIDES, professionalGuidesForStage } from "../src/lib/professionals";

test("every professional guide has selection criteria; registry links are HTTPS when present", () => {
  for (const guide of PROFESSIONAL_GUIDES) {
    assert.ok(guide.howToChoose.length > 0, `expected howToChoose for ${guide.key}`);
    if (guide.registryUrl) {
      assert.match(guide.registryUrl, /^https:\/\//);
      assert.ok(guide.registryLabel);
    }
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

test("bouwkundig keurder has no commercial provider presented as a registry", () => {
  const keurder = PROFESSIONAL_GUIDES.find((guide) => guide.key === "keurder");
  assert.ok(keurder);
  assert.equal(keurder!.registryUrl, undefined);
});
