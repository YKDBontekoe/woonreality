import assert from "node:assert/strict";
import test from "node:test";
import { calculatePersonalFit, DEFAULT_PREFERENCES } from "@/src/lib/personalization";
import type { Analysis } from "@/src/lib/types";

const analysis = {
  domains: [
    { key: "gezondheid", label: "Gezondheid", score: 4, signalKeys: [], available: true, summary: "" },
    { key: "mobiliteit", label: "Mobiliteit", score: 8, signalKeys: [], available: true, summary: "" },
    { key: "woning", label: "Woning", score: 6, signalKeys: [], available: true, summary: "" },
  ],
} as unknown as Analysis;

test("personal fit follows the user's available domain weights", () => {
  assert.equal(calculatePersonalFit(analysis, { ...DEFAULT_PREFERENCES, quiet: 3, mobility: 1 }), 5.2);
});

test("personal fit ignores unavailable domains instead of treating them as neutral", () => {
  assert.equal(calculatePersonalFit({ domains: [{ key: "gezondheid", label: "Gezondheid", score: null, signalKeys: [], available: false, summary: "" }] } as unknown as Analysis, DEFAULT_PREFERENCES), null);
});
