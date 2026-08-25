import { indicativeRate } from "@/src/lib/mortgage/norms-2026";
import { emptyPerson } from "@/src/lib/mortgage/income";
import type { MortgageFinance } from "@/src/lib/mortgage/types";

export { calculateMortgageCapacity, buildMortgageScenarios } from "@/src/lib/mortgage/capacity";
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
  isNhgEligible,
  nhgKostengrens,
  normalizeEnergyLabel,
  studentLoanGrossFactor,
  toetsrenteFor,
} from "@/src/lib/mortgage/norms-2026";
export {
  currentMortgageReference,
  currentReferenceYear,
  mortgageReferenceForYear,
  mortgageReferences,
} from "@/src/lib/mortgage/reference";
export type { MortgageReference } from "@/src/lib/mortgage/reference";
export {
  annuityPayment,
  buildMortgageSchedule,
  linearFirstMonth,
  maxPrincipalFromAnnualBurden,
  rateImpactRows,
} from "@/src/lib/mortgage/schedule";
export type { MortgageSchedule, ScheduleMonth, ScheduleYear } from "@/src/lib/mortgage/schedule";
export {
  box1MarginalRate,
  deductionRefund,
  eigenwoningforfait,
  formatDeductionRate,
  formatRatePct,
  housingDeductionRate,
  housingTaxForYear,
  summarizeHousingTax,
} from "@/src/lib/mortgage/tax";
export type { HousingTaxInput, HousingTaxSummary, HousingTaxYear } from "@/src/lib/mortgage/tax";
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
export {
  HOLIDAY_PAY_RATE,
  buildSalaryBreakdown,
  emptySalaryBreakdown,
  holidayPayAmount,
  thirteenthAmount,
} from "@/src/lib/mortgage/salary";
export type { HolidayMode, IncomeEntry, SalaryBreakdown, SalaryBreakdownInput } from "@/src/lib/mortgage/salary";
export {
  obligationAnnualTotal,
  obligationLines,
  ownFundsTotal,
  REVOLVING_MONTHLY_FACTOR,
  STUDENT_REMAINING_MONTHLY_FACTOR,
} from "@/src/lib/mortgage/obligations";
export {
  loadMortgageMarket,
  marketIndicativeRate,
  parseAfmToetsrente,
  parseEcbMirObservation,
  parseEcbMirSeries,
  AFM_TOETSRENTE_URL,
  ECB_HISTORY_OBSERVATIONS,
  NHG_RATE_OFFSET,
} from "@/src/lib/mortgage/market";
export type {
  EmploymentContract,
  EnergyBand,
  EnergyLabel,
  FixedPeriodYears,
  IncomeSource,
  MortgageCapacity,
  MortgageFinance,
  MortgageLine,
  MortgageMarketHistorySeries,
  MortgageMarketRatePoint,
  MortgageMarketSnapshot,
  MortgagePropertyContext,
  MortgageScenario,
  PersonFinance,
  RepaymentType,
  WorkType,
  YearTriple,
} from "@/src/lib/mortgage/types";
export { ENERGY_LABELS, parseCanonicalEnergyLabel } from "@/src/lib/mortgage/types";
export {
  MORTGAGE_STORAGE_KEY,
  WORK_TYPES,
  buyerProfileFromMortgageCapacity,
  buildMortgageSnapshot,
  calculatorFundsTotal,
  calculatorStateToFinance,
  defaultCalculatorState,
  emptyPersonForm,
  mortgageStateHasCapacity,
  normalizeMortgageSnapshot,
  personFinanceFromForm,
  restoreCalculatorState,
  switchIncomeEntry,
} from "@/src/lib/mortgage/calculator-state";
export type {
  CalculatorState,
  MortgageSnapshot,
  PersonForm,
} from "@/src/lib/mortgage/calculator-state";

export function defaultMortgageFinance(nhg = false): MortgageFinance {
  return {
    applicant: emptyPerson(),
    partner: null,
    studentLoanMonthly: 0,
    studentLoanRemaining: 0,
    studentLoanSf35: true,
    privateLeaseMonthly: 0,
    revolvingCreditLimit: 0,
    installmentLoanMonthly: 0,
    groundLeaseMonthly: 0,
    otherMonthlyDebts: 0,
    alimonyPaidMonthly: 0,
    savings: 0,
    gift: 0,
    saleEquity: 0,
    interestRate: indicativeRate(10, nhg),
    fixedPeriodYears: 10,
    repayment: "annuity",
    energyPerformanceGuarantee: false,
    includeEnergyMeasures: false,
    starterExemption: false,
    buyerAge: 0,
  };
}
