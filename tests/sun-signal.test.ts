import assert from "node:assert/strict";
import test from "node:test";
import { blockingPenalty, southBlockingBuildings, sunScoreFromMetrics, sunSignal } from "@/src/lib/analysis/signals/sun-signal";
import { polygonCentroid } from "@/src/lib/solar";
import type { BgtContext } from "@/src/lib/sources/pdok/bgt";
import type { Coordinates, Evidence, GeoJsonFeature } from "@/src/lib/types";

const evidence: Evidence = {
  id: "test",
  source: "Test",
  sourceUrl: "https://example.com",
  fetchedAt: "2026-01-01T00:00:00.000Z",
  confidence: "low",
};

const ORIGIN: Coordinates = { lat: 52.348, lng: 5.985 };
const M_LAT = 1 / 111_320;
const M_LNG = 1 / (111_320 * Math.cos((52.348 * Math.PI) / 180));

/** Square footprint of roughly `sizeM` metres with its centroid at the given offset (metres east, north). */
function buildingAt(offsetEastM: number, offsetNorthM: number, sizeM = 10): GeoJsonFeature {
  const centreLng = ORIGIN.lng + offsetEastM * M_LNG;
  const centreLat = ORIGIN.lat + offsetNorthM * M_LAT;
  const half = sizeM / 2;
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [[
        [centreLng - half * M_LNG, centreLat - half * M_LAT],
        [centreLng + half * M_LNG, centreLat - half * M_LAT],
        [centreLng + half * M_LNG, centreLat + half * M_LAT],
        [centreLng - half * M_LNG, centreLat + half * M_LAT],
        [centreLng - half * M_LNG, centreLat - half * M_LAT],
      ]],
    },
  };
}

function contextWith(buildings: GeoJsonFeature[]): BgtContext {
  return { roads: [], greenAreas: [], water: [], buildings, fetchedAt: "2026-01-01T00:00:00.000Z" };
}

test("south-blocking counts neighbours in the southern sector only", () => {
  const south = buildingAt(0, -25);
  const north = buildingAt(0, 25);
  const result = southBlockingBuildings([south, north], ORIGIN);
  assert.equal(result.count, 1);
  assert.ok(result.nearestM != null && result.nearestM >= 20 && result.nearestM <= 30);
});

test("far and overlapping neighbours are ignored", () => {
  assert.equal(southBlockingBuildings([buildingAt(0, -200)], ORIGIN).count, 0);
  // The subject's own footprint (distance < 3 m) is excluded by callers.
  assert.equal(southBlockingBuildings([buildingAt(0, 0)], ORIGIN).count, 0);
});

test("small sheds do not count as winter-sun blockers", () => {
  // ~3 × 3 m garden house due south at walking distance.
  const shed = buildingAt(3, -25, 3);
  const house = buildingAt(0, -25, 10);
  assert.equal(southBlockingBuildings([shed], ORIGIN).count, 0);
  assert.equal(southBlockingBuildings([house], ORIGIN).count, 1);
});

test("close southern neighbours cost more score than distant ones", () => {
  assert.ok(blockingPenalty(1, 20) > blockingPenalty(1, 50));
  assert.ok(blockingPenalty(4, 20) <= 4);
});

test("a south-facing facade outscores a north-facing one at equal surroundings", () => {
  const empty = { orientationBearing: null, blockingSouthCount: 0, nearestBlockingM: null };
  // Longest edge along east-west axis → facades face north or south; best side wins.
  const axisEW = sunScoreFromMetrics({ ...empty, orientationBearing: 90 });
  const axisNS = sunScoreFromMetrics({ ...empty, orientationBearing: 0 });
  assert.ok(axisEW! > axisNS!, `${axisEW} should beat ${axisNS}`);
});

test("sun signal degrades without a building footprint", () => {
  const signal = sunSignal({ bgt: contextWith([]), property: { coordinates: ORIGIN }, evidence, bgtAvailable: true });
  assert.equal(signal.key, "sun");
  assert.equal(signal.availability, "unavailable");
});

test("sun signal describes orientation and southern obstruction", () => {
  // Own building centred on the address, long axis east-west → facade south.
  const own = buildingAt(0, 0, 12);
  const neighbour = buildingAt(2, -25, 10);
  const signal = sunSignal({ bgt: contextWith([own, neighbour]), property: { coordinates: ORIGIN }, evidence, bgtAvailable: true });
  assert.equal(signal.availability, "available");
  assert.ok(typeof signal.score === "number");
  assert.match(signal.summary, /pand op het zuiden|panden op het zuiden/);
  void polygonCentroid;
});
