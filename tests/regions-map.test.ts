import assert from "node:assert/strict";
import test from "node:test";
import { GET as getRegions } from "@/app/api/map/regions/route";
import { parseNationalLayer } from "@/src/lib/map/national-layers";
import { regionScaleFromZoom } from "@/src/lib/map/national-layers";
import {
  choroplethValue,
  parseRegionBBox,
  parseRegionZoom,
  regionScaleForRequest,
} from "@/src/lib/map/regions";
import { isRegionsRateLimited } from "@/src/lib/map/regions-rate-limit";
import { assertPositiveInteger, normalizeRegionCode } from "@/src/lib/sources/cbs-odata";
import { lookupCrimeEntry, crimeRatePer1000 } from "@/src/lib/sources/politie";
import { lookupSesEntry } from "@/src/lib/sources/ses";

test("parseRegionBBox accepts valid Dutch viewport boxes and rejects garbage", () => {
  assert.deepEqual(parseRegionBBox("5.9,52.3,6.1,52.5"), [5.9, 52.3, 6.1, 52.5]);
  assert.equal(parseRegionBBox("6,52,5,53"), null);
  assert.equal(parseRegionBBox("abc"), null);
  assert.equal(parseRegionBBox("0,0,30,30"), null);
});

test("region scale follows zoom thresholds", () => {
  assert.equal(regionScaleFromZoom(7), "gemeente");
  assert.equal(regionScaleFromZoom(9), "wijk");
  assert.equal(regionScaleFromZoom(12), "buurt");
  assert.equal(regionScaleForRequest(12, null), "buurt");
  assert.equal(regionScaleForRequest(7, "buurt"), "gemeente");
  assert.equal(regionScaleForRequest(12, "gemeente"), "gemeente");
  assert.equal(regionScaleForRequest(null, "wijk"), "gemeente");
});

test("parseNationalLayer rejects inherited keys", () => {
  assert.equal(parseNationalLayer("ses"), "ses");
  assert.equal(parseNationalLayer("constructor"), null);
});

test("assertPositiveInteger rejects invalid pagination inputs", () => {
  assert.equal(assertPositiveInteger(12, "concurrency"), 12);
  assert.throws(() => assertPositiveInteger(0, "pageSize"), /positive integer/i);
  assert.throws(() => assertPositiveInteger(1.5, "concurrency"), /positive integer/i);
});

test("regions route rate limits excessive requests", async () => {
  const key = `test-${Date.now()}`;
  for (let index = 0; index < 60; index += 1) {
    assert.equal(isRegionsRateLimited(key), false);
  }
  assert.equal(isRegionsRateLimited(key), true);
});

test("parseRegionZoom clamps to supported map zoom", () => {
  assert.equal(parseRegionZoom("7.5"), 7.5);
  assert.equal(parseRegionZoom("4"), null);
  assert.equal(parseRegionZoom("abc"), null);
});

test("choroplethValue maps CBS and joined stats with sentinel-safe WOZ", () => {
  const sesLookup = new Map([
    ["BU02320000", { sesScore: 0.118, educationHighPct: 32.6, periodYear: "2024" }],
  ]);
  const crimeLookup = new Map([
    ["BU02320000", { total: 42, periodYear: "2024" }],
  ]);
  const props = {
    regionCode: "BU02320000",
    inhabitants: 1670,
    averageWoz: 442,
    primarySchoolDistanceKm: 0.5,
    shareAge0to15Pct: 11,
    populationDensity: 2697,
  };

  assert.equal(choroplethValue("woz", props, sesLookup, crimeLookup).value, 442_000);
  assert.equal(choroplethValue("schools", props, sesLookup, crimeLookup).value, 0.5);
  assert.equal(choroplethValue("crime", props, sesLookup, crimeLookup).value, crimeRatePer1000(42, 1670));
  assert.equal(choroplethValue("ses", props, sesLookup, crimeLookup).value, 0.118);
  assert.equal(choroplethValue("education", props, sesLookup, crimeLookup).value, 32.6);
});

test("lookup helpers normalize padded CBS region codes", () => {
  const sesLookup = new Map([["BU02320000", { sesScore: 0.1 }]]);
  const crimeLookup = new Map<string, import("@/src/lib/sources/politie").CrimeLookupEntry>([
    ["WK023200:1670", { total: 10, per1000: 6 }],
    ["WK023200", { total: 10, per1000: 6 }],
  ]);
  assert.equal(lookupSesEntry(sesLookup, "BU02320000")?.sesScore, 0.1);
  assert.equal(lookupCrimeEntry(crimeLookup, "WK023200  ", 1670)?.total, 10);
  assert.equal(normalizeRegionCode(" GM0232 "), "GM0232");
});

test("regions route rejects invalid bbox without fetching", async () => {
  const response = await getRegions(new Request("http://localhost/api/map/regions?bbox=bad&layer=ses&zoom=7"));
  assert.equal(response.status, 400);
  assert.match((await response.json() as { error: string }).error, /bbox/i);
});
