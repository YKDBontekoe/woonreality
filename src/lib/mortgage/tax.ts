import { currentMortgageReference, type MortgageReference } from "@/src/lib/mortgage/reference";
import type { MortgageSchedule } from "@/src/lib/mortgage/schedule";

export type HousingTaxInput = {
  taxableIncome: number;
  wozValue: number;
  schedule: MortgageSchedule;
  oneOffDeductibleCosts?: number;
  reference?: MortgageReference;
};

export type HousingTaxYear = {
  year: number;
  grossInterest: number;
  oneOffDeductible: number;
  eigenwoningforfait: number;
  hillenDeduction: number;
  netHousingIncome: number;
  deductionRate: number;
  taxBenefit: number;
  grossPayment: number;
  netMonthlyCost: number;
};

export type HousingTaxSummary = {
  referenceYear: number;
  deductionRate: number;
  eigenwoningforfait: number;
  year1: HousingTaxYear;
  ongoingMonthlyNet: number;
  ongoingMonthlyGross: number;
  /** Indicative tax back from one-off deductible financing costs (year 1). */
  oneOffRefund: number;
  disclaimer: string;
};

function roundEuro(value: number) {
  return Math.round(value);
}

function roundCents(value: number) {
  return Math.round(value * 100) / 100;
}

export function box1MarginalRate(taxableIncome: number, ref = currentMortgageReference()) {
  const income = Math.max(0, taxableIncome);
  for (const bracket of ref.box1.brackets) {
    if (income <= bracket.upTo) return bracket.rate;
  }
  return ref.box1.brackets[ref.box1.brackets.length - 1].rate;
}

/** Max rate for eigen-woning aftrek (tariefsaanpassing); not the top box-1 rate. */
export function housingDeductionRate(taxableIncome: number, ref = currentMortgageReference()) {
  const marginal = box1MarginalRate(taxableIncome, ref);
  return Math.min(marginal, ref.box1.maxHousingDeductionRate);
}

export function eigenwoningforfait(wozValue: number, ref = currentMortgageReference()) {
  const woz = Math.max(0, wozValue);
  if (woz <= 0) return 0;
  if (woz > ref.eigenwoningforfait.villaThreshold) {
    return ref.eigenwoningforfait.villaBase + (woz - ref.eigenwoningforfait.villaThreshold) * ref.eigenwoningforfait.villaRate;
  }
  for (const band of ref.eigenwoningforfait.bands) {
    if (woz <= band.upTo) return woz * band.rate;
  }
  return woz * 0.0035;
}

export function housingTaxForYear(params: {
  grossInterest: number;
  oneOffDeductible: number;
  forfait: number;
  hillenRate: number;
  deductionRate: number;
  grossPayment: number;
  year: number;
}): HousingTaxYear {
  const deductibleCosts = Math.max(0, params.grossInterest) + Math.max(0, params.oneOffDeductible);
  const gap = params.forfait - deductibleCosts;
  const hillenDeduction = gap > 0 ? gap * params.hillenRate : 0;
  const netHousingIncome = params.forfait - deductibleCosts - hillenDeduction;
  const taxBenefit = netHousingIncome < 0 ? Math.abs(netHousingIncome) * params.deductionRate : 0;
  const netAnnual = Math.max(0, params.grossPayment) - taxBenefit;
  return {
    year: params.year,
    grossInterest: roundEuro(params.grossInterest),
    oneOffDeductible: roundEuro(params.oneOffDeductible),
    eigenwoningforfait: roundEuro(params.forfait),
    hillenDeduction: roundEuro(hillenDeduction),
    netHousingIncome: roundEuro(netHousingIncome),
    deductionRate: params.deductionRate,
    taxBenefit: roundEuro(taxBenefit),
    grossPayment: roundEuro(params.grossPayment),
    netMonthlyCost: roundEuro(netAnnual / 12),
  };
}

export function summarizeHousingTax(input: HousingTaxInput): HousingTaxSummary {
  const ref = input.reference ?? currentMortgageReference();
  const deductionRate = housingDeductionRate(input.taxableIncome, ref);
  const forfait = eigenwoningforfait(input.wozValue, ref);
  const year1Schedule = input.schedule.years[0];
  const year1Interest = year1Schedule?.interest ?? 0;
  const year1Payment = year1Schedule?.payment ?? input.schedule.firstPayment * 12;
  const oneOff = Math.max(0, input.oneOffDeductibleCosts ?? 0);

  const year1 = housingTaxForYear({
    year: 1,
    grossInterest: year1Interest,
    oneOffDeductible: oneOff,
    forfait,
    hillenRate: ref.hillenRate,
    deductionRate,
    grossPayment: year1Payment,
  });

  const ongoingInterest = year1Interest;
  const ongoingPayment = year1Payment;
  const ongoing = housingTaxForYear({
    year: 1,
    grossInterest: ongoingInterest,
    oneOffDeductible: 0,
    forfait,
    hillenRate: ref.hillenRate,
    deductionRate,
    grossPayment: ongoingPayment,
  });

  return {
    referenceYear: ref.year,
    deductionRate,
    eigenwoningforfait: roundEuro(forfait),
    year1,
    ongoingMonthlyNet: ongoing.netMonthlyCost,
    ongoingMonthlyGross: roundEuro(ongoingPayment / 12),
    oneOffRefund: deductionRefund(oneOff, deductionRate),
    disclaimer: `Hypotheekrenteaftrek-schets ${ref.year}: max aftrektarief ${(ref.box1.maxHousingDeductionRate * 100).toLocaleString("nl-NL", { maximumFractionDigits: 2 })}%, inclusief eigenwoningforfait. Geen aangifteadvies.`,
  };
}

export function deductionRefund(amount: number, rate: number) {
  return Math.round(Math.max(0, amount) * Math.max(0, rate));
}

export function formatDeductionRate(rate: number) {
  return `${roundCents(rate * 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}
