import assert from "node:assert/strict";
import test from "node:test";
import { isBestInRow, parsePlaceParam, placeRefKey, placeSignalRows } from "@/src/lib/place-compare";
import type { PlaceAnalysis, Signal } from "@/src/lib/types";

test("parsePlaceParam validates kind prefixes and caps at four", () => {
  const refs = parsePlaceParam("buurt:BU03980600,gemeente:GM1586,bogus:123,woonplaats:WNL123");
  assert.deepEqual(refs.map(placeRefKey), ["buurt:BU03980600", "gemeente:GM1586", "woonplaats:WNL123"]);
  const capped = parsePlaceParam("buurt:A,gemeente:B,woonplaats:C,buurt:D,gemeente:E");
  assert.equal(capped.length, 4);
});

function placeWith(signals: Partial<Signal>[], cbs: Record<string, number | undefined> = {}): PlaceAnalysis {
  return {
    kind: "buurt",
    code: "BU0000",
    name: "Testbuurt",
    coordinates: { lat: 52, lng: 5 },
    cbs: cbs as never,
    signals: signals.map((partial) => ({
      key: "x",
      label: "X",
      severity: "neutral",
      summary: "",
      action: "",
      confidence: "medium",
      evidence: [],
      ...partial,
    })) as Signal[],
    buurten: [],
    sources: [],
    generatedAt: "2026-01-01T00:00:00.000Z",
  };
}

test("place rows match signals across places by key and keep scores comparable", () => {
  const left = placeWith([{ key: "noise", label: "Geluidsscreening", score: 7.5, unit: "/ 10" }]);
  const right = placeWith([
    { key: "noise", label: "Geluidsscreening", score: 4, unit: "/ 10" },
    { key: "green", label: "Groen", score: 8, unit: "/ 10" },
  ]);
  const rows = placeSignalRows([left, right]);
  assert.equal(rows.length, 2);
  const noise = rows.find((row) => row.key === "noise")!;
  assert.equal(noise.higherIsBetter, true);
  assert.deepEqual(noise.values, [7.5, 4]);
});

test("unavailable or unscored descriptive signals do not fabricate numbers", () => {
  const left = placeWith([{ key: "access", value: "12 wegdelen", availability: "available" }]);
  const right = placeWith([]);
  const rows = placeSignalRows([left, right]);
  assert.equal(rows.length, 0);
});

test("best-in-row respects direction and ignores null competitors", () => {
  assert.equal(isBestInRow([7.5, 4, null], 0, true), true);
  assert.equal(isBestInRow([7.5, 4], 1, true), false);
  assert.equal(isBestInRow([30, 20, null], 1, false), true);
  assert.equal(isBestInRow([5, 5], 0, true), false);
});
