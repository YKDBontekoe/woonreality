import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("main branch ruleset requires the CI quality check", async () => {
  const ruleset = JSON.parse(await readFile(".github/rulesets/main.json", "utf8")) as {
    target: string;
    enforcement: string;
    conditions: { ref_name: { include: string[] } };
    rules: Array<{ type: string; parameters?: { required_status_checks?: Array<{ context: string }> } }>;
  };

  assert.equal(ruleset.target, "branch");
  assert.equal(ruleset.enforcement, "active");
  assert.deepEqual(ruleset.conditions.ref_name.include, ["refs/heads/main"]);
  assert.ok(ruleset.rules.some((rule) => rule.type === "pull_request"));
  assert.ok(ruleset.rules.some((rule) => rule.type === "deletion"));
  assert.ok(ruleset.rules.some((rule) => rule.type === "non_fast_forward"));
  assert.ok(ruleset.rules.some((rule) => rule.parameters?.required_status_checks?.some((check) => check.context === "quality")));
});
