import assert from "node:assert/strict";
import test from "node:test";
import { checklistForAnalysis, listingQuestionItem, mergeChecklistWithDefaults } from "@/src/lib/checklist";
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

test("listing questions get stable ids and obsolete listing-q records are dropped", () => {
  const first = listingQuestionItem("CV", "Vraag het bouwjaar van de ketel");
  const second = listingQuestionItem("CV", "Vraag het bouwjaar van de ketel");
  const other = listingQuestionItem("Keuken", "Vraag het bouwjaar van de ketel");
  assert.equal(first.id, second.id);
  assert.notEqual(first.id, other.id);
  assert.match(first.id, /^listing-q-[0-9a-f]+$/);

  const merged = mergeChecklistWithDefaults(
    [first],
    [
      { id: "listing-q-0", label: "Oude vraag", checked: true, note: "mismatch" },
      { id: first.id, label: first.label, checked: true, note: "Bewaar dit" },
      { id: "custom-1", label: "Eigen vraag", checked: true },
    ],
  );
  assert.equal(merged.some((item) => item.id === "listing-q-0"), false);
  assert.equal(merged.find((item) => item.id === first.id)?.note, "Bewaar dit");
  assert.equal(merged.some((item) => item.id === "custom-1"), true);
});
