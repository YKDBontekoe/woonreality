import { financieringslastPercentage } from "@/src/lib/mortgage/quotes";
import { incomeFromPerson } from "@/src/lib/mortgage/income";
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
  normalizeEnergyLabel,
  studentLoanGrossFactor,
  toetsrenteFor,
} from "@/src/lib/mortgage/norms-2026";
import type { MortgageCapacity, MortgageFinance, MortgageLine, MortgagePropertyContext, PersonFinance } from "@/src/lib/mortgage/types";

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

export function calculateMortgageCapacity(finance: MortgageFinance, property: MortgagePropertyContext = {}): MortgageCapacity {
  const applicantIncome = incomeFromPerson(finance.applicant);
  const partnerIncome = finance.partner ? incomeFromPerson(finance.partner) : 0;
  const toetsinkomen = applicantIncome + partnerIncome;
  const ownFunds = Math.max(0, property.ownFunds ?? 0);
  const askingPrice = Math.max(0, property.askingPrice ?? 0);
  const nhg = Boolean(property.nhg);
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
    maxPurchasePrice: 0,
    monthlyPayment: 0,
    monthlyPaymentToets: 0,
    energyBand: band,
    energyLabel: label,
    askingPrice,
    ownFunds,
    financingNeeded: 0,
    fit: "unknown",
    disclaimer: MORTGAGE_DISCLAIMER,
  };

  if (toetsinkomen <= 0) {
    return { ...empty, available: false, reason: "Vul minstens één inkomen in om de leenruimte te berekenen.", lines: [] };
  }

  const toetsrente = toetsrenteFor(finance.interestRate, finance.fixedPeriodYears);
  const reachedAow = aowForQuote(finance.applicant, finance.partner, applicantIncome, partnerIncome);
  const woonquote = financieringslastPercentage(toetsinkomen, toetsrente, reachedAow, true);
  const allowedBurden = toetsinkomen * woonquote;
  const studentFactor = studentLoanGrossFactor(toetsrente);
  const obligationBurden =
    Math.max(0, finance.studentLoanMonthly) * 12 * studentFactor +
    Math.max(0, finance.otherMonthlyDebts) * 12 +
    Math.max(0, finance.alimonyPaidMonthly) * 12;
  const remainingBurden = Math.max(0, allowedBurden - obligationBurden);
  const incomeLoan = roundEuro(maxPrincipalFromAnnualBurden(remainingBurden, toetsrente));

  const purchaseExtra = energyPurchaseExtra(band, finance.energyPerformanceGuarantee);
  const measureExtra = finance.includeEnergyMeasures ? energyMeasureExtra(band) : 0;
  const isSingle = !finance.partner;
  const singleThreshold = reachedAow ? AOW_SINGLE_INCOME_THRESHOLD : SINGLE_INCOME_THRESHOLD;
  const singleExtra = isSingle && !reachedAow && toetsinkomen > SINGLE_INCOME_THRESHOLD ? SINGLE_EXTRA
    : isSingle && reachedAow && toetsinkomen > singleThreshold ? SINGLE_EXTRA
    : 0;

  let maxLoanForPurchase = incomeLoan + purchaseExtra + singleExtra;
  let maxLoan = maxLoanForPurchase + measureExtra;
  if (nhg) {
    const cap = finance.includeEnergyMeasures ? NHG.energyLimit : NHG.limit;
    maxLoanForPurchase = Math.min(maxLoanForPurchase, NHG.limit);
    maxLoan = Math.min(maxLoan, cap);
  }

  const maxPurchasePrice = maxLoanForPurchase + ownFunds;
  const financingNeeded = askingPrice > 0 ? Math.max(0, askingPrice - ownFunds) : 0;
  let fit: MortgageCapacity["fit"] = "unknown";
  if (askingPrice > 0) {
    if (financingNeeded <= maxLoanForPurchase) fit = "fits";
    else if (financingNeeded <= maxLoanForPurchase * 1.06) fit = "tight";
    else fit = "over";
  }

  const displayLoan = askingPrice > 0 ? Math.min(financingNeeded || maxLoanForPurchase, maxLoan) : maxLoanForPurchase;
  const monthlyPayment = roundEuro(
    finance.repayment === "linear"
      ? linearFirstMonth(displayLoan, finance.interestRate)
      : annuityPayment(displayLoan, finance.interestRate),
  );
  const monthlyPaymentToets = roundEuro(annuityPayment(displayLoan, toetsrente));

  const lines: MortgageLine[] = [
    { key: "income", label: "Toetsinkomen", amount: roundEuro(toetsinkomen), note: partnerIncome > 0 ? `Jij ${euro(applicantIncome)} + partner ${euro(partnerIncome)} (tweede inkomen telt 100%).` : "Bruto toetsinkomen volgens de gekozen inkomensbronnen." },
    { key: "quote", label: `Woonquote ${(woonquote * 100).toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%`, amount: roundEuro(allowedBurden), note: `Bijlage 1 ${reachedAow ? "AOW" : "pre-AOW"}, toetsrente ${toetsrente.toLocaleString("nl-NL", { maximumFractionDigits: 2 })}%.` },
  ];
  if (obligationBurden > 0) {
    lines.push({ key: "debts", label: "Lasten (studieschuld, BKR, alimentatie)", amount: -roundEuro(obligationBurden), note: finance.studentLoanMonthly > 0 ? `Studieschuld gebruteerd met factor ${studentFactor.toLocaleString("nl-NL", { minimumFractionDigits: 2 })}.` : "Jaarlast van opgegeven verplichtingen." });
  }
  lines.push({ key: "income-loan", label: "Maximale hypotheek uit inkomen", amount: incomeLoan, note: `Annuïteit ${LOAN_TERM_YEARS} jaar op de toetsrente.` });
  if (singleExtra) lines.push({ key: "single", label: "Alleenstaandentoeslag", amount: singleExtra, note: `Buiten de financieringslast tot ${euro(SINGLE_EXTRA)} (art. 3 lid 8).` });
  if (purchaseExtra) lines.push({ key: "energy-buy", label: `Energielabel ${label ?? ""} extra`.trim(), amount: purchaseExtra, note: band === "apppp" && finance.energyPerformanceGuarantee ? `A++++ met energieprestatiegarantie: ${euro(ENERGY_GUARANTEE_EXTRA)}.` : "Extra leenruimte bij aankoop volgens de tabel 2026." });
  if (measureExtra) lines.push({ key: "energy-measures", label: "Extra voor verduurzaming", amount: measureExtra, note: "Alleen te gebruiken voor energiebesparende maatregelen; LTV tot 106%." });
  if (finance.fixedPeriodYears < 10 && toetsrente > finance.interestRate) {
    lines.push({ key: "toetsrente", label: "AFM-toetsrente", amount: 0, note: `Rentevast onder 10 jaar: getoetst tegen minimaal ${AFM_TOETSRENTE_FLOOR}%.` });
  }
  if (nhg) lines.push({ key: "nhg", label: "NHG-plafond", amount: finance.includeEnergyMeasures ? NHG.energyLimit : NHG.limit, note: `Kostengrens 2026 ${euro(NHG.limit)}${finance.includeEnergyMeasures ? `, met EBV ${euro(NHG.energyLimit)}` : ""}.` });
  lines.push({ key: "max-loan", label: "Maximale hypotheek", amount: roundEuro(maxLoan), note: "Som van inkomenslening en extra’s, na NHG-plafond." });
  lines.push({ key: "max-price", label: "Maximale koopsom", amount: roundEuro(maxPurchasePrice), note: ownFunds > 0 ? `Hypotheek voor aankoop ${euro(maxLoanForPurchase)} + eigen geld ${euro(ownFunds)}.` : "Zonder eigen geld is de maximale koopsom gelijk aan de maximale hypotheek (LTV 100%)." });

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
    maxPurchasePrice: roundEuro(maxPurchasePrice),
    monthlyPayment,
    monthlyPaymentToets,
    energyBand: band,
    energyLabel: label,
    askingPrice,
    ownFunds,
    financingNeeded: roundEuro(financingNeeded),
    fit,
    lines,
    disclaimer: MORTGAGE_DISCLAIMER,
  };
}
