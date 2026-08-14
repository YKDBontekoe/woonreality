import assert from "node:assert/strict";
import test from "node:test";
import { checklistForAnalysis } from "@/src/lib/checklist";
import type { Analysis } from "@/src/lib/types";

test("checklist starts with attention actions and generic viewing checks", () => {
  const items = checklistForAnalysis({ signals: [{ key: "noise", label: "Geluid", category: "gezondheid", severity: "attention", value: 3, summary: "Dicht bij weg", action: "Luister naar verkeer", confidence: "medium", evidence: [] }], } as unknown as Analysis);
  assert.equal(items.some((item) => item.signalKey === "noise"), true);
  assert.equal(items.some((item) => item.id === "condition"), true);
});
