import assert from "node:assert/strict";
import test from "node:test";
import { analysisHighlights, domainSummaries } from "@/src/lib/analysis/domains";
import { everydayInsights } from "@/src/lib/analysis/everyday-insights";
import type { Signal } from "@/src/lib/types";

function signal(overrides: Partial<Signal> & { key: string }): Signal {
  return {
    label: overrides.key,
    value: "x",
    severity: "neutral",
    summary: `samenvatting ${overrides.key}`,
    action: "actie",
    confidence: "medium",
    evidence: [],
    ...overrides,
  };
}

test("domain averages only scored, available signals", () => {
  const domains = domainSummaries([
    signal({ key: "noise", category: "gezondheid", score: 8 }),
    signal({ key: "air", category: "gezondheid", score: 4 }),
    signal({ key: "access", category: "mobiliteit" }),
  ]);
  const health = domains.find((domain) => domain.key === "gezondheid");
  assert.equal(health?.score, 6);
  assert.ok(health?.available);

  // Access has no score: the mobility domain must report unavailable, not 5/10.
  const mobility = domains.find((domain) => domain.key === "mobiliteit");
  assert.equal(mobility?.score, null);
  assert.equal(mobility?.available, false);
});

test("an unscored attention signal caps its domain score at 6.4", () => {
  const domains = domainSummaries([
    signal({ key: "context", category: "woning", score: 9 }),
    signal({ key: "foundation", category: "woning", severity: "attention" }),
  ]);
  const woning = domains.find((domain) => domain.key === "woning");
  assert.equal(woning?.hasUnscoredAttention, true);
  assert.equal(woning?.score, 6.4);
});

test("highlights never promote plain facts, but keep unscored warnings first", () => {
  const highlights = analysisHighlights([
    signal({ key: "context", summary: "BAG koppelt dit adres aan een verblijfsobject." }),
    signal({ key: "foundation", severity: "attention", summary: "Ouder dan 1945; onderzoek fundering." }),
    signal({ key: "noise", score: 3, summary: "Veel geluid." }),
    signal({ key: "green", score: 8, summary: "Veel groen." }),
    signal({ key: "energy", score: 7, summary: "Label A." }),
  ]);
  const attentionKeys = highlights.filter((item) => item.type === "attention").map((item) => item.signalKey);
  // Unscored warning wins a slot over lower-scored noise? No — foundation is unscored-attention,
  // then scored signals below 5.5 follow sorted ascending.
  assert.deepEqual(attentionKeys.slice(0, 1), ["foundation"]);
  assert.ok(attentionKeys.includes("noise"));
  assert.ok(!highlights.some((item) => item.signalKey === "context"), "plain facts must not become highlights");
  const positive = highlights.filter((item) => item.type === "positive").map((item) => item.signalKey);
  assert.deepEqual(positive, ["green", "energy"]);
});

test("street insight: only noise drives attention; green alone lifts to good", () => {
  const insights = everydayInsights([
    signal({ key: "noise", score: 6, summary: "n" }),
    signal({ key: "green", score: 2, summary: "g" }),
  ]);
  assert.equal(insights[0]?.tone, "neutral");

  const noisy = everydayInsights([signal({ key: "noise", score: 4 }), signal({ key: "green", score: 9 })]);
  assert.equal(noisy[0]?.tone, "attention");

  const calmGreen = everydayInsights([signal({ key: "noise", score: 7 }), signal({ key: "green", score: 9 })]);
  assert.equal(calmGreen[0]?.tone, "good");
});

test("comfort insight warns when either energy or heat is low", () => {
  const insights = everydayInsights([
    signal({ key: "energy", score: 8 }),
    signal({ key: "heat", score: 4 }),
  ]);
  const comfort = insights.find((insight) => insight.title === "Comfort en energierekening");
  assert.equal(comfort?.tone, "attention");
});

test("route insight inherits the legacy default-5 access behaviour", () => {
  // Preserved from the original orchestrator: access never carries a score,
  // so Math.min(transit, 5) keeps this insight at "attention" even with a
  // good transit score. Locked in deliberately so a future change is a
  // conscious product decision, not an accident.
  const goodTransit = everydayInsights([
    signal({ key: "transit", score: 7 }),
    signal({ key: "access", summary: "structureel" }),
  ]);
  assert.equal(goodTransit.find((insight) => insight.title === "Je dagelijkse route")?.tone, "attention");
});

test("school insight only appears when schools or children data exist", () => {
  const withoutSchools = everydayInsights([signal({ key: "noise", score: 6 })]);
  assert.ok(!withoutSchools.some((insight) => insight.title === "Gezin en school"));

  const withChildren = everydayInsights([
    signal({ key: "children", summary: "20% kinderen" }),
    signal({ key: "schools", score: 4 }),
  ]);
  const family = withChildren.find((insight) => insight.title === "Gezin en school");
  assert.equal(family?.tone, "attention");
});
