import assert from "node:assert/strict";
import test from "node:test";
import { estimateBuyerCosts, transferTaxRate } from "../src/lib/costs";
import { sampleRecordValid } from "../src/lib/sources/health";
import {
  buildMortgageSchedule,
  calculateMortgageCapacity,
  buildMortgageScenarios,
  currentReferenceYear,
  defaultEmploymentSource,
  defaultMortgageFinance,
  defaultSelfEmployedSource,
  emptyPerson,
  emptyTriple,
  eigenwoningforfait,
  financieringslastPercentage,
  housingDeductionRate,
  incomeFromSource,
  mortgageReferenceForYear,
  NHG,
  normalizeEnergyLabel,
  parseAfmToetsrente,
  parseCanonicalEnergyLabel,
  parseEcbMirObservation,
  parseEcbMirSeries,
  REVOLVING_MONTHLY_FACTOR,
  studentLoanGrossFactor,
  summarizeHousingTax,
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
  assert.equal(capped.maxLoanForPurchase, NHG.limit);
  assert.equal(capped.nhgApplies, true);
  assert.equal(capped.nhgCapped, true);
  assert.ok(capped.uncappedMaxLoanForPurchase > NHG.limit);
  assert.equal(capped.uncappedMaxLoanForPurchase, open.maxLoanForPurchase);
  assert.equal(capped.nhgLimit, NHG.limit);
});

test("buildMortgageScenarios shows lease, energy and NHG deltas", () => {
  const finance = withJob(60_000, { privateLeaseMonthly: 400 });
  const scenarios = buildMortgageScenarios(finance, { nhg: false, energyLabel: "G" });
  const byId = Object.fromEntries(scenarios.map((row) => [row.id, row]));
  assert.ok(byId.current);
  assert.equal(byId.current.delta, 0);
  assert.ok(byId["no-lease"]);
  assert.ok(byId["no-lease"].delta > 0);
  assert.ok(byId["no-debts"]);
  assert.equal(byId["no-debts"].maxLoanForPurchase, byId["no-lease"].maxLoanForPurchase);
  assert.ok(byId["energy-a"]);
  assert.equal(byId["energy-a"].delta, 10_000);
  assert.ok(byId["with-nhg"] || byId["no-nhg"]);
  assert.ok(byId["rate-up"]);
  assert.ok(byId["rate-down"]);

  const high = buildMortgageScenarios(withJob(200_000), { nhg: true });
  const withoutNhg = high.find((row) => row.id === "no-nhg");
  assert.ok(withoutNhg);
  assert.ok(withoutNhg.delta > 0);
  assert.equal(high.find((row) => row.id === "current")?.maxLoanForPurchase, NHG.limit);
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
    history: [],
  };
  const result = calculateMortgageCapacity({ ...withJob(60_000), interestRate: 3.5, fixedPeriodYears: 5 }, {}, market);
  assert.equal(result.toetsrente, 5.2);
});

test("NHG fee is added to buyer costs when NHG is selected under the limit", () => {
  const withNhg = estimateBuyerCosts(400_000, { firstTimeBuyer: false, ownFunds: 40_000, budget: 400_000, nhg: true }, 360_000);
  assert.ok(withNhg?.lines.some((line) => line.key === "nhg" && line.amount === Math.round(360_000 * 0.004)));
  const without = estimateBuyerCosts(400_000, { firstTimeBuyer: false, ownFunds: 40_000, budget: 400_000, nhg: false }, 360_000);
  assert.ok(without && !without.lines.some((line) => line.key === "nhg"));

  const cash = estimateBuyerCosts(400_000, { firstTimeBuyer: false, ownFunds: 400_000, budget: 400_000, nhg: true }, 0);
  assert.ok(cash && !cash.lines.some((line) => line.key === "nhg"));

  const ebv = estimateBuyerCosts(480_000, { firstTimeBuyer: false, ownFunds: 20_000, budget: 480_000, nhg: true, energySavingMeasures: true }, 480_000);
  assert.ok(ebv?.lines.some((line) => line.key === "nhg" && line.amount === Math.round(480_000 * NHG.feeRate)));
  const noEbv = estimateBuyerCosts(480_000, { firstTimeBuyer: false, ownFunds: 20_000, budget: 480_000, nhg: true }, 480_000);
  assert.ok(noEbv && !noEbv.lines.some((line) => line.key === "nhg"));

  const overLimit = estimateBuyerCosts(500_000, { firstTimeBuyer: false, ownFunds: 50_000, budget: 500_000, nhg: true }, 450_000);
  assert.ok(overLimit && !overLimit.lines.some((line) => line.key === "nhg"));
});

test("own funds are for buyer costs when the mortgage can cover the full price", () => {
  const fullLoan = estimateBuyerCosts(400_000, { firstTimeBuyer: false, ownFunds: 25_000, budget: 400_000, nhg: false }, 400_000);
  assert.ok(fullLoan);
  assert.equal(fullLoan.cashForPrice, 0);
  assert.equal(fullLoan.ownFundsNeeded, fullLoan.total);
  assert.ok(fullLoan.financingGap != null && fullLoan.financingGap < 0);

  const defaultLoan = estimateBuyerCosts(400_000, { firstTimeBuyer: false, ownFunds: 25_000, budget: 400_000, nhg: false });
  assert.ok(defaultLoan);
  assert.equal(defaultLoan.cashForPrice, 0);
  assert.equal(defaultLoan.ownFundsNeeded, defaultLoan.total);

  const partialLoan = estimateBuyerCosts(400_000, { firstTimeBuyer: false, ownFunds: 25_000, budget: 400_000, nhg: false }, 370_000);
  assert.ok(partialLoan);
  assert.equal(partialLoan.cashForPrice, 30_000);
  assert.equal(partialLoan.ownFundsNeeded, partialLoan.total + 30_000);
});

test("full-cash purchase keeps zero financing and skips the NHG fee", () => {
  const result = calculateMortgageCapacity(withJob(60_000, { savings: 250_000 }), { askingPrice: 200_000, nhg: true });
  assert.equal(result.financingNeeded, 0);
  const costs = estimateBuyerCosts(200_000, { firstTimeBuyer: false, ownFunds: 250_000, budget: 200_000, nhg: true }, 0);
  assert.ok(costs && !costs.lines.some((line) => line.key === "nhg"));
  assert.equal(result.buyerCosts, costs.total);
  assert.equal(result.ownFundsGap, Math.round(costs.ownFundsNeeded - 250_000));
});

test("NHG does not cap when the asking price is above the kostengrens", () => {
  const finance = withJob(200_000);
  const open = calculateMortgageCapacity(finance, { nhg: false, askingPrice: 500_000 });
  const selected = calculateMortgageCapacity(finance, { nhg: true, askingPrice: 500_000 });
  assert.ok(open.maxLoan > NHG.limit);
  assert.equal(selected.maxLoan, open.maxLoan);
  assert.ok(!selected.lines.some((line) => line.key === "nhg"));
});

test("NHG excludes entrepreneurial income under 12 months", () => {
  const young: IncomeSource = { ...defaultSelfEmployedSource(), monthsActive: 6, profits: [60_000, 50_000, 40_000] };
  assert.equal(incomeFromSource(young), 50_000);
  assert.equal(incomeFromSource(young, { nhg: true }), 0);

  const finance = withJob(40_000);
  finance.applicant.sources.push(young);
  assert.equal(calculateMortgageCapacity(finance).toetsinkomen, 40_000 + 50_000);
  assert.equal(calculateMortgageCapacity(finance, { nhg: true }).toetsinkomen, 40_000);
});

test("canonical energy labels reject display text such as Label C", () => {
  assert.equal(parseCanonicalEnergyLabel("C"), "C");
  assert.equal(parseCanonicalEnergyLabel("A++++"), "A++++");
  assert.equal(parseCanonicalEnergyLabel("Label C"), undefined);
});

test("ECB health samples require a valid MIR observation", () => {
  const ecb = { source: "ECB/DNB hypotheekrente", url: "https://data-api.ecb.europa.eu/service/data/MIR" };
  assert.equal(sampleRecordValid(ecb, '{"hello":true}'), false);
  const payload = {
    dataSets: [{ series: { "0:0": { observations: { "0": [3.74, 0, 0] } } } }],
    structure: { dimensions: { observation: [{ values: [{ id: "2026-06" }] }] } },
  };
  assert.equal(sampleRecordValid(ecb, JSON.stringify(payload)), true);
  assert.equal(sampleRecordValid({ source: "PDOK BAG", url: "https://api.pdok.nl/bag" }, '{"type":"FeatureCollection"}'), true);
});

test("reference layer selects 2026 until a newer table exists", () => {
  assert.equal(currentReferenceYear(new Date("2026-08-16")), 2026);
  assert.equal(mortgageReferenceForYear(2027).year, 2026);
  assert.equal(mortgageReferenceForYear(2026).transferTax.investorResidentialRate, 0.08);
  assert.equal(mortgageReferenceForYear(2026).box1.maxHousingDeductionRate, 0.3756);
});

test("buyer costs split notary and mark deductible financing lines", () => {
  const costs = estimateBuyerCosts(400_000, { firstTimeBuyer: false, ownFunds: 40_000, budget: 400_000, nhg: true }, 360_000);
  assert.ok(costs);
  assert.ok(costs.lines.some((line) => line.key === "notary-transfer" && !line.deductible));
  assert.ok(costs.lines.some((line) => line.key === "notary-mortgage" && line.deductible));
  assert.ok(costs.lines.some((line) => line.key === "kadaster-mortgage" && line.deductible && line.amount === 104));
  assert.ok(costs.deductibleTotal > 0);
  assert.ok(costs.nonDeductibleTotal > 0);
  assert.equal(costs.deductibleTotal + costs.nonDeductibleTotal, costs.total);

  const optionalOff = estimateBuyerCosts(400_000, { firstTimeBuyer: false, ownFunds: 40_000, budget: 400_000 }, 360_000, {
    includeAdvice: false,
    includeInspection: false,
  });
  assert.ok(optionalOff && !optionalOff.lines.some((line) => line.key === "advice" || line.key === "inspection"));

  const withAdvice = estimateBuyerCosts(400_000, { firstTimeBuyer: false, ownFunds: 40_000, budget: 400_000 }, 360_000, {
    includeAdvice: true,
  });
  assert.ok(withAdvice?.lines.some((line) => line.key === "advice" && line.deductible));
});

test("transfer tax supports investment and new-build v.o.n.", () => {
  const profile = { firstTimeBuyer: false, selfOccupied: true };
  assert.equal(transferTaxRate(profile, 400_000), 0.02);
  assert.equal(transferTaxRate(profile, 400_000, { investment: true }), 0.08);
  assert.equal(transferTaxRate(profile, 400_000, { newBuild: true }), 0);
  const newBuild = estimateBuyerCosts(400_000, { firstTimeBuyer: false, ownFunds: 40_000, budget: 400_000 }, 360_000, { newBuild: true });
  assert.ok(newBuild);
  assert.equal(newBuild.transferTaxRate, 0);
  assert.ok(!newBuild.lines.some((line) => line.key === "notary-transfer" && line.amount > 0));
  const investment = estimateBuyerCosts(400_000, { firstTimeBuyer: false, ownFunds: 40_000, budget: 400_000 }, 360_000, { investment: true });
  assert.equal(investment?.transferTaxRate, 0.08);
  assert.equal(investment?.lines.find((line) => line.key === "transfer-tax")?.amount, 32_000);
});

test("annuity and linear schedules amortize fully with lower linear total interest", () => {
  const annuity = buildMortgageSchedule(400_000, 4, "annuity");
  const linear = buildMortgageSchedule(400_000, 4, "linear");
  assert.equal(annuity.months.length, 360);
  assert.equal(linear.months.length, 360);
  assert.ok(annuity.months[annuity.months.length - 1].balance < 1);
  assert.ok(linear.months[linear.months.length - 1].balance < 1);
  assert.ok(linear.firstPayment > annuity.firstPayment);
  assert.ok(linear.totalInterest < annuity.totalInterest);
  assert.ok(Math.abs(annuity.firstPayment - 1909.66) < 1);
  assert.ok(Math.abs(linear.firstPayment - 2444.44) < 1);
});

test("housing tax caps deduction at schijf-2 rate and treats one-off costs in year 1", () => {
  assert.equal(housingDeductionRate(100_000), 0.3756);
  assert.equal(housingDeductionRate(30_000), 0.3575);
  assert.ok(eigenwoningforfait(400_000) > 0);
  const schedule = buildMortgageSchedule(400_000, 4, "annuity");
  const withOneOff = summarizeHousingTax({
    taxableIncome: 80_000,
    wozValue: 400_000,
    schedule,
    oneOffDeductibleCosts: 5_000,
  });
  const withoutOneOff = summarizeHousingTax({
    taxableIncome: 80_000,
    wozValue: 400_000,
    schedule,
    oneOffDeductibleCosts: 0,
  });
  assert.equal(withOneOff.deductionRate, 0.3756);
  assert.ok(withOneOff.year1.taxBenefit > withoutOneOff.year1.taxBenefit);
  assert.ok(withOneOff.year1.netMonthlyCost < withoutOneOff.year1.netMonthlyCost);
  assert.equal(withOneOff.year1.oneOffDeductible, 5_000);
  assert.ok(withOneOff.eigenwoningforfait > 0);
});

test("ECB MIR series parser reads multiple observations and keeps single-point payloads", () => {
  const seriesPayload = {
    dataSets: [{
      series: {
        "0:0": {
          observations: {
            "0": [2.1, 0, 0],
            "1": [3.0, 0, 0],
            "2": [3.74, 0, 0],
          },
        },
      },
    }],
    structure: {
      dimensions: {
        observation: [{
          values: [{ id: "2024-01" }, { id: "2025-01" }, { id: "2026-06" }],
        }],
      },
    },
  };
  const series = parseEcbMirSeries(seriesPayload);
  assert.ok(series);
  assert.equal(series.length, 3);
  assert.deepEqual(series[2], { month: "2026-06", rate: 3.74 });
  assert.deepEqual(parseEcbMirObservation(seriesPayload), { rate: 3.74, period: "2026-06" });

  const single = {
    dataSets: [{ series: { "0:0": { observations: { "0": [3.74, 0, 0] } } } }],
    structure: { dimensions: { observation: [{ values: [{ id: "2026-06" }] }] } },
  };
  assert.deepEqual(parseEcbMirObservation(single), { rate: 3.74, period: "2026-06" });
  assert.equal(parseEcbMirSeries(single)?.length, 1);
});
