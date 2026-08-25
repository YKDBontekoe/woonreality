import { estimateBuyerCosts } from "@/src/lib/costs";
import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import { formatLocaleTag } from "@/src/lib/format-locale";
import { financieringslastPercentage } from "@/src/lib/mortgage/quotes";
import { incomeFromPerson } from "@/src/lib/mortgage/income";
import { obligationAnnualTotal, obligationLines, ownFundsTotal } from "@/src/lib/mortgage/obligations";
import {
  AFM_TOETSRENTE_FLOOR,
  AOW_SINGLE_INCOME_THRESHOLD,
  ENERGY_GUARANTEE_EXTRA,
  LOAN_TERM_YEARS,
  MORTGAGE_NORMS_YEAR,
  NHG,
  SINGLE_EXTRA,
  SINGLE_INCOME_THRESHOLD,
  energyMeasureExtra,
  energyPurchaseExtra,
  isNhgEligible,
  nhgKostengrens,
  normalizeEnergyLabel,
  toetsrenteFor,
} from "@/src/lib/mortgage/norms-2026";
import { currentMortgageReference } from "@/src/lib/mortgage/reference";
import { annuityPayment, linearFirstMonth, maxPrincipalFromAnnualBurden } from "@/src/lib/mortgage/schedule";
import type { MortgageCapacity, MortgageFinance, MortgageLine, MortgageMarketSnapshot, MortgagePropertyContext, MortgageScenario, PersonFinance } from "@/src/lib/mortgage/types";

function roundEuro(value: number) {
  return Math.round(value);
}

function aowForQuote(applicant: PersonFinance, partner: PersonFinance | null, applicantIncome: number, partnerIncome: number) {
  if (!partner) return applicant.reachedAow;
  if (applicant.reachedAow === partner.reachedAow) return applicant.reachedAow;
  return (applicantIncome >= partnerIncome ? applicant : partner).reachedAow;
}

function intlTag(locale: Locale) {
  return formatLocaleTag(locale);
}

function costProfileFor(finance: MortgageFinance, ownFunds: number, nhg: boolean) {
  return {
    firstTimeBuyer: finance.starterExemption,
    buyerAge: finance.buyerAge || 32,
    selfOccupied: true,
    priorExemptionUsed: false,
    ownFunds,
    budget: Number.POSITIVE_INFINITY,
    nhg,
    energySavingMeasures: finance.includeEnergyMeasures,
  };
}

function solveInRange(
  affordableAt: (price: number) => boolean,
  low: number,
  high: number,
): number {
  if (high < low) return 0;
  if (affordableAt(high)) return high;
  // Cost cliffs sit on the threshold points we split on (e.g. NHG fee drops
  // the moment price exceeds the limit). If the left edge itself is
  // unaffordable, start just above it so the post-threshold interval is still searched.
  let left = low;
  if (!affordableAt(left)) {
    left = Math.min(high, low + 1);
    if (!affordableAt(left)) return 0;
  }
  let right = high;
  for (let i = 0; i < 60; i += 1) {
    const mid = (left + right) / 2;
    if (affordableAt(mid)) left = mid; else right = mid;
  }
  return left;
}

/**
 * Zoekt de hoogste koopsom waarbij de hypotheek (begrensd door
 * maxLoanForPurchase) plus het eigen geld de koopsom én de kosten koper
 * dekken. Overdrachtsbelasting kan bij de startersgrens en NHG-provisie bij
 * de kostengrens van drempel wisselen, dus dit is een numerieke zoektocht in
 * plaats van een enkele aftreksom — per interval tussen die drempels, omdat
 * estimateBuyerCosts daar niet-monotoon kan zijn.
 */
function solveMaxPurchasePriceAfterCosts(
  finance: MortgageFinance,
  maxLoanForPurchase: number,
  ownFunds: number,
  nhg: boolean,
): number {
  if (maxLoanForPurchase + ownFunds <= 0) return 0;
  const profile = costProfileFor(finance, ownFunds, nhg);
  const affordableAt = (price: number) => {
    if (price < 1) return true;
    const loan = Math.min(price, maxLoanForPurchase);
    const costs = estimateBuyerCosts(price, profile, loan);
    const cashForPrice = Math.max(0, price - loan);
    const needed = (costs?.total ?? 0) + cashForPrice;
    return needed <= ownFunds;
  };
  const ceiling = maxLoanForPurchase + ownFunds;
  const ref = currentMortgageReference();
  const thresholds = [
    0,
    ref.nhg.limit,
    ref.nhg.energyLimit,
    ref.transferTax.starterThreshold,
    ceiling,
  ].filter((value, index, all) => value >= 0 && value <= ceiling && all.indexOf(value) === index).sort((a, b) => a - b);

  let best = 0;
  for (let i = 0; i < thresholds.length - 1; i += 1) {
    const low = thresholds[i];
    const high = thresholds[i + 1];
    const candidate = solveInRange(affordableAt, low, high);
    if (candidate > best) best = candidate;
  }
  return roundEuro(best);
}

export function calculateMortgageCapacity(
  finance: MortgageFinance,
  property: MortgagePropertyContext = {},
  market?: MortgageMarketSnapshot,
  locale: Locale = "nl",
): MortgageCapacity {
  const t = getLibTranslator(locale, "lib-finance");
  const numTag = intlTag(locale);
  const euro = (value: number) => new Intl.NumberFormat(numTag, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(roundEuro(value));
  const nhg = Boolean(property.nhg);
  const applicantIncome = incomeFromPerson(finance.applicant, { nhg });
  const partnerIncome = finance.partner ? incomeFromPerson(finance.partner, { nhg }) : 0;
  const toetsinkomen = applicantIncome + partnerIncome;
  const ownFunds = property.ownFunds != null ? Math.max(0, property.ownFunds) : ownFundsTotal(finance);
  const askingPrice = Math.max(0, property.askingPrice ?? 0);
  const { band, label } = normalizeEnergyLabel(property.energyLabel);
  const empty: Omit<MortgageCapacity, "available" | "reason" | "lines"> = {
    year: MORTGAGE_NORMS_YEAR,
    toetsinkomen: 0,
    applicantIncome: 0,
    partnerIncome: 0,
    woonquote: 0,
    allowedBurden: 0,
    obligationBurden: 0,
    remainingBurden: 0,
    toetsrente: 0,
    marketRate: finance.interestRate,
    incomeLoan: 0,
    energyPurchaseExtra: 0,
    energyMeasureExtra: 0,
    singleExtra: 0,
    maxLoan: 0,
    maxLoanForPurchase: 0,
    uncappedMaxLoanForPurchase: 0,
    uncappedMaxLoan: 0,
    nhgApplies: false,
    nhgCapped: false,
    nhgLimit: null,
    maxPurchasePrice: 0,
    maxPurchasePriceAfterCosts: 0,
    monthlyPayment: 0,
    monthlyPaymentToets: 0,
    energyBand: band,
    energyLabel: label,
    askingPrice,
    ownFunds,
    financingNeeded: 0,
    buyerCosts: null,
    ownFundsGap: null,
    fit: "unknown",
    disclaimer: t("mortgage.disclaimer"),
  };

  if (toetsinkomen <= 0) {
    return { ...empty, available: false, reason: t("mortgage.capacity.noIncome"), lines: [] };
  }

  const toetsrente = toetsrenteFor(finance.interestRate, finance.fixedPeriodYears, market?.toetsrente.rate ?? AFM_TOETSRENTE_FLOOR);
  const reachedAow = aowForQuote(finance.applicant, finance.partner, applicantIncome, partnerIncome);
  const woonquote = financieringslastPercentage(toetsinkomen, toetsrente, reachedAow, true);
  const allowedBurden = toetsinkomen * woonquote;
  const debtLines = obligationLines(finance, toetsrente, locale);
  const obligationBurden = obligationAnnualTotal(finance, toetsrente, locale);
  const remainingBurden = Math.max(0, allowedBurden - obligationBurden);
  const incomeLoan = roundEuro(maxPrincipalFromAnnualBurden(remainingBurden, toetsrente));

  const purchaseExtra = energyPurchaseExtra(band, finance.energyPerformanceGuarantee);
  const measureExtra = finance.includeEnergyMeasures ? energyMeasureExtra(band) : 0;
  const isSingle = !finance.partner;
  const singleThreshold = reachedAow ? AOW_SINGLE_INCOME_THRESHOLD : SINGLE_INCOME_THRESHOLD;
  const singleExtra = isSingle && !reachedAow && toetsinkomen > SINGLE_INCOME_THRESHOLD ? SINGLE_EXTRA
    : isSingle && reachedAow && toetsinkomen > singleThreshold ? SINGLE_EXTRA
    : 0;

  const uncappedMaxLoanForPurchase = incomeLoan + purchaseExtra + singleExtra;
  const uncappedMaxLoan = uncappedMaxLoanForPurchase + measureExtra;
  const nhgLimit = nhgKostengrens(finance.includeEnergyMeasures);
  const nhgApplies = nhg && (askingPrice <= 0 || isNhgEligible(askingPrice, finance.includeEnergyMeasures));
  let maxLoanForPurchase = uncappedMaxLoanForPurchase;
  let maxLoan = uncappedMaxLoan;
  if (nhgApplies) {
    maxLoanForPurchase = Math.min(maxLoanForPurchase, NHG.limit);
    maxLoan = Math.min(maxLoan, nhgLimit);
  }
  const nhgCapped = nhgApplies && (uncappedMaxLoanForPurchase > NHG.limit || uncappedMaxLoan > nhgLimit);

  const maxPurchasePrice = maxLoanForPurchase + ownFunds;
  const maxPurchasePriceAfterCosts = solveMaxPurchasePriceAfterCosts(finance, maxLoanForPurchase, ownFunds, nhgApplies);
  const financingNeeded = askingPrice > 0 ? Math.max(0, askingPrice - ownFunds) : 0;
  // Cash-aware: "fits" pas als de hypotheekruimte én het eigen geld ná kosten
  // koper de vraagprijs dekken. Alleen naar de leenruimte kijken (zonder
  // kosten koper) laat "Past" zien terwijl de koper bij de notaris tekortkomt.
  let fit: MortgageCapacity["fit"] = "unknown";
  if (askingPrice > 0) {
    if (askingPrice <= maxPurchasePriceAfterCosts) fit = "fits";
    else if (askingPrice <= maxPurchasePriceAfterCosts * 1.06) fit = "tight";
    else fit = "over";
  }

  const displayLoan = askingPrice > 0 ? Math.min(financingNeeded, maxLoan) : maxLoanForPurchase;
  const monthlyPayment = roundEuro(
    finance.repayment === "linear"
      ? linearFirstMonth(displayLoan, finance.interestRate)
      : annuityPayment(displayLoan, finance.interestRate),
  );
  const monthlyPaymentToets = roundEuro(annuityPayment(displayLoan, toetsrente));

  const rateLabel = (value: number, fractionDigits: number) => value.toLocaleString(numTag, { maximumFractionDigits: fractionDigits });

  const lines: MortgageLine[] = [
    {
      key: "income",
      label: t("mortgage.capacity.income.label"),
      amount: roundEuro(toetsinkomen),
      note: partnerIncome > 0
        ? t("mortgage.capacity.income.notePartner", { applicant: euro(applicantIncome), partner: euro(partnerIncome) })
        : t("mortgage.capacity.income.noteSingle"),
    },
    {
      key: "quote",
      label: t("mortgage.capacity.quote.label", { quote: rateLabel(woonquote * 100, 1) }),
      amount: roundEuro(allowedBurden),
      note: reachedAow
        ? t("mortgage.capacity.quote.noteAow", { rate: rateLabel(toetsrente, 2) })
        : t("mortgage.capacity.quote.notePreAow", { rate: rateLabel(toetsrente, 2) }),
    },
    ...debtLines,
  ];
  lines.push({ key: "income-loan", label: t("mortgage.capacity.incomeLoan.label"), amount: incomeLoan, note: t("mortgage.capacity.incomeLoan.note", { years: LOAN_TERM_YEARS }) });
  if (singleExtra) lines.push({ key: "single", label: t("mortgage.capacity.singleExtra.label"), amount: singleExtra, note: t("mortgage.capacity.singleExtra.note", { amount: euro(SINGLE_EXTRA) }) });
  if (purchaseExtra) lines.push({
    key: "energy-buy",
    label: t("mortgage.capacity.energyPurchase.label", { label: label ?? "" }).trim(),
    amount: purchaseExtra,
    note: band === "apppp" && finance.energyPerformanceGuarantee
      ? t("mortgage.capacity.energyPurchase.noteGuarantee", { amount: euro(ENERGY_GUARANTEE_EXTRA) })
      : t("mortgage.capacity.energyPurchase.noteTable"),
  });
  if (measureExtra) lines.push({ key: "energy-measures", label: t("mortgage.capacity.energyMeasures.label"), amount: measureExtra, note: t("mortgage.capacity.energyMeasures.note") });
  if (finance.fixedPeriodYears < 10 && toetsrente > finance.interestRate) {
    lines.push({
      key: "toetsrente",
      label: t("mortgage.capacity.testRate.label"),
      amount: 0,
      note: t("mortgage.capacity.testRate.note", {
        rate: rateLabel(toetsrente, 2),
        basis: market?.toetsrente.live ? market.toetsrente.label : t("mortgage.capacity.testRate.floorBasis", { floor: AFM_TOETSRENTE_FLOOR }),
      }),
    });
  }
  if (nhgCapped) {
    lines.push({
      key: "nhg",
      label: t("mortgage.capacity.nhgCapped.label"),
      amount: roundEuro(maxLoanForPurchase),
      note: t("mortgage.capacity.nhgCapped.note", {
        room: euro(uncappedMaxLoanForPurchase),
        year: MORTGAGE_NORMS_YEAR,
        limit: euro(NHG.limit),
        ebv: finance.includeEnergyMeasures ? t("mortgage.capacity.nhgCapped.ebv", { limit: euro(NHG.energyLimit) }) : "",
      }),
    });
  } else if (nhgApplies) {
    lines.push({
      key: "nhg",
      label: t("mortgage.capacity.nhgApplies.label"),
      amount: 0,
      note: t("mortgage.capacity.nhgApplies.note", {
        year: MORTGAGE_NORMS_YEAR,
        limit: euro(NHG.limit),
        ebv: finance.includeEnergyMeasures ? t("mortgage.capacity.nhgApplies.ebv", { limit: euro(NHG.energyLimit) }) : "",
      }),
    });
  }
  lines.push({
    key: "max-loan",
    label: t("mortgage.capacity.maxLoan.label"),
    amount: roundEuro(maxLoanForPurchase),
    note: measureExtra > 0
      ? t("mortgage.capacity.maxLoan.noteWithMeasures", { measures: euro(measureExtra), total: euro(maxLoan) })
      : t("mortgage.capacity.maxLoan.notePlain"),
  });
  lines.push({
    key: "max-price",
    label: t("mortgage.capacity.maxPrice.label"),
    amount: roundEuro(maxPurchasePrice),
    note: ownFunds > 0
      ? t("mortgage.capacity.maxPrice.noteWithFunds", { loan: euro(maxLoanForPurchase), funds: euro(ownFunds) })
      : t("mortgage.capacity.maxPrice.noteNoFunds"),
  });
  lines.push({ key: "max-price-after-costs", label: t("mortgage.capacity.realBudget.label"), amount: roundEuro(maxPurchasePriceAfterCosts), note: t("mortgage.capacity.realBudget.note") });

  const costs = askingPrice > 0
    ? estimateBuyerCosts(askingPrice, {
      firstTimeBuyer: finance.starterExemption,
      buyerAge: finance.buyerAge || 32,
      selfOccupied: true,
      priorExemptionUsed: false,
      ownFunds,
      budget: askingPrice,
      nhg,
      energySavingMeasures: finance.includeEnergyMeasures,
    }, financingNeeded === 0 ? 0 : Math.min(askingPrice, maxLoanForPurchase), undefined, locale)
    : null;
  const buyerCosts = costs?.total ?? null;
  const ownFundsGap = costs && ownFunds >= 0 ? roundEuro(costs.ownFundsNeeded - ownFunds) : ownFunds > 0 && askingPrice > 0 ? roundEuro(financingNeeded - maxLoanForPurchase) : null;
  if (buyerCosts != null) {
    lines.push({ key: "costs", label: t("mortgage.capacity.buyerCosts.label"), amount: buyerCosts, note: t("mortgage.capacity.buyerCosts.note") });
  }
  if (ownFunds > 0) {
    const sourceParts = [
      finance.savings && t("mortgage.capacity.ownFunds.sources.savings"),
      finance.gift && t("mortgage.capacity.ownFunds.sources.gift"),
      finance.saleEquity && t("mortgage.capacity.ownFunds.sources.saleEquity"),
    ].filter(Boolean);
    lines.push({ key: "own-funds", label: t("mortgage.capacity.ownFunds.label"), amount: roundEuro(ownFunds), note: sourceParts.join(", ") || t("mortgage.capacity.ownFunds.noteFallback") });
  }
  if (ownFundsGap != null) {
    lines.push({
      key: "funds-gap",
      label: ownFundsGap > 0 ? t("mortgage.capacity.fundsGap.shortfallLabel") : t("mortgage.capacity.fundsGap.surplusLabel"),
      // `ownFundsGap` is signed for downstream affordability calculations:
      // negative means a surplus. A line labelled “Ruimte” must never show a
      // negative euro amount to a buyer.
      amount: ownFundsGap > 0 ? ownFundsGap : Math.abs(ownFundsGap),
      note: ownFundsGap > 0 ? t("mortgage.capacity.fundsGap.shortfallNote") : t("mortgage.capacity.fundsGap.surplusNote"),
    });
  }

  const selfEmployed = [...finance.applicant.sources, ...(finance.partner?.sources ?? [])].some((source) => source.kind === "self_employed" || source.kind === "dga");
  if (selfEmployed) {
    lines.push({ key: "ikv", label: t("mortgage.capacity.entrepreneur.label"), amount: 0, note: t("mortgage.capacity.entrepreneur.note") });
  }

  return {
    available: true,
    year: MORTGAGE_NORMS_YEAR,
    toetsinkomen: roundEuro(toetsinkomen),
    applicantIncome: roundEuro(applicantIncome),
    partnerIncome: roundEuro(partnerIncome),
    woonquote,
    allowedBurden: roundEuro(allowedBurden),
    obligationBurden: roundEuro(obligationBurden),
    remainingBurden: roundEuro(remainingBurden),
    toetsrente,
    marketRate: finance.interestRate,
    incomeLoan,
    energyPurchaseExtra: purchaseExtra,
    energyMeasureExtra: measureExtra,
    singleExtra,
    maxLoan: roundEuro(maxLoan),
    maxLoanForPurchase: roundEuro(maxLoanForPurchase),
    uncappedMaxLoanForPurchase: roundEuro(uncappedMaxLoanForPurchase),
    uncappedMaxLoan: roundEuro(uncappedMaxLoan),
    nhgApplies,
    nhgCapped,
    nhgLimit: nhgApplies ? nhgLimit : null,
    maxPurchasePrice: roundEuro(maxPurchasePrice),
    maxPurchasePriceAfterCosts: roundEuro(maxPurchasePriceAfterCosts),
    monthlyPayment,
    monthlyPaymentToets,
    energyBand: band,
    energyLabel: label,
    askingPrice,
    ownFunds,
    financingNeeded: roundEuro(financingNeeded),
    buyerCosts,
    ownFundsGap,
    fit,
    lines,
    disclaimer: t("mortgage.disclaimer"),
  };
}

function hasDebtObligations(finance: MortgageFinance) {
  return finance.privateLeaseMonthly > 0
    || finance.studentLoanMonthly > 0
    || finance.studentLoanRemaining > 0
    || finance.revolvingCreditLimit > 0
    || finance.installmentLoanMonthly > 0
    || finance.groundLeaseMonthly > 0
    || finance.alimonyPaidMonthly > 0
    || finance.otherMonthlyDebts > 0;
}

function clearDebts(finance: MortgageFinance): MortgageFinance {
  return {
    ...finance,
    privateLeaseMonthly: 0,
    studentLoanMonthly: 0,
    studentLoanRemaining: 0,
    revolvingCreditLimit: 0,
    installmentLoanMonthly: 0,
    groundLeaseMonthly: 0,
    alimonyPaidMonthly: 0,
    otherMonthlyDebts: 0,
  };
}

function pushScenario(
  scenarios: MortgageScenario[],
  id: string,
  label: string,
  baseline: number,
  finance: MortgageFinance,
  property: MortgagePropertyContext,
  market: MortgageMarketSnapshot | undefined,
  locale: Locale,
  note?: string,
) {
  const result = calculateMortgageCapacity(finance, property, market, locale);
  if (!result.available) return;
  scenarios.push({
    id,
    label,
    maxLoanForPurchase: result.maxLoanForPurchase,
    maxPurchasePrice: result.maxPurchasePrice,
    delta: result.maxLoanForPurchase - baseline,
    note,
  });
}

/** Gevoeligheidsschetsen t.o.v. de huidige inputs (geen advies). */
export function buildMortgageScenarios(
  finance: MortgageFinance,
  property: MortgagePropertyContext = {},
  market?: MortgageMarketSnapshot,
  locale: Locale = "nl",
): MortgageScenario[] {
  const t = getLibTranslator(locale, "lib-finance");
  const numTag = intlTag(locale);
  const baselineResult = calculateMortgageCapacity(finance, property, market, locale);
  if (!baselineResult.available) return [];

  const euro = (value: number) => new Intl.NumberFormat(numTag, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);

  const baseline = baselineResult.maxLoanForPurchase;
  const scenarios: MortgageScenario[] = [{
    id: "current",
    label: t("mortgage.scenarios.current"),
    maxLoanForPurchase: baseline,
    maxPurchasePrice: baselineResult.maxPurchasePrice,
    delta: 0,
  }];

  if (finance.privateLeaseMonthly > 0) {
    pushScenario(
      scenarios,
      "no-lease",
      t("mortgage.scenarios.noLeaseLabel"),
      baseline,
      { ...finance, privateLeaseMonthly: 0 },
      property,
      market,
      locale,
      t("mortgage.scenarios.noLeaseNote", { monthly: euro(finance.privateLeaseMonthly) }),
    );
  }

  if (hasDebtObligations(finance)) {
    pushScenario(
      scenarios,
      "no-debts",
      t("mortgage.scenarios.noDebtsLabel"),
      baseline,
      clearDebts(finance),
      property,
      market,
      locale,
    );
  }

  const currentLabel = (property.energyLabel ?? "").toUpperCase();
  for (const label of ["G", "C", "A", "A+++"] as const) {
    if (currentLabel === label) continue;
    pushScenario(
      scenarios,
      `energy-${label.toLowerCase()}`,
      t("mortgage.scenarios.energyLabel", { label }),
      baseline,
      finance,
      { ...property, energyLabel: label },
      market,
      locale,
    );
  }

  const rateDown = Math.max(0, Math.round((finance.interestRate - 0.5) * 100) / 100);
  const rateUp = Math.round((finance.interestRate + 0.5) * 100) / 100;
  if (rateDown !== finance.interestRate) {
    pushScenario(
      scenarios,
      "rate-down",
      t("mortgage.scenarios.rateDownLabel", { rate: rateDown.toLocaleString(numTag, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }),
      baseline,
      { ...finance, interestRate: rateDown },
      property,
      market,
      locale,
      t("mortgage.scenarios.rateDownNote"),
    );
  }
  pushScenario(
    scenarios,
    "rate-up",
    t("mortgage.scenarios.rateUpLabel", { rate: rateUp.toLocaleString(numTag, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }),
    baseline,
    { ...finance, interestRate: rateUp },
    property,
    market,
    locale,
    t("mortgage.scenarios.rateUpNote"),
  );

  const nhgOn = Boolean(property.nhg);
  pushScenario(
    scenarios,
    nhgOn ? "no-nhg" : "with-nhg",
    nhgOn ? t("mortgage.scenarios.nhgWithoutLabel") : t("mortgage.scenarios.nhgWithLabel"),
    baseline,
    finance,
    { ...property, nhg: !nhgOn },
    market,
    locale,
    nhgOn
      ? t("mortgage.scenarios.nhgWithoutNote", { year: MORTGAGE_NORMS_YEAR, limit: euro(NHG.limit) })
      : t("mortgage.scenarios.nhgWithNote", { limit: euro(NHG.limit), energyLimit: euro(NHG.energyLimit) }),
  );

  return scenarios;
}
