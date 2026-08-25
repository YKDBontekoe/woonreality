import assert from "node:assert/strict";
import test from "node:test";
import { insightComposites } from "@/src/lib/analysis/composites";
import type { Signal, WozBenchmark } from "@/src/lib/types";

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

const benchmark: WozBenchmark = {
  buurtAverage: 400_000,
  wijkAverage: 420_000,
  gemeenteAverage: 380_000,
  fetchedAt: "2026-01-01T00:00:00Z",
};

test("wintercomfort warns when sun is good but energy is poor", () => {
  const { stories } = insightComposites({
    signals: [
      signal({ key: "sun", score: 8 }),
      signal({ key: "energy", value: "E", score: 4.3 }),
    ],
  });
  const winter = stories.find((story) => story.key === "wintercomfort");
  assert.ok(winter);
  assert.equal(winter.tone, "attention");
  assert.deepEqual(winter.signalKeys.sort(), ["energy", "sun"]);
});

test("wintercomfort needs at least two present signals", () => {
  const { stories } = insightComposites({ signals: [signal({ key: "sun", score: 8 })] });
  assert.ok(!stories.some((story) => story.key === "wintercomfort"));
});

test("wintercomfort does not claim isolation insight without an energy score", () => {
  // Sun + heat are both climate signals; without energy there is nothing
  // to say about insulation and the story must stay silent.
  const { stories } = insightComposites({
    signals: [signal({ key: "sun", score: 4 }), signal({ key: "heat", score: 6 })],
  });
  assert.ok(!stories.some((story) => story.key === "wintercomfort"));
});

test("health profile flags noise as the weak spot even with good air", () => {
  const { stories } = insightComposites({
    signals: [
      signal({ key: "noise", score: 4 }),
      signal({ key: "air", score: 8 }),
      signal({ key: "green", score: 7 }),
    ],
  });
  const health = stories.find((story) => story.key === "health");
  assert.ok(health);
  assert.equal(health.tone, "attention");
  assert.deepEqual(health.signalKeys.sort(), ["air", "green", "noise"]);
});

test("health tone and copy stay aligned when only green drags the score down", () => {
  const { stories } = insightComposites({
    signals: [
      signal({ key: "noise", score: 7 }),
      signal({ key: "air", score: 7 }),
      signal({ key: "green", score: 4 }),
    ],
  });
  const health = stories.find((story) => story.key === "health");
  assert.ok(health);
  // An attention tone must never come with a "no pronounced picture" summary.
  if (health.tone === "attention") {
    assert.ok(!/geen uitgesproken/i.test(health.summary));
  }
});

test("running-costs story interpolates the energy label", () => {
  const { stories } = insightComposites({
    signals: [signal({ key: "energy", value: "F", score: 3.2 })],
  });
  const costs = stories.find((story) => story.key === "runningCosts");
  assert.ok(costs);
  assert.match(costs.summary, /F/);
});

test("price far above buurt average with two attention signals yields a high contradiction", () => {
  const { contradictions } = insightComposites({
    signals: [
      signal({ key: "noise", score: 6.5 }),
      signal({ key: "foundation", severity: "attention" }),
      signal({ key: "energy", value: "G", score: 2, severity: "attention" }),
    ],
    askingPrice: 500_000,
    wozBenchmark: benchmark,
  });
  const flag = contradictions.find((item) => item.key === "priceAboveArea");
  assert.ok(flag);
  assert.equal(flag.severity, "high");
  assert.match(flag.summary, /25/);
});

test("price well below buurt average flags a research prompt", () => {
  const { contradictions } = insightComposites({
    signals: [],
    askingPrice: 300_000,
    wozBenchmark: benchmark,
  });
  const flag = contradictions.find((item) => item.key === "priceBelowArea");
  assert.ok(flag);
  assert.equal(flag.severity, "medium");
});

test("no price or benchmark means no value story and no price contradictions", () => {
  const result = insightComposites({ signals: [signal({ key: "sun", score: 7 })] });
  assert.ok(!result.stories.some((story) => story.key === "valueContext"));
  assert.equal(result.contradictions.length, 0);
});

test("pre-war home with an A label triggers the label verification flag", () => {
  const { contradictions } = insightComposites({
    signals: [signal({ key: "energy", value: "A", score: 8.7 })],
    buildingYear: 1930,
  });
  const flag = contradictions.find((item) => item.key === "oldHouseHighLabel");
  assert.ok(flag);
  assert.match(flag.title, /1930/);
});

test("post-war home with an A label does not trigger the label flag", () => {
  const { contradictions } = insightComposites({
    signals: [signal({ key: "energy", value: "A", score: 8.7 })],
    buildingYear: 1995,
  });
  assert.ok(!contradictions.some((item) => item.key === "oldHouseHighLabel"));
});

test("noise premium fires on a pricey home with weak noise scores", () => {
  const { contradictions } = insightComposites({
    signals: [signal({ key: "noise", score: 4 })],
    askingPrice: 480_000,
    wozBenchmark: benchmark,
  });
  const flag = contradictions.find((item) => item.key === "noisePremium");
  assert.ok(flag);
  assert.equal(flag.severity, "high");
});
