import assert from "node:assert/strict";
import test from "node:test";
import { listingKenmerkGroups, neighborhoodStatsFromListing } from "@/src/lib/listing-kenmerken";
import { computePropertyAffordability } from "@/src/lib/affordability";
import { estimateBuyerCosts } from "@/src/lib/costs";
import { defaultCalculatorState } from "@/src/lib/mortgage/calculator-state";
import { DEFAULT_BUYER_PROFILE } from "@/src/lib/purchase";
import type { PropertyListing } from "@/src/lib/types";

const keteldiep: PropertyListing = {
  provider: "Funda (door jou toegevoegd)",
  externalId: "keteldiep",
  sourceUrl: "https://www.funda.nl/detail/koop/dordrecht/huis-keteldiep-10/1/",
  fetchedAt: "2026-08-17T00:00:00.000Z",
  status: "active",
  askingPrice: 325000,
  pricePerM2: 3218,
  livingAreaM2: 101,
  plotAreaM2: 118,
  volumeM3: 339,
  roomCount: 4,
  bedroomCount: 3,
  bathroomCount: 1,
  propertyType: "Eengezinswoning, tussenwoning",
  constructionYear: 1974,
  energyLabel: "B",
  insulation: "Dubbel glas, muurisolatie en vloerisolatie",
  heating: "Cv-ketel",
  outdoorSpaceM2: 54,
  gardenOrientation: "Gelegen op het westen bereikbaar via achterom",
  parking: "Openbaar parkeren",
  storage: "Vrijstaande houten berging",
  ownership: "Volle eigendom",
  extraKenmerken: {
    "Aantal woonlagen": "2 woonlagen",
    "Soort dak": "Plat dak bedekt met bitumineuze dakbedekking",
    "Achtertuin": "54 m² (10,14 meter diep en 5,28 meter breed)",
    "Cv-ketel": "Intergas HR 107 (gas gestookt uit 2026, eigendom)",
    Inwoners: "1.770",
    "Gezin met kinderen": "25%",
    "Gem. vraagprijs / m²": "€ 3.402",
    "Kadastrale gegevens": "DORDRECHT R 260",
  },
};

test("listingKenmerkGroups shows all object facts and keeps Funda buurt stats out of Bouw", () => {
  const groups = listingKenmerkGroups(keteldiep);
  const labels = groups.flatMap((group) => group.rows.map((row) => row.label.toLowerCase()));
  assert.ok(groups.some((group) => group.key === "bouw"));
  assert.ok(labels.some((label) => label.includes("woonlagen") || label.includes("dak")));
  assert.ok(!labels.some((label) => /inwoners|gezin met kinderen|gem\.?\s*vraagprijs/.test(label)));
  assert.ok(groups.some((group) => group.key === "kadastraal"));
});

test("neighborhoodStatsFromListing parses Funda buurt numbers", () => {
  const stats = neighborhoodStatsFromListing(keteldiep);
  assert.equal(stats.inhabitants, 1770);
  assert.equal(stats.familySharePct, 25);
  assert.equal(stats.avgPricePerM2, 3402);
});

test("buyer costs for a 325k listing include transfer tax and own funds needed", () => {
  const costs = estimateBuyerCosts(325000, { ...DEFAULT_BUYER_PROFILE, ownFunds: 40000, budget: 325000 }, 325000);
  assert.ok(costs);
  assert.ok(costs.lines.some((line) => line.key === "transfer-tax" && line.amount > 0));
  assert.ok(costs.ownFundsNeeded > 0);
  assert.ok(costs.total + 325000 > 325000);
});

test("Keteldiep-like 325k house fits a typical income after buyer costs", () => {
  const state = defaultCalculatorState();
  state.applicant.monthlyGross = 5500;
  state.savings = 40000;
  state.nhg = true;
  const affordability = computePropertyAffordability({
    state,
    askingPrice: 325000,
    energyLabel: "B",
    nhg: true,
  });
  assert.equal(affordability.available, true);
  assert.ok(affordability.maxLoanForPurchase > 0);
  assert.ok(affordability.monthlyPayment > 0);
  assert.ok(["fits", "tight"].includes(affordability.fit));
  const costs = estimateBuyerCosts(325000, { ...DEFAULT_BUYER_PROFILE, ownFunds: 40000, budget: 325000, nhg: true }, affordability.maxLoanForPurchase);
  assert.ok(costs);
  if (!costs) return;
  assert.ok(costs.ownFundsNeeded > 0);
  assert.ok(affordability.ownFunds >= 40000 || affordability.ownFundsGap != null);
});
