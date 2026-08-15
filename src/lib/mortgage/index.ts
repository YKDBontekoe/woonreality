import { indicativeRate } from "@/src/lib/mortgage/norms-2026";
import { emptyPerson } from "@/src/lib/mortgage/income";
import type { MortgageFinance } from "@/src/lib/mortgage/types";

export { calculateMortgageCapacity } from "@/src/lib/mortgage/capacity";
export { financieringslastPercentage, WOONQUOTE_SOURCE } from "@/src/lib/mortgage/quotes";
export {
  AFM_TOETSRENTE_FLOOR,
  INDICATIVE_RATES,
  MORTGAGE_DISCLAIMER,
  MORTGAGE_NORMS_YEAR,
  MORTGAGE_SOURCE,
  NHG,
  energyMeasureExtra,
  energyPurchaseExtra,
  indicativeRate,
  normalizeEnergyLabel,
  studentLoanGrossFactor,
  toetsrenteFor,
} from "@/src/lib/mortgage/norms-2026";
export {
  defaultDgaSource,
  defaultEmploymentSource,
  defaultPensionSource,
  defaultSelfEmployedSource,
  emptyPerson,
  emptyTriple,
  incomeFromPerson,
  incomeFromSource,
  threeYearToetsinkomen,
} from "@/src/lib/mortgage/income";
export type {
  EmploymentContract,
  EnergyBand,
  FixedPeriodYears,
  IncomeSource,
  MortgageCapacity,
  MortgageFinance,
  MortgageLine,
  MortgagePropertyContext,
  PersonFinance,
  RepaymentType,
  WorkType,
  YearTriple,
} from "@/src/lib/mortgage/types";

export function defaultMortgageFinance(nhg = false): MortgageFinance {
  return {
    applicant: emptyPerson(),
    partner: null,
    studentLoanMonthly: 0,
    otherMonthlyDebts: 0,
    alimonyPaidMonthly: 0,
    interestRate: indicativeRate(10, nhg),
    fixedPeriodYears: 10,
    repayment: "annuity",
    energyPerformanceGuarantee: false,
    includeEnergyMeasures: false,
  };
}
