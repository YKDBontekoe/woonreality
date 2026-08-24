import type { Locale } from "@/src/lib/i18n/config";
import { getLibTranslator } from "@/src/lib/i18n/lib-translator";
import {
  defaultDgaSource,
  defaultEmploymentSource,
  defaultPensionSource,
  defaultSelfEmployedSource,
  emptyTriple,
} from "@/src/lib/mortgage/income";
import { marketIndicativeRate } from "@/src/lib/mortgage/market";
import { ownFundsTotal } from "@/src/lib/mortgage/obligations";
import { buildSalaryBreakdown, type HolidayMode, type IncomeEntry } from "@/src/lib/mortgage/salary";
import type {
  FixedPeriodYears,
  IncomeSource,
  MortgageCapacity,
  MortgageFinance,
  PersonFinance,
  RepaymentType,
  WorkType,
  YearTriple,
} from "@/src/lib/mortgage/types";
import type { BuyerProfile } from "@/src/lib/purchase";

export const MORTGAGE_STORAGE_KEY = "woonreality.mortgage.v2";

export function workTypeOptions(locale: Locale = "nl"): { value: WorkType; label: string }[] {
  const t = getLibTranslator(locale, "lib-finance");
  const values: WorkType[] = ["permanent", "temporary", "flex", "self_employed", "dga", "pension", "mix"];
  return values.map((value) => ({ value, label: t(`mortgage.workTypes.${value}`) }));
}

export const WORK_TYPES = workTypeOptions();

export type PersonForm = {
  workType: WorkType;
  reachedAow: boolean;
  incomeEntry: IncomeEntry;
  monthlyGross: number;
  holidayMode: HolidayMode;
  holidayCustom: number;
  hasThirteenth: boolean;
  yearEndPayout: number;
  monthlyAllowances: number;
  structuralBonus: number;
  variableBonus: YearTriple;
  grossAnnual: number;
  thirteenthMonth: number;
  bonus: number;
  intent: boolean;
  perspectief: boolean;
  history: YearTriple;
  monthsActive: number;
  profits: YearTriple;
  box1: YearTriple;
  dividend: YearTriple;
  pensionAnnual: number;
  alimonyAnnual: number;
};

export type CalculatorState = {
  withPartner: boolean;
  applicant: PersonForm;
  partner: PersonForm;
  studentLoanMonthly: number;
  studentLoanRemaining: number;
  studentLoanSf35: boolean;
  privateLeaseMonthly: number;
  revolvingCreditLimit: number;
  installmentLoanMonthly: number;
  groundLeaseMonthly: number;
  otherMonthlyDebts: number;
  alimonyPaidMonthly: number;
  savings: number;
  gift: number;
  saleEquity: number;
  nhg: boolean;
  interestRate: number;
  rateTouched: boolean;
  fixedPeriodYears: FixedPeriodYears;
  repayment: RepaymentType;
  energyLabel: string;
  askingPrice: number;
  includeEnergyMeasures: boolean;
  energyPerformanceGuarantee: boolean;
  starterExemption: boolean;
  buyerAge: number;
};

export type MortgageSnapshot = {
  maxLoanForPurchase: number;
  /** Hypotheek + eigen geld, zonder kosten koper. Bewaard voor vergelijkbaarheid. */
  maxPurchasePrice: number;
  /** Koopsom die eigen geld en hypotheek dekken ná kosten koper. Gebruik dit veld voor budgetbeslissingen. */
  maxPurchasePriceAfterCosts: number;
  monthlyPayment: number;
  toetsinkomen: number;
  ownFunds: number;
  nhg: boolean;
  energyMeasureExtra: number;
  updatedAt: string;
};

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asTriple(value: unknown): YearTriple {
  if (!Array.isArray(value)) return emptyTriple();
  return [asNumber(value[0]), asNumber(value[1]), asNumber(value[2])];
}

export function emptyPersonForm(): PersonForm {
  return {
    workType: "permanent",
    reachedAow: false,
    incomeEntry: "monthly",
    monthlyGross: 0,
    holidayMode: "standard",
    holidayCustom: 0,
    hasThirteenth: false,
    yearEndPayout: 0,
    monthlyAllowances: 0,
    structuralBonus: 0,
    variableBonus: emptyTriple(),
    grossAnnual: 0,
    thirteenthMonth: 0,
    bonus: 0,
    intent: false,
    perspectief: false,
    history: emptyTriple(),
    monthsActive: 36,
    profits: emptyTriple(),
    box1: emptyTriple(),
    dividend: emptyTriple(),
    pensionAnnual: 0,
    alimonyAnnual: 0,
  };
}

export function defaultCalculatorState(): CalculatorState {
  return {
    withPartner: false,
    applicant: emptyPersonForm(),
    partner: emptyPersonForm(),
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
    nhg: true,
    interestRate: marketIndicativeRate(null, 10, true),
    rateTouched: false,
    fixedPeriodYears: 10,
    repayment: "annuity",
    energyLabel: "",
    askingPrice: 0,
    includeEnergyMeasures: false,
    energyPerformanceGuarantee: false,
    starterExemption: false,
    buyerAge: 0,
  };
}

export function restoreCalculatorState(raw: unknown, defaults: CalculatorState = defaultCalculatorState()): CalculatorState {
  if (!raw || typeof raw !== "object") return defaults;
  const record = raw as Record<string, unknown>;
  const person = (value: unknown, fallback: PersonForm): PersonForm => {
    if (!value || typeof value !== "object") return fallback;
    const row = value as Record<string, unknown>;
    const workType = WORK_TYPES.some((item) => item.value === row.workType) ? row.workType as WorkType : fallback.workType;
    return {
      ...fallback,
      workType,
      reachedAow: Boolean(row.reachedAow),
      incomeEntry: row.incomeEntry === "annual" || (!asNumber(row.monthlyGross) && asNumber(row.grossAnnual) > 0) ? "annual" : "monthly",
      monthlyGross: asNumber(row.monthlyGross),
      holidayMode: row.holidayMode === "included" || row.holidayMode === "custom" ? row.holidayMode : "standard",
      holidayCustom: asNumber(row.holidayCustom),
      hasThirteenth: Boolean(row.hasThirteenth) || asNumber(row.thirteenthMonth) > 0,
      yearEndPayout: asNumber(row.yearEndPayout),
      monthlyAllowances: asNumber(row.monthlyAllowances),
      structuralBonus: asNumber(row.structuralBonus, asNumber(row.bonus)),
      variableBonus: asTriple(row.variableBonus),
      grossAnnual: asNumber(row.grossAnnual),
      thirteenthMonth: asNumber(row.thirteenthMonth),
      bonus: asNumber(row.bonus),
      intent: Boolean(row.intent),
      perspectief: Boolean(row.perspectief),
      history: asTriple(row.history),
      monthsActive: asNumber(row.monthsActive, 36),
      profits: asTriple(row.profits),
      box1: asTriple(row.box1),
      dividend: asTriple(row.dividend),
      pensionAnnual: asNumber(row.pensionAnnual),
      alimonyAnnual: asNumber(row.alimonyAnnual),
    };
  };
  const period = record.fixedPeriodYears;
  return {
    ...defaults,
    withPartner: Boolean(record.withPartner),
    applicant: person(record.applicant, defaults.applicant),
    partner: person(record.partner, defaults.partner),
    studentLoanMonthly: asNumber(record.studentLoanMonthly),
    studentLoanRemaining: asNumber(record.studentLoanRemaining),
    studentLoanSf35: record.studentLoanSf35 === undefined ? defaults.studentLoanSf35 : Boolean(record.studentLoanSf35),
    privateLeaseMonthly: asNumber(record.privateLeaseMonthly),
    revolvingCreditLimit: asNumber(record.revolvingCreditLimit),
    installmentLoanMonthly: asNumber(record.installmentLoanMonthly),
    groundLeaseMonthly: asNumber(record.groundLeaseMonthly),
    otherMonthlyDebts: asNumber(record.otherMonthlyDebts),
    alimonyPaidMonthly: asNumber(record.alimonyPaidMonthly),
    savings: asNumber(record.savings, asNumber(record.ownFunds)),
    gift: asNumber(record.gift),
    saleEquity: asNumber(record.saleEquity),
    nhg: record.nhg === undefined ? defaults.nhg : Boolean(record.nhg),
    interestRate: asNumber(record.interestRate, defaults.interestRate),
    rateTouched: Boolean(record.rateTouched),
    fixedPeriodYears: period === 5 || period === 10 || period === 20 || period === 30 ? period : 10,
    repayment: record.repayment === "linear" ? "linear" : "annuity",
    energyLabel: typeof record.energyLabel === "string" ? record.energyLabel : defaults.energyLabel,
    askingPrice: asNumber(record.askingPrice),
    includeEnergyMeasures: Boolean(record.includeEnergyMeasures),
    energyPerformanceGuarantee: Boolean(record.energyPerformanceGuarantee),
    starterExemption: Boolean(record.starterExemption),
    buyerAge: asNumber(record.buyerAge),
  };
}

function employmentFrom(person: PersonForm): IncomeSource {
  const base = defaultEmploymentSource();
  const contract = person.workType === "temporary"
    ? person.intent ? "temporary_intent" : "temporary"
    : person.workType === "flex" ? "flex" : "permanent";
  const monthly = person.incomeEntry === "monthly" ? buildSalaryBreakdown(person) : null;
  const variable = monthly ? 0 : buildSalaryBreakdown({ ...person, monthlyGross: 0, holidayMode: "included", hasThirteenth: false, thirteenthMonth: 0, yearEndPayout: 0, monthlyAllowances: 0, structuralBonus: 0 }).variableBonus;
  return {
    ...base,
    contract,
    grossAnnual: monthly ? monthly.grossAnnual : Math.max(0, person.grossAnnual),
    thirteenthMonth: monthly ? monthly.thirteenthMonth + monthly.yearEndPayout : Math.max(0, person.thirteenthMonth) + Math.max(0, person.yearEndPayout),
    bonus: monthly ? monthly.structuralBonus + monthly.variableBonus : Math.max(0, person.structuralBonus || person.bonus) + variable,
    history: person.history,
    perspectief: person.workType === "flex" && person.perspectief,
  };
}

function sourcesFromPerson(person: PersonForm): IncomeSource[] {
  const sources: IncomeSource[] = [];
  if (person.workType === "self_employed") sources.push({ ...defaultSelfEmployedSource(), monthsActive: person.monthsActive, profits: person.profits });
  else if (person.workType === "dga") sources.push({ ...defaultDgaSource(), box1: person.box1, dividend: person.dividend, monthsActive: person.monthsActive });
  else if (person.workType === "pension") sources.push({ ...defaultPensionSource(), annual: person.pensionAnnual });
  else if (person.workType === "mix") {
    sources.push(employmentFrom({ ...person, workType: "permanent" }));
    sources.push({ ...defaultSelfEmployedSource(), monthsActive: person.monthsActive, profits: person.profits });
  } else sources.push(employmentFrom(person));
  if (person.alimonyAnnual > 0) sources.push({ kind: "alimony", annual: person.alimonyAnnual });
  return sources;
}

export function personFinanceFromForm(person: PersonForm): PersonFinance {
  return { reachedAow: person.reachedAow, sources: sourcesFromPerson(person) };
}

export function switchIncomeEntry(person: PersonForm, mode: IncomeEntry): PersonForm {
  if (mode === person.incomeEntry) return person;
  if (mode === "annual") {
    const pay = buildSalaryBreakdown(person);
    return { ...person, incomeEntry: "annual", grossAnnual: pay.grossAnnual, thirteenthMonth: pay.thirteenthMonth, bonus: pay.structuralBonus };
  }
  if (!person.monthlyGross && person.grossAnnual > 0) {
    return {
      ...person,
      incomeEntry: "monthly",
      monthlyGross: Math.round(person.grossAnnual / 12),
      holidayMode: "included",
    };
  }
  return { ...person, incomeEntry: "monthly" };
}

export function calculatorStateToFinance(state: CalculatorState, studentMode: "monthly" | "remaining" = "monthly"): MortgageFinance {
  return {
    applicant: personFinanceFromForm(state.applicant),
    partner: state.withPartner ? personFinanceFromForm(state.partner) : null,
    studentLoanMonthly: studentMode === "monthly" ? state.studentLoanMonthly : 0,
    studentLoanRemaining: studentMode === "remaining" ? state.studentLoanRemaining : 0,
    studentLoanSf35: state.studentLoanSf35,
    privateLeaseMonthly: state.privateLeaseMonthly,
    revolvingCreditLimit: state.revolvingCreditLimit,
    installmentLoanMonthly: state.installmentLoanMonthly,
    groundLeaseMonthly: state.groundLeaseMonthly,
    otherMonthlyDebts: state.otherMonthlyDebts,
    alimonyPaidMonthly: state.alimonyPaidMonthly,
    savings: state.savings,
    gift: state.gift,
    saleEquity: state.saleEquity,
    interestRate: state.interestRate,
    fixedPeriodYears: state.fixedPeriodYears,
    repayment: state.repayment,
    energyPerformanceGuarantee: state.energyPerformanceGuarantee,
    includeEnergyMeasures: state.includeEnergyMeasures,
    starterExemption: state.starterExemption,
    buyerAge: state.buyerAge,
  };
}

export function calculatorFundsTotal(state: CalculatorState) {
  return ownFundsTotal(state);
}

export function mortgageStateHasCapacity(state: CalculatorState | null | undefined) {
  if (!state) return false;
  const applicant = state.applicant;
  const partner = state.withPartner ? state.partner : null;
  const hasIncome = (person: PersonForm | null) => {
    if (!person) return false;
    if (person.workType === "self_employed" || person.workType === "dga" || person.workType === "mix") {
      return person.profits.some((value) => value > 0) || person.box1.some((value) => value > 0) || person.grossAnnual > 0 || person.monthlyGross > 0;
    }
    if (person.workType === "pension") return person.pensionAnnual > 0;
    return person.monthlyGross > 0 || person.grossAnnual > 0;
  };
  return hasIncome(applicant) || hasIncome(partner) || calculatorFundsTotal(state) > 0;
}

export function buildMortgageSnapshot(capacity: MortgageCapacity, nhg: boolean): MortgageSnapshot {
  return {
    maxLoanForPurchase: capacity.maxLoanForPurchase,
    maxPurchasePrice: capacity.maxPurchasePrice,
    maxPurchasePriceAfterCosts: capacity.maxPurchasePriceAfterCosts,
    monthlyPayment: capacity.monthlyPayment,
    toetsinkomen: capacity.toetsinkomen,
    ownFunds: capacity.ownFunds,
    nhg,
    energyMeasureExtra: capacity.energyMeasureExtra,
    updatedAt: new Date().toISOString(),
  };
}

/** Sync financial buyer-profile fields from mortgage capacity (preserves search preferences). */
export function buyerProfileFromMortgageCapacity(profile: BuyerProfile, capacity: MortgageCapacity, state: CalculatorState): BuyerProfile {
  return {
    ...profile,
    budget: capacity.maxPurchasePriceAfterCosts > 0 ? capacity.maxPurchasePriceAfterCosts : profile.budget,
    monthlyPayment: capacity.monthlyPayment > 0 ? capacity.monthlyPayment : profile.monthlyPayment,
    ownFunds: capacity.ownFunds,
    nhg: state.nhg,
    buyerAge: state.buyerAge > 0 ? state.buyerAge : profile.buyerAge,
    firstTimeBuyer: state.starterExemption || profile.firstTimeBuyer,
    selfOccupied: state.starterExemption ? true : profile.selfOccupied,
  };
}

export function normalizeMortgageSnapshot(value: unknown): MortgageSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const maxPurchasePrice = asNumber(record.maxPurchasePrice);
  if (maxPurchasePrice <= 0 && asNumber(record.maxLoanForPurchase) <= 0) return null;
  return {
    maxLoanForPurchase: asNumber(record.maxLoanForPurchase),
    maxPurchasePrice,
    // Ontbreekt in oudere opgeslagen snapshots: val dan terug op de bruto waarde.
    maxPurchasePriceAfterCosts: asNumber(record.maxPurchasePriceAfterCosts, maxPurchasePrice),
    monthlyPayment: asNumber(record.monthlyPayment),
    toetsinkomen: asNumber(record.toetsinkomen),
    ownFunds: asNumber(record.ownFunds),
    nhg: Boolean(record.nhg),
    energyMeasureExtra: asNumber(record.energyMeasureExtra),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
  };
}
