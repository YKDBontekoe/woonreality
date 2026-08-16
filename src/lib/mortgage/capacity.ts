import { estimateBuyerCosts } from "@/src/lib/costs";
import { financieringslastPercentage } from "@/src/lib/mortgage/quotes";
import { incomeFromPerson } from "@/src/lib/mortgage/income";
import { obligationAnnualTotal, obligationLines, ownFundsTotal } from "@/src/lib/mortgage/obligations";
import {
  AFM_TOETSRENTE_FLOOR,
  AOW_SINGLE_INCOME_THRESHOLD,
  ENERGY_GUARANTEE_EXTRA,
  LOAN_TERM_YEARS,
  MORTGAGE_DISCLAIMER,
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
import type { MortgageCapacity, MortgageFinance, MortgageLine, MortgageMarketSnapshot, MortgagePropertyContext, MortgageScenario, PersonFinance } from "@/src/lib/mortgage/types";

function roundEuro(value: number) {
  return Math.round(value);
}

function annuityPayment(principal: number, annualRatePercent: number, years = LOAN_TERM_YEARS) {
  const n = years * 12;
  const monthly = (annualRatePercent / 100) / 12;
  if (principal <= 0) return 0;
  if (monthly <= 0) return principal / n;
  return principal * monthly * ((1 + monthly) ** n) / (((1 + monthly) ** n) - 1);
}

function maxPrincipalFromAnnualBurden(annualBurden: number, annualRatePercent: number, years = LOAN_TERM_YEARS) {
  const monthlyPayment = Math.max(0, annualBurden) / 12;
  const n = years * 12;
  const monthly = (annualRatePercent / 100) / 12;
  if (monthlyPayment <= 0) return 0;
  if (monthly <= 0) return monthlyPayment * n;
  return monthlyPayment * (((1 + monthly) ** n) - 1) / (monthly * ((1 + monthly) ** n));
}

function linearFirstMonth(principal: number, annualRatePercent: number, years = LOAN_TERM_YEARS) {
  const n = years * 12;
  const monthly = (annualRatePercent / 100) / 12;
  if (principal <= 0) return 0;
  return principal / n + principal * monthly;
}

function aowForQuote(applicant: PersonFinance, partner: PersonFinance | null, applicantIncome: number, partnerIncome: number) {
  if (!partner) return applicant.reachedAow;
  if (applicant.reachedAow === partner.reachedAow) return applicant.reachedAow;
  return (applicantIncome >= partnerIncome ? applicant : partner).reachedAow;
}

function euro(value: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(roundEuro(value));
}

export function calculateMortgageCapacity(finance: MortgageFinance, property: MortgagePropertyContext = {}, market?: MortgageMarketSnapshot): MortgageCapacity {
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
    disclaimer: MORTGAGE_DISCLAIMER,
  };

  if (toetsinkomen <= 0) {
    return { ...empty, available: false, reason: "Vul minstens één inkomen in om de leenruimte te berekenen.", lines: [] };
  }

  const toetsrente = toetsrenteFor(finance.interestRate, finance.fixedPeriodYears, market?.toetsrente.rate ?? AFM_TOETSRENTE_FLOOR);
  const reachedAow = aowForQuote(finance.applicant, finance.partner, applicantIncome, partnerIncome);
  const woonquote = financieringslastPercentage(toetsinkomen, toetsrente, reachedAow, true);
  const allowedBurden = toetsinkomen * woonquote;
  const debtLines = obligationLines(finance, toetsrente);
  const obligationBurden = obligationAnnualTotal(finance, toetsrente);
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
  const financingNeeded = askingPrice > 0 ? Math.max(0, askingPrice - ownFunds) : 0;
  let fit: MortgageCapacity["fit"] = "unknown";
  if (askingPrice > 0) {
    if (financingNeeded <= maxLoanForPurchase) fit = "fits";
    else if (financingNeeded <= maxLoanForPurchase * 1.06) fit = "tight";
    else fit = "over";
  }

  const displayLoan = askingPrice > 0 ? Math.min(financingNeeded, maxLoan) : maxLoanForPurchase;
  const monthlyPayment = roundEuro(
    finance.repayment === "linear"
      ? linearFirstMonth(displayLoan, finance.interestRate)
      : annuityPayment(displayLoan, finance.interestRate),
  );
  const monthlyPaymentToets = roundEuro(annuityPayment(displayLoan, toetsrente));

  const lines: MortgageLine[] = [
    { key: "income", label: "Toetsinkomen", amount: roundEuro(toetsinkomen), note: partnerIncome > 0 ? `Jij ${euro(applicantIncome)} + partner ${euro(partnerIncome)} (tweede inkomen telt 100%).` : "Bruto toetsinkomen volgens de gekozen inkomensbronnen." },
    { key: "quote", label: `Woonquote ${(woonquote * 100).toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%`, amount: roundEuro(allowedBurden), note: `Bijlage 1 ${reachedAow ? "AOW" : "pre-AOW"}, toetsrente ${toetsrente.toLocaleString("nl-NL", { maximumFractionDigits: 2 })}%.` },
    ...debtLines,
  ];
  lines.push({ key: "income-loan", label: "Maximale hypotheek uit inkomen", amount: incomeLoan, note: `Annuïteit ${LOAN_TERM_YEARS} jaar op de toetsrente.` });
  if (singleExtra) lines.push({ key: "single", label: "Alleenstaandentoeslag", amount: singleExtra, note: `Buiten de financieringslast tot ${euro(SINGLE_EXTRA)} (art. 3 lid 8).` });
  if (purchaseExtra) lines.push({ key: "energy-buy", label: `Energielabel ${label ?? ""} extra`.trim(), amount: purchaseExtra, note: band === "apppp" && finance.energyPerformanceGuarantee ? `A++++ met energieprestatiegarantie: ${euro(ENERGY_GUARANTEE_EXTRA)}.` : "Extra leenruimte bij aankoop volgens de tabel 2026." });
  if (measureExtra) lines.push({ key: "energy-measures", label: "Extra voor verduurzaming", amount: measureExtra, note: "Alleen te gebruiken voor energiebesparende maatregelen; LTV tot 106%." });
  if (finance.fixedPeriodYears < 10 && toetsrente > finance.interestRate) {
    lines.push({ key: "toetsrente", label: "AFM-toetsrente", amount: 0, note: `Rentevast onder 10 jaar: getoetst tegen ${toetsrente.toLocaleString("nl-NL", { maximumFractionDigits: 2 })}% (${market?.toetsrente.live ? market.toetsrente.label : `minimaal ${AFM_TOETSRENTE_FLOOR}%`}).` });
  }
  if (nhgCapped) {
    lines.push({
      key: "nhg",
      label: "NHG-plafond",
      amount: roundEuro(maxLoanForPurchase),
      note: `Inkomensruimte ${euro(uncappedMaxLoanForPurchase)} begrensd tot kostengrens 2026 ${euro(NHG.limit)}${finance.includeEnergyMeasures ? ` (met EBV tot ${euro(NHG.energyLimit)})` : ""}.`,
    });
  } else if (nhgApplies) {
    lines.push({ key: "nhg", label: "NHG van toepassing", amount: 0, note: `Onder de kostengrens 2026 ${euro(NHG.limit)}${finance.includeEnergyMeasures ? `, met EBV ${euro(NHG.energyLimit)}` : ""}.` });
  }
  lines.push({ key: "max-loan", label: "Maximale hypotheek voor aankoop", amount: roundEuro(maxLoanForPurchase), note: measureExtra > 0 ? `Plus ${euro(measureExtra)} alleen voor verduurzaming (totaal ${euro(maxLoan)}).` : "Som van inkomenslening en aankoopextra’s, na eventueel NHG-plafond." });
  lines.push({ key: "max-price", label: "Maximale koopsom", amount: roundEuro(maxPurchasePrice), note: ownFunds > 0 ? `Hypotheek voor aankoop ${euro(maxLoanForPurchase)} + eigen geld ${euro(ownFunds)}.` : "Zonder eigen geld is de maximale koopsom gelijk aan de maximale hypotheek (LTV 100%)." });

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
    }, Math.min(financingNeeded, maxLoanForPurchase))
    : null;
  const buyerCosts = costs?.total ?? null;
  const ownFundsGap = costs && ownFunds >= 0 ? roundEuro(costs.ownFundsNeeded - ownFunds) : ownFunds > 0 && askingPrice > 0 ? roundEuro(financingNeeded - maxLoanForPurchase) : null;
  if (buyerCosts != null) {
    lines.push({ key: "costs", label: "Kosten koper (indicatie)", amount: buyerCosts, note: "Notaris, taxatie, keuring, kadaster en overdrachtsbelasting. NHG-provisie indien van toepassing." });
  }
  if (ownFunds > 0) {
    lines.push({ key: "own-funds", label: "Eigen geld", amount: roundEuro(ownFunds), note: [finance.savings && "spaargeld", finance.gift && "schenking", finance.saleEquity && "overwaarde"].filter(Boolean).join(", ") || "Inleg voor koopsom en kosten koper." });
  }
  if (ownFundsGap != null) {
    lines.push({
      key: "funds-gap",
      label: ownFundsGap > 0 ? "Tekort eigen geld" : "Ruimte in eigen geld",
      amount: ownFundsGap,
      note: ownFundsGap > 0 ? "Vraagprijs plus kosten koper vragen meer inleg dan je nu opgeeft." : "Je inleg dekt de koopsom (na hypotheek) en de indicatieve kosten koper.",
    });
  }

  const selfEmployed = [...finance.applicant.sources, ...(finance.partner?.sources ?? [])].some((source) => source.kind === "self_employed" || source.kind === "dga");
  if (selfEmployed) {
    lines.push({ key: "ikv", label: "Ondernemer", amount: 0, note: "Toetsinkomen = 3-jaarsgemiddelde, gemaximeerd op het laatste jaar (NHG IKV). De bank vraagt meestal een Inkomensverklaring Ondernemer." });
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
    disclaimer: MORTGAGE_DISCLAIMER,
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
  note?: string,
) {
  const result = calculateMortgageCapacity(finance, property, market);
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
): MortgageScenario[] {
  const baselineResult = calculateMortgageCapacity(finance, property, market);
  if (!baselineResult.available) return [];

  const baseline = baselineResult.maxLoanForPurchase;
  const scenarios: MortgageScenario[] = [{
    id: "current",
    label: "Huidige situatie",
    maxLoanForPurchase: baseline,
    maxPurchasePrice: baselineResult.maxPurchasePrice,
    delta: 0,
  }];

  if (finance.privateLeaseMonthly > 0) {
    pushScenario(
      scenarios,
      "no-lease",
      "Zonder private lease",
      baseline,
      { ...finance, privateLeaseMonthly: 0 },
      property,
      market,
      `Nu ${euro(finance.privateLeaseMonthly)} per maand in de toets.`,
    );
  }

  if (hasDebtObligations(finance)) {
    pushScenario(
      scenarios,
      "no-debts",
      "Zonder schulden of vaste lasten",
      baseline,
      clearDebts(finance),
      property,
      market,
    );
  }

  const currentLabel = (property.energyLabel ?? "").toUpperCase();
  for (const label of ["G", "C", "A", "A+++"] as const) {
    if (currentLabel === label) continue;
    pushScenario(
      scenarios,
      `energy-${label.toLowerCase()}`,
      `Energielabel ${label}`,
      baseline,
      finance,
      { ...property, energyLabel: label },
      market,
    );
  }

  const rateDown = Math.max(0, Math.round((finance.interestRate - 0.5) * 100) / 100);
  const rateUp = Math.round((finance.interestRate + 0.5) * 100) / 100;
  if (rateDown !== finance.interestRate) {
    pushScenario(
      scenarios,
      "rate-down",
      `Rente ${rateDown.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`,
      baseline,
      { ...finance, interestRate: rateDown },
      property,
      market,
      "Halve procent lager dan je huidige toetsrente-input.",
    );
  }
  pushScenario(
    scenarios,
    "rate-up",
    `Rente ${rateUp.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`,
    baseline,
    { ...finance, interestRate: rateUp },
    property,
    market,
    "Halve procent hoger dan je huidige toetsrente-input.",
  );

  const nhgOn = Boolean(property.nhg);
  pushScenario(
    scenarios,
    nhgOn ? "no-nhg" : "with-nhg",
    nhgOn ? "Zonder NHG-plafond" : "Met NHG-plafond",
    baseline,
    finance,
    { ...property, nhg: !nhgOn },
    market,
    nhgOn
      ? `Kostengrens 2026 ${euro(NHG.limit)}; inkomensruimte kan hoger liggen.`
      : `Begrenst op ${euro(NHG.limit)} (of ${euro(NHG.energyLimit)} met EBV).`,
  );

  return scenarios;
}
