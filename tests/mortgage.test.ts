import assert from "node:assert/strict";
import test from "node:test";
import { estimateBuyerCosts } from "../src/lib/costs";
import {
  calculateMortgageCapacity,
  defaultEmploymentSource,
  defaultMortgageFinance,
  defaultSelfEmployedSource,
  emptyPerson,
  emptyTriple,
  financieringslastPercentage,
  incomeFromSource,
  NHG,
  normalizeEnergyLabel,
  parseAfmToetsrente,
  parseEcbMirObservation,
  REVOLVING_MONTHLY_FACTOR,
  studentLoanGrossFactor,
  threeYearToetsinkomen,
  toetsrenteFor,
  buildSalaryBreakdown,
  HOLIDAY_PAY_RATE,
  type IncomeSource,
  type MortgageFinance,
  type MortgageMarketSnapshot,
} from "../src/lib/mortgage";

function withJob(grossAnnual: number, extras: Partial<MortgageFinance> = {}): MortgageFinance {
  const finance = defaultMortgageFinance(false);
  finance.interestRate = 4;
  finance.applicant = {
    reachedAow: false,
    sources: [{ ...defaultEmploymentSource(), grossAnnual }],
  };
  return { ...finance, ...extras, applicant: extras.applicant ?? finance.applicant };
}

test("woonquote lookup follows Bijlage 1 income and rate staffels", () => {
  assert.equal(financieringslastPercentage(60_000, 4, false), 0.226);
  assert.equal(financieringslastPercentage(80_000, 4, false), 0.253);
  assert.equal(financieringslastPercentage(50_000, 4, true), 0.286);
  assert.ok(financieringslastPercentage(200_000, 4, false) > 0.2);
});

test("toetsrente uses the AFM 5% floor below 10 years fixed", () => {
  assert.equal(toetsrenteFor(3.5, 10), 3.5);
  assert.equal(toetsrenteFor(3.5, 5), 5);
  assert.equal(toetsrenteFor(5.4, 5), 5.4);
});

test("three-year ondernemersinkomen is the average capped at last year", () => {
  assert.equal(threeYearToetsinkomen([80_000, 70_000, 60_000]), 70_000);
  assert.equal(threeYearToetsinkomen([50_000, 80_000, 80_000]), 50_000);
  assert.equal(threeYearToetsinkomen([90_000, 0, 0]), 30_000);
  assert.equal(threeYearToetsinkomen([0, 80_000, 80_000]), 0);
});

test("self-employed last-year loss counts as zero ondernemersinkomen", () => {
  const source: IncomeSource = { ...defaultSelfEmployedSource(), profits: [-12_000, 70_000, 65_000] };
  assert.equal(incomeFromSource(source), 0);
});

test("flex without perspectief uses the 3-year cap; intent uses current pay", () => {
  const flex: IncomeSource = {
    ...defaultEmploymentSource(),
    contract: "flex",
    grossAnnual: 55_000,
    history: [40_000, 38_000, 36_000],
    perspectief: false,
  };
  assert.equal(incomeFromSource(flex), 38_000);
  assert.equal(incomeFromSource({ ...flex, perspectief: true }), 55_000);
  assert.equal(incomeFromSource({ ...flex, contract: "temporary_intent", perspectief: false }), 55_000);
});

test("salary breakdown adds 8% holiday pay, 13th month and variable bonus cap", () => {
  const base = buildSalaryBreakdown({
    monthlyGross: 3_500,
    holidayMode: "standard",
    holidayCustom: 0,
    thirteenthMonth: 0,
    hasThirteenth: false,
    yearEndPayout: 0,
    monthlyAllowances: 0,
    structuralBonus: 0,
    variableBonus: [0, 0, 0],
  });
  assert.equal(HOLIDAY_PAY_RATE, 0.08);
  assert.equal(base.months, 42_000);
  assert.equal(base.holiday, 3_360);
  assert.equal(base.toetsinkomen, 45_360);

  const included = buildSalaryBreakdown({
    monthlyGross: 3_500,
    holidayMode: "included",
    holidayCustom: 0,
    thirteenthMonth: 0,
    hasThirteenth: false,
    yearEndPayout: 0,
    monthlyAllowances: 0,
    structuralBonus: 0,
    variableBonus: [0, 0, 0],
  });
  assert.equal(included.holiday, 0);
  assert.equal(included.toetsinkomen, 42_000);

  const withThirteenth = buildSalaryBreakdown({
    monthlyGross: 3_500,
    holidayMode: "standard",
    holidayCustom: 0,
    thirteenthMonth: 0,
    hasThirteenth: true,
    yearEndPayout: 0,
    monthlyAllowances: 200,
    structuralBonus: 1_000,
    variableBonus: [2_000, 8_000, 8_000],
  });
  assert.equal(withThirteenth.thirteenthMonth, 3_500);
  assert.equal(withThirteenth.allowances, 2_400);
  assert.equal(withThirteenth.variableBonus, 2_000);
  assert.equal(withThirteenth.toetsinkomen, 42_000 + 3_360 + 2_400 + 3_500 + 1_000 + 2_000);
});

test("partner income counts fully in the joint toetsinkomen", () => {
  const finance = withJob(40_000, {
    partner: { reachedAow: false, sources: [{ ...defaultEmploymentSource(), grossAnnual: 40_000 }] },
  });
  const result = calculateMortgageCapacity(finance);
  assert.equal(result.toetsinkomen, 80_000);
  assert.equal(result.woonquote, financieringslastPercentage(80_000, 4, false));
});

test("single extra is added only above the 2026 income threshold", () => {
  const low = calculateMortgageCapacity(withJob(28_000));
  const high = calculateMortgageCapacity(withJob(60_000));
  assert.equal(low.singleExtra, 0);
  assert.equal(high.singleExtra, 17_000);
  assert.equal(high.maxLoan, high.incomeLoan + 17_000);
});

test("energy label A adds 10k purchase extra versus G", () => {
  const g = calculateMortgageCapacity(withJob(60_000), { energyLabel: "G" });
  const a = calculateMortgageCapacity(withJob(60_000), { energyLabel: "A" });
  assert.equal(g.energyPurchaseExtra, 0);
  assert.equal(a.energyPurchaseExtra, 10_000);
  assert.equal(a.maxLoan - g.maxLoan, 10_000);
  assert.equal(normalizeEnergyLabel("A++++").band, "apppp");
  const guaranteed = calculateMortgageCapacity(
    { ...withJob(60_000), energyPerformanceGuarantee: true },
    { energyLabel: "A++++" },
  );
  assert.equal(guaranteed.energyPurchaseExtra, 40_000);
});

test("student loan is grossed up and lowers income-based loan", () => {
  assert.equal(studentLoanGrossFactor(4), 1.2);
  const clean = calculateMortgageCapacity(withJob(60_000));
  const debt = calculateMortgageCapacity(withJob(60_000, { studentLoanMonthly: 200 }));
  assert.ok(debt.incomeLoan < clean.incomeLoan);
  assert.equal(debt.obligationBurden, Math.round(200 * 12 * 1.2));
});

test("NHG caps the maximum loan at the 2026 kostengrens", () => {
  const finance = withJob(200_000);
  const open = calculateMortgageCapacity(finance, { nhg: false });
  const capped = calculateMortgageCapacity(finance, { nhg: true });
  assert.ok(open.maxLoan > NHG.limit);
  assert.equal(capped.maxLoan, NHG.limit);
});

test("mix of salary and winst stacks toetsinkomen", () => {
  const finance = withJob(40_000);
  finance.applicant.sources.push({ ...defaultSelfEmployedSource(), profits: [30_000, 24_000, 21_000] });
  const result = calculateMortgageCapacity(finance);
  assert.equal(result.toetsinkomen, 40_000 + 25_000);
});

test("capacity stays unavailable without income", () => {
  const result = calculateMortgageCapacity(defaultMortgageFinance());
  assert.equal(result.available, false);
  assert.equal(emptyPerson().sources.length, 0);
  assert.deepEqual(emptyTriple(), [0, 0, 0]);
});

test("asking price fit uses own funds and purchase extra", () => {
  const result = calculateMortgageCapacity(withJob(60_000), { askingPrice: 200_000, ownFunds: 50_000, energyLabel: "A" });
  assert.equal(result.financingNeeded, 150_000);
  assert.equal(result.fit, "fits");
  const over = calculateMortgageCapacity(withJob(28_000), { askingPrice: 900_000 });
  assert.equal(over.fit, "over");
});

test("private lease counts the full monthly contract as a BKR OA last", () => {
  const clean = calculateMortgageCapacity(withJob(60_000));
  const lease = calculateMortgageCapacity(withJob(60_000, { privateLeaseMonthly: 400 }));
  assert.equal(lease.obligationBurden, 400 * 12);
  assert.ok(lease.incomeLoan < clean.incomeLoan);
});

test("revolving credit is tested at 2% of the limit per month", () => {
  const result = calculateMortgageCapacity(withJob(60_000, { revolvingCreditLimit: 10_000 }));
  assert.equal(result.obligationBurden, Math.round(10_000 * REVOLVING_MONTHLY_FACTOR * 12));
});

test("spaargeld, schenking and overwaarde raise the max purchase price", () => {
  const none = calculateMortgageCapacity(withJob(60_000));
  const funded = calculateMortgageCapacity(withJob(60_000, { savings: 20_000, gift: 10_000, saleEquity: 20_000 }));
  assert.equal(funded.ownFunds, 50_000);
  assert.equal(funded.maxPurchasePrice, none.maxPurchasePrice + 50_000);
});

test("student remaining debt uses 0.35% SF35 when the DUO term is unknown", () => {
  const remaining = calculateMortgageCapacity(withJob(60_000, { studentLoanRemaining: 20_000, studentLoanSf35: true }));
  assert.equal(remaining.obligationBurden, Math.round(20_000 * 0.0035 * 12));
  const monthly = calculateMortgageCapacity(withJob(60_000, { studentLoanMonthly: 80, studentLoanRemaining: 20_000, studentLoanSf35: true }));
  assert.equal(monthly.obligationBurden, Math.round(80 * 12 * 1.2));
});

test("AFM HTML and ECB MIR parsers read official publications", () => {
  const html = "<p>De toetsrente voor het <strong>derde</strong> kwartaal van 2026 bedraagt 5%.</p>";
  assert.deepEqual(parseAfmToetsrente(html), { rate: 5, label: "derde kwartaal 2026", year: 2026 });
  const payload = {
    dataSets: [{ series: { "0:0": { observations: { "0": [3.74, 0, 0] } } } }],
    structure: { dimensions: { observation: [{ values: [{ id: "2026-06" }] }] } },
  };
  assert.deepEqual(parseEcbMirObservation(payload), { rate: 3.74, period: "2026-06" });
});

test("live AFM toetsrente can raise the floor below 10 years fixed", () => {
  const market: MortgageMarketSnapshot = {
    fetchedAt: "2026-08-15T00:00:00Z",
    toetsrente: { rate: 5.2, label: "testkwartaal", sourceUrl: "https://www.afm.nl", live: true },
    indicativeRates: {
      asOf: "2026-06",
      source: "test",
      sourceUrl: "https://data.ecb.europa.eu",
      live: false,
      byPeriod: {
        5: { nhg: 3, other: 3.2 },
        10: { nhg: 3, other: 3.2 },
        20: { nhg: 3, other: 3.2 },
        30: { nhg: 3, other: 3.2 },
      },
    },
  };
  const result = calculateMortgageCapacity({ ...withJob(60_000), interestRate: 3.5, fixedPeriodYears: 5 }, {}, market);
  assert.equal(result.toetsrente, 5.2);
});

test("NHG fee is added to buyer costs when NHG is selected under the limit", () => {
  const withNhg = estimateBuyerCosts(400_000, { firstTimeBuyer: false, ownFunds: 40_000, budget: 400_000, nhg: true }, 360_000);
  assert.ok(withNhg?.lines.some((line) => line.key === "nhg" && line.amount === Math.round(360_000 * 0.004)));
  const without = estimateBuyerCosts(400_000, { firstTimeBuyer: false, ownFunds: 40_000, budget: 400_000, nhg: false }, 360_000);
  assert.ok(without && !without.lines.some((line) => line.key === "nhg"));
});
