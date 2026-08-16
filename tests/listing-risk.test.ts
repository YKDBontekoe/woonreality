import assert from "node:assert/strict";
import test from "node:test";
import { listingRiskFlags } from "@/src/lib/listing-risk";
import type { PropertyListing } from "@/src/lib/types";

function baseListing(overrides: Partial<PropertyListing> = {}): PropertyListing {
  return {
    provider: "Funda (door jou toegevoegd)",
    externalId: "12345678",
    sourceUrl: "https://www.funda.nl/detail/koop/epe/huis-12345678/",
    fetchedAt: new Date().toISOString(),
    status: "active",
    ...overrides,
  };
}

test("listingRiskFlags returns nothing for a listing without risk text", () => {
  const flags = listingRiskFlags(baseListing({ description: "Lichte hoekwoning met tuin op het zuiden." }));
  assert.equal(flags.length, 0);
});

test("listingRiskFlags returns nothing for null listing", () => {
  assert.deepEqual(listingRiskFlags(null), []);
});

test("listingRiskFlags flags erfpacht unless explicitly fully bought off", () => {
  const flags = listingRiskFlags(baseListing({ ownership: "Erfpacht" }));
  assert.ok(flags.some((flag) => flag.key === "erfpacht"));
});

test("listingRiskFlags does not flag erfpacht when fully bought off", () => {
  const flags = listingRiskFlags(baseListing({ ownership: "Erfpacht, eeuwigdurend afgekocht" }));
  assert.ok(!flags.some((flag) => flag.key === "erfpacht"));
});

test("listingRiskFlags flags a thin VvE reserve relative to the monthly contribution", () => {
  const flags = listingRiskFlags(baseListing({ vveContribution: 150, vveReserveFund: 500 }));
  assert.ok(flags.some((flag) => flag.key === "vve-reserve-laag"));
});

test("listingRiskFlags does not flag a healthy VvE reserve", () => {
  const flags = listingRiskFlags(baseListing({ vveContribution: 150, vveReserveFund: 30_000 }));
  assert.ok(!flags.some((flag) => flag.key === "vve-reserve-laag"));
});

test("listingRiskFlags flags a missing reserve fund when a VvE contribution exists", () => {
  const flags = listingRiskFlags(baseListing({ vveContribution: 150 }));
  assert.ok(flags.some((flag) => flag.key === "vve-reserve-onbekend"));
});

test("listingRiskFlags detects moisture, asbestos, and ouderdomsclausule mentions in free text", () => {
  const flags = listingRiskFlags(baseListing({
    description: "Let op: er is sprake van een ouderdomsclausule en asbest in de garage. Bij de vorige verbouwing was er wat vochtplekken.",
  }));
  const keys = flags.map((flag) => flag.key).sort();
  assert.deepEqual(keys, ["asbest", "ouderdomsclausule", "vocht-lekkage"]);
});

test("listingRiskFlags checks extraKenmerken values too", () => {
  const flags = listingRiskFlags(baseListing({ extraKenmerken: { Eigendom: "Erfpacht" } }));
  assert.ok(flags.some((flag) => flag.key === "erfpacht"));
});
