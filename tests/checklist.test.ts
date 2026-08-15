import assert from "node:assert/strict";
import test from "node:test";
import { checklistForAnalysis, mergeChecklistWithDefaults } from "@/src/lib/checklist";
import type { Analysis } from "@/src/lib/types";

test("checklist starts with attention actions and generic viewing checks", () => {
  const items = checklistForAnalysis({ signals: [{ key: "noise", label: "Geluid", category: "gezondheid", severity: "attention", value: 3, summary: "Dicht bij weg", action: "Luister naar verkeer", confidence: "medium", evidence: [] }], } as unknown as Analysis);
  assert.equal(items.some((item) => item.signalKey === "noise"), true);
  assert.equal(items.some((item) => item.id === "condition"), true);
});

test("restores matching state, adds new defaults, and retains custom checklist items", () => {
  const defaults = [{ id: "vve", label: "VvE", checked: false }, { id: "legal", label: "Juridisch", checked: false }];
  const persisted = [{ id: "vve", label: "Oude tekst", checked: true, note: "Jaarstukken opvragen" }, { id: "custom-1", label: "Eigen vraag", checked: true, note: "Bel de makelaar" }];

  assert.deepEqual(mergeChecklistWithDefaults(defaults, persisted), [
    { id: "vve", label: "VvE", checked: true, note: "Jaarstukken opvragen" },
    { id: "legal", label: "Juridisch", checked: false },
    { id: "custom-1", label: "Eigen vraag", checked: true, note: "Bel de makelaar" },
  ]);
});
