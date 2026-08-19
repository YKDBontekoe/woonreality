import assert from "node:assert/strict";
import test from "node:test";
import { estimateRunningCosts } from "../src/lib/running-costs";
import { FALLBACK_TARIFFS, FALLBACK_CONSUMPTION, areaToClassKey, buildingYearToClassKey, housingTypeToKey } from "../src/lib/sources/cbs-energy";

test("estimateRunningCosts includes electricity, gas, water, taxes, insurance", () => {
  const result = estimateRunningCosts({
    tariffs: FALLBACK_TARIFFS,
    consumption: FALLBACK_CONSUMPTION,
    areaM2: 100,
  });
  const keys = result.lines.map((l) => l.key);
  assert.ok(keys.includes("electricity"));
  assert.ok(keys.includes("gas"));
  assert.ok(keys.includes("water"));
  assert.ok(keys.includes("municipal-taxes"));
  assert.ok(keys.includes("insurance"));
  assert.ok(result.monthlyTotal > 0);
  assert.ok(result.yearlyTotal > 0);
  assert.ok(result.yearlyTotal > result.monthlyTotal);
});

test("gas is included by default (cooking, hot water)", () => {
  const result = estimateRunningCosts({
    tariffs: FALLBACK_TARIFFS,
    consumption: FALLBACK_CONSUMPTION,
    areaM2: 80,
  });
  assert.ok(result.lines.some((l) => l.key === "gas"));
});

test("gas is excluded only when gasConnection is explicitly false", () => {
  const result = estimateRunningCosts({
    tariffs: FALLBACK_TARIFFS,
    consumption: FALLBACK_CONSUMPTION,
    areaM2: 80,
    gasConnection: false,
  });
  assert.ok(!result.lines.some((l) => l.key === "gas"));
  const withGas = estimateRunningCosts({
    tariffs: FALLBACK_TARIFFS,
    consumption: FALLBACK_CONSUMPTION,
    areaM2: 80,
  });
  assert.ok(result.monthlyTotal < withGas.monthlyTotal);
});

test("VvE contribution is included when provided", () => {
  const without = estimateRunningCosts({
    tariffs: FALLBACK_TARIFFS,
    consumption: FALLBACK_CONSUMPTION,
    areaM2: 60,
  });
  const with150 = estimateRunningCosts({
    tariffs: FALLBACK_TARIFFS,
    consumption: FALLBACK_CONSUMPTION,
    areaM2: 60,
    vveContribution: 150,
  });
  assert.ok(with150.lines.some((l) => l.key === "vve"));
  assert.ok(!without.lines.some((l) => l.key === "vve"));
  assert.ok(with150.monthlyTotal > without.monthlyTotal);
});

test("insurance scales with area", () => {
  const small = estimateRunningCosts({
    tariffs: FALLBACK_TARIFFS,
    consumption: FALLBACK_CONSUMPTION,
    areaM2: 50,
  });
  const large = estimateRunningCosts({
    tariffs: FALLBACK_TARIFFS,
    consumption: FALLBACK_CONSUMPTION,
    areaM2: 200,
  });
  const smallIns = small.lines.find((l) => l.key === "insurance")!;
  const largeIns = large.lines.find((l) => l.key === "insurance")!;
  assert.ok(largeIns.amountYearly > smallIns.amountYearly);
});

test("CBS area class mapping", () => {
  assert.equal(areaToClassKey(30), "A050300");
  assert.equal(areaToClassKey(60), "A025408");
  assert.equal(areaToClassKey(80), "A025409");
  assert.equal(areaToClassKey(120), "A025410");
  assert.equal(areaToClassKey(180), "A025411");
  assert.equal(areaToClassKey(300), "A050301");
});

test("CBS building year class mapping", () => {
  assert.equal(buildingYearToClassKey(1920), "ZW25799");
  assert.equal(buildingYearToClassKey(1950), "ZW25800");
  assert.equal(buildingYearToClassKey(1970), "ZW10406");
  assert.equal(buildingYearToClassKey(1985), "ZW25801");
  assert.equal(buildingYearToClassKey(2000), "ZW25815");
  assert.equal(buildingYearToClassKey(2010), "ZW25818");
  assert.equal(buildingYearToClassKey(2020), "ZW25797");
});

test("housing type mapping", () => {
  assert.equal(housingTypeToKey("Appartement"), "ZW25810");
  assert.equal(housingTypeToKey("Tussenwoning"), "ZW25805");
  assert.equal(housingTypeToKey("Vrijstaande villa"), "ZW10320");
  assert.equal(housingTypeToKey(undefined), "T001100");
  assert.equal(housingTypeToKey("onbekend type"), "T001100");
});

test("fallback tariffs are used when CBS data is unavailable", () => {
  const result = estimateRunningCosts({
    tariffs: FALLBACK_TARIFFS,
    consumption: FALLBACK_CONSUMPTION,
    areaM2: 100,
  });
  assert.equal(result.tariffPeriod, "fallback-2026");
  assert.ok(result.disclaimer.length > 0);
});

test("estimate works without areaM2 (no insurance line)", () => {
  const result = estimateRunningCosts({
    tariffs: FALLBACK_TARIFFS,
    consumption: FALLBACK_CONSUMPTION,
  });
  assert.ok(!result.lines.some((l) => l.key === "insurance"));
  assert.ok(result.monthlyTotal > 0);
});

test("CBS-sourced lines are marked", () => {
  const result = estimateRunningCosts({
    tariffs: FALLBACK_TARIFFS,
    consumption: FALLBACK_CONSUMPTION,
    areaM2: 100,
  });
  const elec = result.lines.find((l) => l.key === "electricity")!;
  const gas = result.lines.find((l) => l.key === "gas")!;
  const water = result.lines.find((l) => l.key === "water")!;
  assert.equal(elec.cbsSourced, true);
  assert.equal(gas.cbsSourced, true);
  assert.equal(water.cbsSourced, false);
});
