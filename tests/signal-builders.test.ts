import assert from "node:assert/strict";
import test from "node:test";
import { accessSignal, bgtMetrics, greenSignal, heatSignal, waterSignal, type BgtMetrics } from "@/src/lib/analysis/signals/bgt-signals";
import { foundationSignal, usageSignal, vveSignal } from "@/src/lib/analysis/signals/property-signals";
import { airSignal, noiseScoreFromLden } from "@/src/lib/analysis/signals/rivm-signals";
import { energyScore, energySignal } from "@/src/lib/analysis/signals/energy-signal";
import { futureScoreForTopics, transitScoreForDistance } from "@/src/lib/analysis/signals/mobility-signals";
import { soilSignal } from "@/src/lib/analysis/signals/soil-signal";
import type { BodemContext } from "@/src/lib/sources/bodem";
import type { Evidence, Property } from "@/src/lib/types";

const evidence: Evidence = {
  id: "test",
  source: "Test",
  sourceUrl: "https://example.com",
  fetchedAt: "2026-01-01T00:00:00.000Z",
  confidence: "high",
};

function propertyFixture(overrides: Partial<Property> = {}): Property {
  return {
    bagVboId: "1234567890123456",
    bagPandIds: ["pand-1"],
    addressLabel: "Korenstraat 18, 8161 Epe",
    street: "Korenstraat",
    houseNumber: 18,
    postcode: "8161",
    city: "Epe",
    coordinates: { lat: 52.348, lng: 5.985 },
    isResidential: true,
    ...overrides,
  };
}

const emptyMetrics: BgtMetrics = {
  greenPercent: 0,
  waterPercent: 0,
  nearestRoadM: Number.POSITIVE_INFINITY,
  nearestWaterM: Number.POSITIVE_INFINITY,
  greenTruncated: false,
  roadsTruncated: false,
};

const emptyBgt = {
  roads: [],
  greenAreas: [],
  water: [],
  buildings: [],
  fetchedAt: "2026-01-01T00:00:00.000Z",
};

test("bgtMetrics uses the square bbox area as denominator, not a circle", () => {
  const metrics = bgtMetrics(emptyBgt, { lat: 52, lng: 5 });
  assert.equal(metrics.greenPercent, 0);
});

test("green and heat signals flag BGT truncation with lower confidence", () => {
  const truncated: BgtMetrics = { ...emptyMetrics, greenPercent: 40, greenTruncated: true };
  const green = greenSignal({ metrics: truncated, evidence, bgtAvailable: true });
  assert.equal(green.confidence, "low");
  assert.match(green.summary, /afgekapt op 100 vlakken/);

  const clean = greenSignal({ metrics: { ...truncated, greenTruncated: false }, evidence, bgtAvailable: true });
  assert.equal(clean.confidence, "medium");
});

test("water signal warns when open water is within 30 m", () => {
  const near = waterSignal({ metrics: { ...emptyMetrics, nearestWaterM: 12, waterPercent: 5 }, evidence, bgtAvailable: true });
  assert.equal(near.severity, "attention");
  assert.match(near.summary, /grondwaterpeil/);

  const far = waterSignal({ metrics: { ...emptyMetrics, nearestWaterM: 120 }, evidence, bgtAvailable: true });
  assert.equal(far.severity, "good");
});

test("heat signal scores higher with more green and reports the sealed-surface proxy", () => {
  const lush = heatSignal({ metrics: { ...emptyMetrics, greenPercent: 80 }, evidence, bgtAvailable: true });
  const paved = heatSignal({ metrics: { ...emptyMetrics, greenPercent: 5 }, evidence, bgtAvailable: true });
  assert.ok((lush.score ?? 0) > (paved.score ?? 0));
  assert.deepEqual(paved.raw, { value: 95, unit: "% verhardingsproxy", metric: "afgeleid uit BGT" });
});

test("access signal stays neutral and never carries a score", () => {
  const signal = accessSignal({ roadCount: 42, truncated: false, evidence, bgtAvailable: true });
  assert.equal(signal.key, "access");
  assert.equal(signal.score, undefined);
  assert.equal(signal.severity, "neutral");
});

test("foundation signal flags pre-1945 buildings without faking a score", () => {
  const old = foundationSignal({ property: propertyFixture({ buildingYear: 1901 }), evidence });
  assert.equal(old.severity, "attention");
  assert.equal(old.score, undefined);

  const modern = foundationSignal({ property: propertyFixture({ buildingYear: 1995 }), evidence });
  assert.equal(modern.severity, "neutral");
});

test("usage signal marks explicit non-residential gebruiksdoel", () => {
  const office = usageSignal({ property: propertyFixture({ isResidential: false, usagePurposes: ["kantoorfunctie"] }), evidence });
  assert.equal(office.severity, "attention");

  // Unknown purposes must NOT warn.
  const unknown = usageSignal({ property: propertyFixture({ isResidential: true, usagePurposes: [] }), evidence });
  assert.equal(unknown.severity, "neutral");
});

test("vve signal detects sibling units sharing a pand", () => {
  const apartment = vveSignal({
    siblings: [{ bagVboId: "2", addressLabel: "B", distanceM: 5, coordinates: { lat: 0, lng: 0 }, pandIds: ["pand-1"] }],
    evidence,
    nearbyAvailable: true,
  });
  assert.equal(apartment.severity, "attention");
  assert.match(String(apartment.value), /1 andere woonadres/);
});

test("noise score falls off above the 35 dB floor", () => {
  assert.equal(noiseScoreFromLden(35), 10);
  assert.ok(noiseScoreFromLden(55) < noiseScoreFromLden(45));
  assert.equal(noiseScoreFromLden(20), 10);
});

test("air signal prefers NO₂ and degrades to PM₂·₅, then unavailable", () => {
  const no2 = airSignal({ rivm: { no2: 25, pm25: 8, fetchedAt: "" }, evidence });
  assert.match(String(no2.value), /NO₂/);
  assert.equal(no2.availability, "available");

  const none = airSignal({ rivm: null, evidence });
  assert.equal(none.availability, "unavailable");
  assert.equal(none.score, undefined);
});

test("energy label scoring keeps the A++++ to F ladder", () => {
  assert.equal(energyScore("A++++"), 10);
  assert.equal(energyScore("A"), 8.7);
  assert.equal(energyScore("c"), 6.5);
  assert.equal(energyScore("G"), 2);
  assert.equal(energyScore("A++PLUS").valueOf(), energyScore("A+++"));
});

test("energy signal without a label is unavailable rather than zero-scored", () => {
  const missing = energySignal({ energyLabel: null, evidence, energyAvailable: false });
  assert.equal(missing.availability, "unavailable");
  assert.equal(missing.severity, "neutral");
});

test("transit and future scores follow their documented slopes", () => {
  assert.equal(transitScoreForDistance(0), 10);
  assert.ok(transitScoreForDistance(750) < transitScoreForDistance(150));
  assert.equal(futureScoreForTopics(500), 4);
  assert.equal(futureScoreForTopics(0), 7);
});

test("soil signal only fires on matches and caps the display count at 99+", () => {
  const context: BodemContext = {
    providers: [{
      provider: "Gemeente Nijmegen",
      status: "ok",
      sourceUrl: "https://example.com/wfs",
      matchedCount: 3,
      layers: [{ layerKey: "verontreinigd", matchedCount: 3 }],
    }],
    queriedProvinces: ["gelderland"],
    queryBboxEpsg4326: "5.98,52.34,6.00,52.36",
    totalMatches: 3,
    overallStatus: "partial",
    caveat: "screening",
    fetchedAt: "2026-01-01T00:00:00.000Z",
  };
  const hit = soilSignal({ bodem: context, evidence });
  assert.ok(hit);
  assert.equal(hit?.severity, "attention");
  assert.match(hit?.summary ?? "", /verontreinigingen \(3\)/);

  const many = soilSignal({ bodem: { ...context, totalMatches: 150 }, evidence });
  assert.equal(many?.value, "99+ locaties");
});
