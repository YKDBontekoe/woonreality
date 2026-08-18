import assert from "node:assert/strict";
import test from "node:test";
import { buildVerdict, topThings, triageSignals } from "@/src/lib/report-summary";
import type { Analysis, Signal } from "@/src/lib/types";

function baseSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    key: "green",
    label: "Groen",
    category: "klimaat",
    value: "25%",
    score: 8,
    severity: "good",
    summary: "Veel groen in de buurt.",
    action: "Check de tuin.",
    confidence: "medium",
    evidence: [],
    availability: "available",
    ...overrides,
  };
}

function baseAnalysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    property: {
      bagVboId: "test",
      bagPandIds: [],
      addressLabel: "Test 1, Epe",
      street: "Test",
      houseNumber: 1,
      postcode: "8161 AA",
      city: "Epe",
      coordinates: { lat: 52, lng: 6 },
      isResidential: true,
    },
    overallScore: 7.2,
    analysisVersion: "test",
    scoringVersion: "test",
    signals: [],
    components: [],
    evidence: [],
    generatedAt: "2026-01-01T00:00:00.000Z",
    sources: [],
    domains: [],
    everydayInsights: [],
    highlights: [],
    dataCoverage: { available: 5, total: 6, label: "5 van 6 onderwerpen beschikbaar" },
    sourceStatuses: [],
    knownGaps: [],
    nearbyProperties: [],
    ...overrides,
  };
}

test("buildVerdict returns attention tone when multiple attention highlights exist", () => {
  const verdict = buildVerdict(
    baseAnalysis({
      overallScore: 8.1,
      highlights: [
        { type: "attention", signalKey: "noise", text: "Luid." },
        { type: "attention", signalKey: "crime", text: "Hoog." },
      ],
    }),
  );
  assert.equal(verdict.tone, "attention");
  assert.match(verdict.summary, /2 punten/);
});

test("topThings prioritizes attention highlights then everyday insights", () => {
  const things = topThings(
    baseAnalysis({
      highlights: [
        { type: "attention", signalKey: "foundation", text: "Oud pand." },
        { type: "positive", signalKey: "green", text: "Veel groen." },
      ],
      everydayInsights: [
        {
          title: "Straatbeeld",
          summary: "Prettige straat.",
          tone: "good",
          signalKeys: ["green", "noise"],
        },
      ],
      signals: [
        baseSignal({ key: "foundation", label: "Fundering", severity: "attention", score: undefined }),
        baseSignal(),
      ],
    }),
    3,
  );

  assert.equal(things.length, 3);
  assert.equal(things[0].tone, "attention");
  assert.equal(things[0].title, "Fundering");
  assert.equal(things[1].title, "Straatbeeld");
  assert.equal(things[2].tone, "good");
});

test("triageSignals buckets unscored attention signals and groups by domain", () => {
  const triaged = triageSignals([
    baseSignal({ key: "foundation", label: "Fundering", category: "woning", severity: "attention", score: undefined }),
    baseSignal({ key: "noise", label: "Geluid", category: "gezondheid", score: 4.2, severity: "attention" }),
    baseSignal({ key: "missing", label: "Leeg", availability: "unavailable" }),
    baseSignal({ key: "green", label: "Groen", category: "klimaat", score: 8.5, severity: "good" }),
  ]);

  assert.equal(triaged.attention.length, 2);
  assert.equal(triaged.unavailable.length, 1);
  assert.equal(triaged.good.length, 1);
  assert.equal(triaged.byDomain.woning?.length, 1);
  assert.equal(triaged.byDomain.gezondheid?.length, 1);
});
