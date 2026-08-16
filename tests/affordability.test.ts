import assert from "node:assert/strict";
import test from "node:test";
import {
  affordabilitySummary,
  computePropertyAffordability,
  energyLabelFromAnalysis,
  fitLabel,
  fitSortRank,
} from "../src/lib/affordability";
import {
  buyerProfileFromMortgageCapacity,
  calculatorStateToFinance,
  defaultCalculatorState,
  mortgageStateHasCapacity,
  restoreCalculatorState,
} from "../src/lib/mortgage/calculator-state";
import { calculateMortgageCapacity } from "../src/lib/mortgage/capacity";
import { DEFAULT_BUYER_PROFILE } from "../src/lib/purchase";
import { buyerProfileSchema, mortgageStateSchema, workspaceBodySchema } from "../src/lib/validation/workspace";

function withIncome(monthlyGross = 5_500) {
  const state = defaultCalculatorState();
  state.applicant.monthlyGross = monthlyGross;
  state.savings = 80_000;
  state.nhg = true;
  state.buyerAge = 32;
  state.starterExemption = true;
  return state;
}

test("mortgage state restores and maps to finance", () => {
  const state = withIncome();
  const restored = restoreCalculatorState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.applicant.monthlyGross, 5_500);
  assert.equal(mortgageStateHasCapacity(restored), true);
  const finance = calculatorStateToFinance(restored);
  assert.equal(finance.savings, 80_000);
  assert.ok(finance.applicant.sources.length > 0);
});

test("capacity sync updates buyer profile budget fields", () => {
  const state = withIncome();
  const capacity = calculateMortgageCapacity(calculatorStateToFinance(state), { nhg: true });
  assert.equal(capacity.available, true);
  const next = buyerProfileFromMortgageCapacity(DEFAULT_BUYER_PROFILE, capacity, state);
  // Koopbudget wordt gezet op de koopsom ná kosten koper, niet op de bruto
  // hypotheek + eigen geld — anders belooft het profiel geld dat bij de
  // notaris al op is.
  assert.equal(next.budget, capacity.maxPurchasePriceAfterCosts);
  assert.ok(next.budget < capacity.maxPurchasePrice);
  assert.equal(next.monthlyPayment, capacity.monthlyPayment);
  assert.equal(next.ownFunds, capacity.ownFunds);
  assert.equal(next.nhg, true);
  assert.equal(next.buyerAge, 32);
  assert.equal(next.searchArea, DEFAULT_BUYER_PROFILE.searchArea);
});

test("affordability marks fits/tight/over and renovation buffer", () => {
  const state = withIncome(6_500);
  const finance = calculatorStateToFinance(state);
  const capacity = calculateMortgageCapacity(finance, { nhg: true, energyLabel: "A" });
  assert.ok(capacity.maxPurchasePrice > 100_000);

  const fits = computePropertyAffordability({
    finance,
    askingPrice: Math.max(100_000, capacity.maxPurchasePrice - 50_000),
    energyLabel: "A",
    nhg: true,
  });
  assert.equal(fits.fit, "fits");
  assert.ok((fits.purchaseHeadroom ?? 0) > 0);
  assert.equal(fitSortRank("fits"), 0);

  const over = computePropertyAffordability({
    finance,
    askingPrice: capacity.maxPurchasePrice + 250_000,
    energyLabel: "A",
    nhg: true,
  });
  assert.ok(over.fit === "over" || over.fit === "tight");
  assert.ok((over.purchaseHeadroom ?? 0) < 0);

  const summary = affordabilitySummary({
    fit: "fits",
    askingPrice: 400_000,
    maxPurchasePrice: 500_000,
    purchaseHeadroom: 100_000,
    renovationBuffer: 25_000,
    ownFundsGap: -25_000,
    energyMeasureExtra: 0,
  });
  assert.match(summary, /verbouwing|Koopruimte|past/i);
  assert.equal(fitLabel("tight"), "Krap");
});

test("energy label is read from analysis signal", () => {
  assert.equal(energyLabelFromAnalysis({ signals: [{ key: "energy", value: "B" }] }), "B");
  assert.equal(energyLabelFromAnalysis({ signals: [{ key: "energy", value: "Geen data" }] }), null);
});

test("workspace mortgage action validates calculator state", () => {
  const state = withIncome();
  assert.equal(mortgageStateSchema.safeParse(state).success, true);
  assert.equal(workspaceBodySchema.safeParse({ action: "mortgage", mortgageState: state }).success, true);
  assert.equal(workspaceBodySchema.safeParse({ action: "mortgage", mortgageState: { ...state, unexpected: true } }).success, false);
  assert.equal(workspaceBodySchema.safeParse({ action: "listingPrice", bagVboId: "0232010000003562", askingPrice: 425000 }).success, true);
  assert.equal(buyerProfileSchema.safeParse(DEFAULT_BUYER_PROFILE).success, true);
});
