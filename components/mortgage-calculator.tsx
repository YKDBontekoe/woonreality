"use client";

import { Calculator, ChevronDown, CircleAlert, Landmark, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ENERGY_LABELS,
  MORTGAGE_NORMS_YEAR,
  NHG,
  buildMortgageScenarios,
  buildMortgageSchedule,
  calculateMortgageCapacity,
  currentMortgageReference,
  defaultDgaSource,
  defaultEmploymentSource,
  defaultPensionSource,
  defaultSelfEmployedSource,
  buildSalaryBreakdown,
  emptyTriple,
  marketIndicativeRate,
  ownFundsTotal,
  parseCanonicalEnergyLabel,
  rateImpactRows,
  summarizeHousingTax,
  type FixedPeriodYears,
  type HolidayMode,
  type IncomeEntry,
  type IncomeSource,
  type MortgageFinance,
  type MortgageMarketSnapshot,
  type PersonFinance,
  type RepaymentType,
  type WorkType,
  type YearTriple,
} from "@/src/lib/mortgage";
import { estimateBuyerCosts } from "@/src/lib/costs";
import { formatEuro } from "@/src/lib/purchase";
import { MortgageCostInsight, type CostInsightOptions } from "@/components/mortgage-cost-insight";

const STORAGE_KEY = "woonreality.mortgage.v2";
const DEBT_FIELDS: { key: DebtKey; label: string; add: string; hint?: string }[] = [
  { key: "lease", label: "Private lease per maand", add: "Private lease", hint: "De hele maandlast telt mee." },
  { key: "student", label: "Studieschuld", add: "Studieschuld" },
  { key: "installment", label: "Andere lening per maand", add: "Lening" },
  { key: "revolving", label: "Creditcard- of kredietlimiet", add: "Creditcardlimiet", hint: "Ook als je die niet gebruikt." },
  { key: "erfpacht", label: "Erfpacht per maand", add: "Erfpacht" },
  { key: "alimony", label: "Alimentatie die je betaalt", add: "Alimentatie" },
  { key: "other", label: "Overige maandlasten", add: "Overige last" },
];

type DebtKey = "lease" | "student" | "installment" | "revolving" | "erfpacht" | "alimony" | "other";
const PRIMARY_WORK: WorkType[] = ["permanent", "temporary", "flex", "self_employed"];
const EXTRA_WORK: WorkType[] = ["dga", "pension", "mix"];

const WORK_TYPES: { value: WorkType; label: string }[] = [
  { value: "permanent", label: "Loondienst" },
  { value: "temporary", label: "Tijdelijk" },
  { value: "flex", label: "Flex" },
  { value: "self_employed", label: "Zelfstandig" },
  { value: "dga", label: "DGA" },
  { value: "pension", label: "Pensioen" },
  { value: "mix", label: "Mix" },
];

type PersonForm = {
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

type CalculatorState = {
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

function emptyPersonForm(): PersonForm {
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

function defaultState(): CalculatorState {
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

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asTriple(value: unknown): YearTriple {
  if (!Array.isArray(value)) return emptyTriple();
  return [asNumber(value[0]), asNumber(value[1]), asNumber(value[2])];
}

function restoreState(raw: unknown, defaults: CalculatorState): CalculatorState {
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

function personFinance(person: PersonForm): PersonFinance {
  return { reachedAow: person.reachedAow, sources: sourcesFromPerson(person) };
}

function switchIncomeEntry(person: PersonForm, mode: IncomeEntry): PersonForm {
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

function toFinance(state: CalculatorState, studentMode: "monthly" | "remaining" = "monthly"): MortgageFinance {
  return {
    applicant: personFinance(state.applicant),
    partner: state.withPartner ? personFinance(state.partner) : null,
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

function fundsTotal(state: CalculatorState) {
  return ownFundsTotal(state);
}

function debtSummary(state: CalculatorState) {
  const parts: string[] = [];
  if (state.privateLeaseMonthly) parts.push(`lease ${formatEuro(state.privateLeaseMonthly)}/mnd`);
  if (state.studentLoanMonthly || state.studentLoanRemaining) parts.push("studieschuld");
  if (state.revolvingCreditLimit) parts.push("kredietlimiet");
  if (state.installmentLoanMonthly) parts.push("leningen");
  if (state.groundLeaseMonthly) parts.push("erfpacht");
  if (state.alimonyPaidMonthly) parts.push("alimentatie");
  if (state.otherMonthlyDebts) parts.push("overig");
  return parts;
}

function filledDebtKeys(state: CalculatorState): DebtKey[] {
  const keys: DebtKey[] = [];
  if (state.privateLeaseMonthly) keys.push("lease");
  if (state.studentLoanMonthly || state.studentLoanRemaining) keys.push("student");
  if (state.installmentLoanMonthly) keys.push("installment");
  if (state.revolvingCreditLimit) keys.push("revolving");
  if (state.groundLeaseMonthly) keys.push("erfpacht");
  if (state.alimonyPaidMonthly) keys.push("alimony");
  if (state.otherMonthlyDebts) keys.push("other");
  return keys;
}

function clearDebt(state: CalculatorState, key: DebtKey): CalculatorState {
  if (key === "lease") return { ...state, privateLeaseMonthly: 0 };
  if (key === "student") return { ...state, studentLoanMonthly: 0, studentLoanRemaining: 0 };
  if (key === "installment") return { ...state, installmentLoanMonthly: 0 };
  if (key === "revolving") return { ...state, revolvingCreditLimit: 0 };
  if (key === "erfpacht") return { ...state, groundLeaseMonthly: 0 };
  if (key === "alimony") return { ...state, alimonyPaidMonthly: 0 };
  return { ...state, otherMonthlyDebts: 0 };
}

function fitCopy(result: { fit: "unknown" | "fits" | "tight" | "over"; maxPurchasePrice: number; askingPrice: number }) {
  if (result.fit === "unknown") return null;
  const gap = Math.round(result.askingPrice - result.maxPurchasePrice);
  if (result.fit === "fits") {
    const room = Math.max(0, -gap);
    return room > 0
      ? `Deze vraagprijs past. Je hebt ongeveer ${formatEuro(room)} speelruimte tot je maximale koopsom.`
      : "Deze vraagprijs past binnen de berekende leenruimte.";
  }
  if (result.fit === "tight") {
    return `Krap: je komt ongeveer ${formatEuro(gap)} tekort. Extra eigen geld of een lager bod kan het gat dichten. Maximale koopsom: ${formatEuro(result.maxPurchasePrice)}.`;
  }
  return `Dit huis kost ${formatEuro(result.askingPrice)}. Volgens deze schets kun je tot ${formatEuro(result.maxPurchasePrice)} gaan — ${formatEuro(gap)} tekort.`;
}

export function MortgageCalculator({ initialEnergyLabel, initialAskingPrice, initialNhg }: { initialEnergyLabel?: string; initialAskingPrice?: number; initialNhg?: boolean }) {
  const [state, setState] = useState<CalculatorState>(() => {
    const defaults = defaultState();
    const energyLabel = parseCanonicalEnergyLabel(initialEnergyLabel);
    if (energyLabel) defaults.energyLabel = energyLabel;
    if (initialAskingPrice && initialAskingPrice > 0) defaults.askingPrice = initialAskingPrice;
    if (initialNhg != null) {
      defaults.nhg = initialNhg;
      defaults.interestRate = marketIndicativeRate(null, defaults.fixedPeriodYears, initialNhg);
    }
    return defaults;
  });
  const [ready, setReady] = useState(false);
  const [market, setMarket] = useState<MortgageMarketSnapshot | null>(null);
  const marketRef = useRef<MortgageMarketSnapshot | null>(null);
  marketRef.current = market;
  const [showIncomeExtras, setShowIncomeExtras] = useState(false);
  const [showMoreWork, setShowMoreWork] = useState(false);
  const [openFunds, setOpenFunds] = useState(false);
  const [openDebts, setOpenDebts] = useState(false);
  const [addedDebts, setAddedDebts] = useState<DebtKey[]>([]);
  const [openExplain, setOpenExplain] = useState(false);
  const [openScenarios, setOpenScenarios] = useState(false);
  const [studentMode, setStudentMode] = useState<"monthly" | "remaining">("monthly");
  const [costOptions, setCostOptions] = useState<CostInsightOptions>({
    newBuild: false,
    investment: false,
    includeAdvice: true,
    includeBankGuarantee: false,
    includeBuyingAgent: false,
    includeMoving: false,
    includeInspection: true,
  });
  const [wozValue, setWozValue] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const restored = restoreState(JSON.parse(raw), defaultState());
        const energyLabel = parseCanonicalEnergyLabel(initialEnergyLabel);
        if (energyLabel) restored.energyLabel = energyLabel;
        if (initialAskingPrice && initialAskingPrice > 0) restored.askingPrice = initialAskingPrice;
        if (initialNhg != null) restored.nhg = initialNhg;
        if (!restored.rateTouched) restored.interestRate = marketIndicativeRate(marketRef.current, restored.fixedPeriodYears, restored.nhg);
        setState(restored);
        if (fundsTotal(restored) > 0) setOpenFunds(true);
        if (filledDebtKeys(restored).length) {
          setOpenDebts(true);
          setAddedDebts(filledDebtKeys(restored));
        }
        if (restored.studentLoanRemaining > 0 && restored.studentLoanMonthly <= 0) setStudentMode("remaining");
        if (EXTRA_WORK.includes(restored.applicant.workType) || EXTRA_WORK.includes(restored.partner.workType)) setShowMoreWork(true);
        if (restored.applicant.alimonyAnnual || restored.applicant.reachedAow || restored.partner.alimonyAnnual || restored.partner.reachedAow) setShowIncomeExtras(true);
      }
    } catch { /* ignore */ }
    setReady(true);
  }, [initialAskingPrice, initialEnergyLabel, initialNhg]);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }, [ready, state]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    fetch("/api/mortgage/market", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((snapshot: MortgageMarketSnapshot | null) => {
        if (cancelled || !snapshot?.indicativeRates) return;
        setMarket(snapshot);
        setState((current) => {
          if (current.rateTouched) return current;
          const next = marketIndicativeRate(snapshot, current.fixedPeriodYears, current.nhg);
          return next === current.interestRate ? current : { ...current, interestRate: next };
        });
      })
      .catch(() => { /* keep ingebouwde indicatie */ });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const result = useMemo(() => calculateMortgageCapacity(toFinance(state, studentMode), {
    energyLabel: state.energyLabel,
    askingPrice: state.askingPrice,
    nhg: state.nhg,
  }, market ?? undefined), [market, state, studentMode]);

  const funds = fundsTotal(state);
  const reference = useMemo(() => currentMortgageReference(), []);
  const maxDeductionRate = reference.box1.maxHousingDeductionRate;

  const displayLoan = useMemo(() => {
    if (state.askingPrice > 0) {
      if (funds >= state.askingPrice) return 0;
      const maxLoan = result.available ? result.maxLoanForPurchase : 0;
      return Math.min(state.askingPrice, Math.max(0, maxLoan));
    }
    return result.available ? result.maxLoanForPurchase : 0;
  }, [funds, result, state.askingPrice]);

  const effectiveWoz = wozValue > 0 ? wozValue : (state.askingPrice || displayLoan);

  const detailedCosts = useMemo(() => {
    if (state.askingPrice <= 0) return null;
    return estimateBuyerCosts(
      state.askingPrice,
      {
        firstTimeBuyer: state.starterExemption,
        buyerAge: state.buyerAge || 32,
        selfOccupied: !costOptions.investment,
        priorExemptionUsed: false,
        ownFunds: funds,
        budget: state.askingPrice,
        nhg: state.nhg,
        energySavingMeasures: state.includeEnergyMeasures,
      },
      displayLoan,
      {
        newBuild: costOptions.newBuild,
        investment: costOptions.investment,
        includeAdvice: costOptions.includeAdvice,
        includeBankGuarantee: costOptions.includeBankGuarantee,
        includeBuyingAgent: costOptions.includeBuyingAgent,
        includeMoving: costOptions.includeMoving,
        includeInspection: costOptions.includeInspection,
        reference,
      },
    );
  }, [costOptions, displayLoan, funds, reference, state.askingPrice, state.buyerAge, state.includeEnergyMeasures, state.nhg, state.starterExemption]);

  const annuitySchedule = useMemo(
    () => (displayLoan > 0 ? buildMortgageSchedule(displayLoan, state.interestRate, "annuity") : null),
    [displayLoan, state.interestRate],
  );
  const linearSchedule = useMemo(
    () => (displayLoan > 0 ? buildMortgageSchedule(displayLoan, state.interestRate, "linear") : null),
    [displayLoan, state.interestRate],
  );
  const activeSchedule = state.repayment === "linear" ? linearSchedule : annuitySchedule;

  const housingTax = useMemo(() => {
    if (!activeSchedule || displayLoan <= 0) return null;
    return summarizeHousingTax({
      taxableIncome: result.toetsinkomen,
      wozValue: effectiveWoz,
      schedule: activeSchedule,
      oneOffDeductibleCosts: detailedCosts?.deductibleTotal ?? 0,
      reference,
    });
  }, [activeSchedule, detailedCosts?.deductibleTotal, displayLoan, effectiveWoz, reference, result.toetsinkomen]);

  const impact = useMemo(
    () => (displayLoan > 0 ? rateImpactRows(displayLoan, state.interestRate, state.repayment) : []),
    [displayLoan, state.interestRate, state.repayment],
  );

  const scenarios = useMemo(() => {
    if (!result.available) return [];
    return buildMortgageScenarios(toFinance(state, studentMode), {
      energyLabel: state.energyLabel,
      askingPrice: state.askingPrice,
      nhg: state.nhg,
    }, market ?? undefined).filter((scenario) => scenario.id !== "current");
  }, [market, result.available, state, studentMode]);

  function patch<K extends keyof CalculatorState>(key: K, value: CalculatorState[K]) {
    setState((current) => ({ ...current, [key]: value }));
  }

  function setPeriod(period: FixedPeriodYears) {
    setState((current) => ({
      ...current,
      fixedPeriodYears: period,
      interestRate: current.rateTouched ? current.interestRate : marketIndicativeRate(market, period, current.nhg),
    }));
  }

  function setNhg(nhg: boolean) {
    setState((current) => ({
      ...current,
      nhg,
      interestRate: current.rateTouched ? current.interestRate : marketIndicativeRate(market, current.fixedPeriodYears, nhg),
    }));
  }

  function nudgeRate(delta: number) {
    setState((current) => ({
      ...current,
      interestRate: Math.round(Math.max(0, Math.min(15, current.interestRate + delta)) * 100) / 100,
      rateTouched: true,
    }));
  }

  function useMarketRate() {
    setState((current) => ({
      ...current,
      interestRate: marketIndicativeRate(market, current.fixedPeriodYears, current.nhg),
      rateTouched: false,
    }));
  }

  const marketRate = marketIndicativeRate(market, state.fixedPeriodYears, state.nhg);
  const youngSelfEmployed = [state.applicant, state.withPartner ? state.partner : null].some((person) => person && (person.workType === "self_employed" || person.workType === "dga" || person.workType === "mix") && person.monthsActive < 12);
  const debts = debtSummary(state);
  const shownDebts = Array.from(new Set([...filledDebtKeys(state), ...addedDebts]));
  const unusedDebts = DEBT_FIELDS.filter((item) => !shownDebts.includes(item.key));
  const workOptions = showMoreWork ? WORK_TYPES : WORK_TYPES.filter((item) => PRIMARY_WORK.includes(item.value));
  const highlightKeys = new Set(["max-loan", "max-price", "nhg", "lease", "student", "revolving", "funds-gap"]);

  return <>
    <div className="mortgage-layout">
      <section className="mortgage-form-card">
        <div className="section-kicker">Stap 1 · inkomen</div>
        <h2>Wat is je inkomen?</h2>
        <p className="mortgage-lead">Vul je maandsalaris in. Vakantiegeld rekenen we standaard mee; 13e maand en bonus kun je erbij optellen.</p>
        <div className="work-chips" role="group" aria-label="Kopers">
          <button type="button" className={!state.withPartner ? "active" : undefined} onClick={() => patch("withPartner", false)}>Alleen</button>
          <button type="button" className={state.withPartner ? "active" : undefined} onClick={() => patch("withPartner", true)}>Met partner</button>
        </div>
        <PersonFields
          title={state.withPartner ? "Jij" : undefined}
          person={state.applicant}
          workOptions={workOptions}
          showMoreWork={showMoreWork}
          onMoreWork={() => setShowMoreWork(true)}
          showExtras={showIncomeExtras}
          onExtras={() => setShowIncomeExtras(true)}
          onChange={(applicant) => patch("applicant", applicant)}
        />
        {state.withPartner && <PersonFields
          title="Partner"
          person={state.partner}
          workOptions={workOptions}
          showMoreWork={showMoreWork}
          onMoreWork={() => setShowMoreWork(true)}
          showExtras={showIncomeExtras}
          onExtras={() => setShowIncomeExtras(true)}
          onChange={(partner) => patch("partner", partner)}
        />}
        {youngSelfEmployed && <p className="mortgage-warning"><CircleAlert size={14} /> Onder 12 maanden ondernemerschap nemen de meeste banken dit inkomen niet of nauwelijks mee.</p>}

        <div className="mortgage-block">
          <div className="section-kicker">Stap 2 · hypotheek</div>
          <h3>Rente en NHG</h3>
          <p className="mortgage-hint">Kies je rentevastperiode. De startrente volgt actuele DNB/ECB-cijfers; pas die aan als je een offerte hebt.</p>
          <div className="work-chips mortgage-period-chips" role="group" aria-label="Rentevastperiode">
            {([5, 10, 20, 30] as FixedPeriodYears[]).map((period) => {
              const periodRate = marketIndicativeRate(market, period, state.nhg);
              return (
                <button type="button" key={period} className={state.fixedPeriodYears === period ? "active" : undefined} onClick={() => setPeriod(period)}>
                  <span>{period} jaar</span>
                  <small>{periodRate.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</small>
                </button>
              );
            })}
          </div>
          <div className="mortgage-rate-row">
            <span className="mortgage-rate-label">
              Rente
              <small>{state.rateTouched ? "Handmatig aangepast" : market?.indicativeRates.live ? `Marktrente ${market.indicativeRates.asOf}` : "Indicatie"}</small>
            </span>
            <div className="mortgage-rate-controls">
              <button type="button" className="mortgage-rate-nudge" onClick={() => nudgeRate(-0.1)} aria-label="Rente 0,1 procentpunt lager">−</button>
              <label className="mortgage-rate-input">
                <span className="sr-only">Rente in procent</span>
                <input
                  type="number"
                  min="0"
                  max="15"
                  step="0.01"
                  inputMode="decimal"
                  value={state.interestRate || ""}
                  onChange={(event) => setState((current) => ({ ...current, interestRate: Number(event.target.value) || 0, rateTouched: true }))}
                />
                <em>%</em>
              </label>
              <button type="button" className="mortgage-rate-nudge" onClick={() => nudgeRate(0.1)} aria-label="Rente 0,1 procentpunt hoger">+</button>
            </div>
          </div>
          {(state.rateTouched || Math.abs(state.interestRate - marketRate) > 0.001) && (
            <button type="button" className="text-link mortgage-toggle" onClick={useMarketRate}>
              Gebruik marktrente ({marketRate.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%)
            </button>
          )}
          <p className="mortgage-hint">{rateHint(market, state.fixedPeriodYears, state.nhg)}</p>
          <label className="mortgage-check"><input type="checkbox" checked={state.nhg} onChange={(event) => setNhg(event.target.checked)} /> NHG: vaak iets lagere rente, alleen tot {formatEuro(NHG.limit)}</label>
          <div className="work-chips" role="group" aria-label="Aflosvorm">
            <button type="button" className={state.repayment === "annuity" ? "active" : undefined} onClick={() => patch("repayment", "annuity")}>Annuïteit</button>
            <button type="button" className={state.repayment === "linear" ? "active" : undefined} onClick={() => patch("repayment", "linear")}>Lineair</button>
          </div>
        </div>

        <Foldable
          kicker="Optioneel · eigen geld"
          title={funds > 0 ? formatEuro(funds) : "Spaargeld of schenking"}
          open={openFunds}
          onToggle={() => setOpenFunds((value) => !value)}
        >
          <p className="mortgage-hint">Dit verhoogt wat je kunt kopen, niet per se wat je mag lenen.</p>
          <div className="form-grid">
            <MoneyField label="Spaargeld" value={state.savings} onChange={(savings) => patch("savings", savings)} step={1000} />
            <MoneyField label="Schenking" value={state.gift} onChange={(gift) => patch("gift", gift)} step={1000} />
            <MoneyField label="Overwaarde" value={state.saleEquity} onChange={(saleEquity) => patch("saleEquity", saleEquity)} step={1000} />
          </div>
        </Foldable>

        <div className={`mortgage-block ${openDebts || shownDebts.length ? "is-open" : ""}`}>
          <button type="button" className="mortgage-fold" onClick={() => setOpenDebts((value) => !value)} aria-expanded={openDebts}>
            <span>
              <span className="section-kicker">Optioneel · lasten</span>
              <strong>{debts.length ? debts.join(" · ") : "Lease, studieschuld of andere lasten"}</strong>
            </span>
            <ChevronDown size={16} />
          </button>
          <p className="mortgage-hint">Voeg toe wat je hebt — een lease van een paar honderd euro kan tienduizenden euro’s schelen.</p>
          {unusedDebts.length > 0 && <div className="work-chips mortgage-add-debts" role="group" aria-label="Last toevoegen">
            {unusedDebts.map((item) => (
              <button type="button" key={item.key} onClick={() => {
                setAddedDebts((current) => current.includes(item.key) ? current : [...current, item.key]);
                setOpenDebts(true);
              }}>+ {item.add}</button>
            ))}
          </div>}
          {(openDebts || shownDebts.length > 0) && shownDebts.map((key) => {
            const field = DEBT_FIELDS.find((item) => item.key === key);
            if (!field) return null;
            return <div className="mortgage-debt-row" key={key}>
              {key === "student" ? <>
                <div className="work-chips" role="group" aria-label="Studieschuld invoer">
                  <button type="button" className={studentMode === "monthly" ? "active" : undefined} onClick={() => setStudentMode("monthly")}>Maandbedrag DUO</button>
                  <button type="button" className={studentMode === "remaining" ? "active" : undefined} onClick={() => setStudentMode("remaining")}>Ik ken alleen het restant</button>
                </div>
                {studentMode === "monthly"
                  ? <MoneyField label="DUO-termijn per maand" value={state.studentLoanMonthly} onChange={(studentLoanMonthly) => patch("studentLoanMonthly", studentLoanMonthly)} />
                  : <>
                    <MoneyField label="Openstaande studieschuld" value={state.studentLoanRemaining} onChange={(studentLoanRemaining) => patch("studentLoanRemaining", studentLoanRemaining)} step={500} />
                    <label className="mortgage-span"><input type="checkbox" checked={state.studentLoanSf35} onChange={(event) => patch("studentLoanSf35", event.target.checked)} /> Studieschuld vanaf 2024 (telt minder zwaar)</label>
                  </>}
              </> : key === "lease" ? <MoneyField label={field.label} hint={field.hint} value={state.privateLeaseMonthly} onChange={(privateLeaseMonthly) => patch("privateLeaseMonthly", privateLeaseMonthly)} />
              : key === "installment" ? <MoneyField label={field.label} value={state.installmentLoanMonthly} onChange={(installmentLoanMonthly) => patch("installmentLoanMonthly", installmentLoanMonthly)} />
              : key === "revolving" ? <MoneyField label={field.label} hint={field.hint} value={state.revolvingCreditLimit} onChange={(revolvingCreditLimit) => patch("revolvingCreditLimit", revolvingCreditLimit)} step={500} />
              : key === "erfpacht" ? <MoneyField label={field.label} value={state.groundLeaseMonthly} onChange={(groundLeaseMonthly) => patch("groundLeaseMonthly", groundLeaseMonthly)} />
              : key === "alimony" ? <MoneyField label={field.label} value={state.alimonyPaidMonthly} onChange={(alimonyPaidMonthly) => patch("alimonyPaidMonthly", alimonyPaidMonthly)} />
              : <MoneyField label={field.label} value={state.otherMonthlyDebts} onChange={(otherMonthlyDebts) => patch("otherMonthlyDebts", otherMonthlyDebts)} />}
              <button type="button" className="text-link" onClick={() => {
                setState((current) => clearDebt(current, key));
                setAddedDebts((current) => current.filter((item) => item !== key));
              }}>Verwijder</button>
            </div>;
          })}
        </div>

        <div className="mortgage-block">
          <div className="section-kicker">Optioneel · deze woning</div>
          <h3>Past dit huis?</h3>
          <div className="form-grid">
            <MoneyField label="Vraagprijs" value={state.askingPrice} onChange={(askingPrice) => patch("askingPrice", askingPrice)} step={5000} />
            <label>Energielabel
              <select value={state.energyLabel} onChange={(event) => patch("energyLabel", event.target.value)}>
                <option value="">Nog niet bekend</option>
                {ENERGY_LABELS.map((label) => <option value={label} key={label}>{label}</option>)}
              </select>
            </label>
          </div>
          <label className="mortgage-check"><input type="checkbox" checked={state.includeEnergyMeasures} onChange={(event) => patch("includeEnergyMeasures", event.target.checked)} /> Extra lenen voor verduurzaming (alleen te gebruiken voor energiebesparing)</label>
          {state.askingPrice > 0 && <>
            <label className="mortgage-check"><input type="checkbox" checked={state.starterExemption} onChange={(event) => patch("starterExemption", event.target.checked)} /> Ik denk recht te hebben op startersvrijstelling (0% overdrachtsbelasting)</label>
            {state.starterExemption && <div className="form-grid"><label>Je leeftijd
              <input type="number" min="18" max="120" value={state.buyerAge || ""} onChange={(event) => patch("buyerAge", Number(event.target.value) || 0)} />
            </label></div>}
          </>}
          {state.energyLabel.startsWith("A++++") && <label className="mortgage-check"><input type="checkbox" checked={state.energyPerformanceGuarantee} onChange={(event) => patch("energyPerformanceGuarantee", event.target.checked)} /> Energieprestatiegarantie van minstens 10 jaar</label>}
        </div>
      </section>

      <aside className="mortgage-result-card" id="hypotheek-result" aria-live="polite">
        <div className="mortgage-result-head">
          <span className="section-kicker"><Calculator size={13} /> leennormen {MORTGAGE_NORMS_YEAR}</span>
          <span className="coverage-pill"><ShieldCheck size={12} /> geen advies</span>
        </div>
        {!result.available ? <>
          <h2>Jouw maximum verschijnt hier</h2>
          <p>Vul je maandsalaris in. Vakantiegeld rekenen we standaard mee.</p>
        </> : <>
          <p className="mortgage-kicker">Maximale hypotheek voor aankoop</p>
          <div className="mortgage-amount">{formatEuro(result.maxLoanForPurchase)}</div>
          <p className="mortgage-result-note">
            Maximale koopsom {formatEuro(result.maxPurchasePrice)}
            {funds > 0 ? ` inclusief ${formatEuro(funds)} eigen geld` : ""}.
            {result.energyMeasureExtra > 0 ? ` Plus ${formatEuro(result.energyMeasureExtra)} alleen voor verduurzaming.` : ""}
          </p>
          {result.nhgCapped && <div className="mortgage-nhg-banner">
            <p>
              Begrensd door NHG-kostengrens 2026 ({formatEuro(NHG.limit)}).
              Op inkomen zou {formatEuro(result.uncappedMaxLoanForPurchase)} mogelijk zijn zonder NHG.
            </p>
            <button type="button" className="text-link" onClick={() => setNhg(false)}>Toon zonder NHG-plafond</button>
          </div>}
          <div className="mortgage-result-grid">
            <div className="is-hero"><small>{state.repayment === "linear" ? "Eerste maand bruto" : "Maandlast bruto"}</small><strong>{formatEuro(result.monthlyPayment)}</strong></div>
            {housingTax && <div className="is-hero"><small>Netto / maand</small><strong>{formatEuro(housingTax.ongoingMonthlyNet)}</strong></div>}
            <div><small>Toetsinkomen</small><strong>{formatEuro(result.toetsinkomen)}</strong></div>
            {result.obligationBurden > 0 && <div><small>Lasten in de toets</small><strong>−{formatEuro(result.obligationBurden)}</strong></div>}
            {detailedCosts != null && <div><small>Kosten koper</small><strong>{formatEuro(detailedCosts.total)}</strong></div>}
          </div>
          {fitCopy(result) && <div className={`mortgage-fit ${result.fit}`}>{fitCopy(result)}</div>}
          {detailedCosts && <a className="text-link mortgage-toggle" href="#kosten-inzicht">Kosten en grafieken bekijken</a>}
          <button className="text-link mortgage-toggle" type="button" onClick={() => setOpenExplain((value) => !value)} aria-expanded={openExplain}>
            {openExplain ? "Verberg rekenregels" : "Hoe komen we op dit bedrag?"}
          </button>
          {openExplain && <ul className="mortgage-lines">
            {result.lines.filter((line) => line.key !== "ikv").map((line) => (
              <li key={line.key} className={highlightKeys.has(line.key) ? "is-key" : undefined}>
                <span>{line.label}</span>
                <strong>{line.amount === 0 ? "—" : formatEuro(line.amount)}</strong>
                <small>{line.note}</small>
              </li>
            ))}
          </ul>}
          {scenarios.length > 0 && <>
            <button className="text-link mortgage-toggle" type="button" onClick={() => setOpenScenarios((value) => !value)} aria-expanded={openScenarios}>
              {openScenarios ? "Verberg scenario’s" : `Wat als… (${scenarios.length})`}
            </button>
            {openScenarios && <div className="mortgage-scenarios">
            <p className="mortgage-hint">Andere labels, rentes of lasten — t.o.v. je huidige schets.</p>
            <ul>
              {scenarios.map((scenario) => (
                <li key={scenario.id}>
                  <span>
                    {scenario.label}
                    {scenario.note ? <small>{scenario.note}</small> : null}
                  </span>
                  <strong>
                    {formatEuro(scenario.maxLoanForPurchase)}
                    <em className={scenario.delta > 0 ? "is-up" : scenario.delta < 0 ? "is-down" : undefined}>
                      {scenario.delta === 0 ? "±0" : `${scenario.delta > 0 ? "+" : "−"}${formatEuro(Math.abs(scenario.delta))}`}
                    </em>
                  </strong>
                </li>
              ))}
            </ul>
          </div>}
          </>}
        </>}
        {!result.available ? null : <p className="mortgage-disclaimer"><Landmark size={14} /> {result.disclaimer}</p>}
        {result.available && market && <p className="mortgage-sources">
          {market.toetsrente.live ? <>Toetsrente AFM {market.toetsrente.rate.toLocaleString("nl-NL")}% ({market.toetsrente.label}). </> : "Toetsrente: wettelijk minimum 5%. "}
          {market.indicativeRates.live
            ? <>Startrente uit {market.indicativeRates.source}, {market.indicativeRates.asOf}. Geen bankvergelijking.</>
            : "Startrente is een ingebouwde indicatie tot de marktrente geladen is."}
        </p>}
      </aside>
    </div>
    <MortgageCostInsight
      costs={detailedCosts}
      tax={housingTax}
      annuity={annuitySchedule}
      linear={linearSchedule}
      impactRows={impact}
      market={market}
      activePeriod={state.fixedPeriodYears}
      repayment={state.repayment}
      options={costOptions}
      onOptionsChange={(patch) => setCostOptions((current) => ({ ...current, ...patch }))}
      wozValue={effectiveWoz}
      onWozChange={(value) => {
        setWozValue(value);
      }}
      loanAmount={displayLoan}
      ownFunds={funds}
      referenceYear={reference.year}
      maxDeductionRate={maxDeductionRate}
      referenceSources={[
        { label: "Overdrachtsbelasting", url: reference.sources.transferTax },
        { label: "NHG", url: reference.sources.nhg },
        { label: "Kadaster", url: reference.sources.kadaster },
        { label: "Box 1 aftrek", url: reference.sources.box1 },
        { label: "Eigenwoningforfait", url: reference.sources.eigenwoningforfait },
      ]}
    />
    {result.available && <a className="mortgage-mobile-dock" href="#hypotheek-result">
      <span>
        <small>Maximale hypotheek</small>
        <strong>{formatEuro(result.maxLoanForPurchase)}</strong>
      </span>
      <em>Zie details</em>
    </a>}
  </>;
}

function PersonFields({
  title,
  person,
  workOptions,
  showMoreWork,
  onMoreWork,
  showExtras,
  onExtras,
  onChange,
}: {
  title?: string;
  person: PersonForm;
  workOptions: typeof WORK_TYPES;
  showMoreWork: boolean;
  onMoreWork: () => void;
  showExtras: boolean;
  onExtras: () => void;
  onChange: (person: PersonForm) => void;
}) {
  const work = person.workType;
  const needsHistory = work === "temporary" && !person.intent || work === "flex" && !person.perspectief;
  const needsProfits = work === "self_employed" || work === "mix";
  const needsJob = work === "permanent" || work === "temporary" || work === "flex" || work === "mix";
  const pay = buildSalaryBreakdown(person);
  const hasPayExtras = person.hasThirteenth || person.yearEndPayout > 0 || person.monthlyAllowances > 0 || person.structuralBonus > 0 || person.variableBonus.some(Boolean);
  const [openPay, setOpenPay] = useState(hasPayExtras);
  useEffect(() => {
    if (hasPayExtras) setOpenPay(true);
  }, [hasPayExtras]);

  return <div className={title ? "mortgage-person" : "mortgage-person is-first"}>
    {title && <h3>{title}</h3>}
    <div className="work-chips" role="group" aria-label={title ? `Werktype ${title}` : "Werktype"}>
      {workOptions.map((item) => <button type="button" key={item.value} className={work === item.value ? "active" : undefined} onClick={() => onChange({ ...person, workType: item.value })}>{item.label}</button>)}
      {!showMoreWork && <button type="button" className="is-quiet" onClick={onMoreWork}>DGA, pensioen of mix</button>}
    </div>
    {needsJob && <>
      <div className="work-chips" role="group" aria-label="Invoeren als">
        <button type="button" className={person.incomeEntry === "monthly" ? "active" : undefined} onClick={() => onChange(switchIncomeEntry(person, "monthly"))}>Maandsalaris</button>
        <button type="button" className={person.incomeEntry === "annual" ? "active" : undefined} onClick={() => onChange(switchIncomeEntry(person, "annual"))}>Jaaropgave</button>
      </div>
      {person.incomeEntry === "monthly" ? <>
        <div className="form-grid">
          <MoneyField className="mortgage-income" label="Bruto maandsalaris" hint="Het bedrag vóór belasting, zoals op je loonstrook." value={person.monthlyGross} onChange={(monthlyGross) => onChange({ ...person, monthlyGross })} step={50} placeholder="3500" />
        </div>
        <div className="mortgage-subblock">
          <span className="mortgage-subhead">Vakantiegeld</span>
          <div className="work-chips" role="group" aria-label="Vakantiegeld">
            <button type="button" className={person.holidayMode === "standard" ? "active" : undefined} onClick={() => onChange({ ...person, holidayMode: "standard" })}>8% wettelijk</button>
            <button type="button" className={person.holidayMode === "included" ? "active" : undefined} onClick={() => onChange({ ...person, holidayMode: "included" })}>Al inbegrepen</button>
            <button type="button" className={person.holidayMode === "custom" ? "active" : undefined} onClick={() => onChange({ ...person, holidayMode: "custom" })}>Ander bedrag</button>
          </div>
          {person.holidayMode === "custom" && <div className="form-grid"><MoneyField label="Vakantiegeld per jaar" value={person.holidayCustom} onChange={(holidayCustom) => onChange({ ...person, holidayCustom })} step={50} /></div>}
        </div>
      </> : <div className="form-grid">
        <MoneyField className="mortgage-income" label="Bruto jaarinkomen" hint="Meestal inclusief vakantiegeld. 13e maand en bonus tel je hieronder apart." value={person.grossAnnual} onChange={(grossAnnual) => onChange({ ...person, grossAnnual })} step={1000} placeholder="55000" />
      </div>}
      <button className="text-link mortgage-toggle" type="button" onClick={() => setOpenPay((value) => !value)} aria-expanded={openPay}>
        {openPay ? "Verberg 13e maand, toeslagen en bonus" : "13e maand, toeslagen of bonus toevoegen"}
      </button>
      {openPay && <div className="form-grid">
        <label className="mortgage-span"><input type="checkbox" checked={person.hasThirteenth} onChange={(event) => onChange({ ...person, hasThirteenth: event.target.checked, thirteenthMonth: event.target.checked ? person.thirteenthMonth || person.monthlyGross : person.thirteenthMonth })} /> Ik krijg een 13e maand</label>
        {person.hasThirteenth && <MoneyField label="13e maand" hint="Leeg laten = één maandsalaris." value={person.thirteenthMonth} onChange={(thirteenthMonth) => onChange({ ...person, thirteenthMonth, hasThirteenth: true })} step={50} />}
        <MoneyField label="Eindejaarsuitkering per jaar" value={person.yearEndPayout} onChange={(yearEndPayout) => onChange({ ...person, yearEndPayout })} step={50} />
        <MoneyField label="Vaste toeslag per maand" hint="Ploegen, overwerk of onregelmatig, als dat vast is." value={person.monthlyAllowances} onChange={(monthlyAllowances) => onChange({ ...person, monthlyAllowances })} step={25} />
        <MoneyField label="Vaste bonus per jaar" value={person.structuralBonus} onChange={(structuralBonus) => onChange({ ...person, structuralBonus, bonus: structuralBonus })} step={100} />
      </div>}
      {openPay && <>
        <p className="mortgage-hint">Variabele bonus: we nemen het 3-jaarsgemiddelde, gemaximeerd op het laatste jaar.</p>
        <YearFields label="Variabele bonus per jaar" years={person.variableBonus} onChange={(variableBonus) => onChange({ ...person, variableBonus })} />
      </>}
      {pay.toetsinkomen > 0 && person.incomeEntry === "monthly" && <ul className="mortgage-pay-lines">
        {pay.lines.map((line) => <li key={line.key}><span>{line.label}</span><strong>{formatEuro(line.amount)}</strong></li>)}
        <li className="is-total"><span>Toetsinkomen</span><strong>{formatEuro(pay.toetsinkomen)}</strong></li>
      </ul>}
      {work === "temporary" && <label className="mortgage-span"><input type="checkbox" checked={person.intent} onChange={(event) => onChange({ ...person, intent: event.target.checked })} /> Ik krijg een intentieverklaring voor vast werk</label>}
      {work === "flex" && <label className="mortgage-span"><input type="checkbox" checked={person.perspectief} onChange={(event) => onChange({ ...person, perspectief: event.target.checked })} /> Ik heb een perspectiefverklaring</label>}
    </>}
    {!showExtras && <button className="text-link" type="button" onClick={onExtras}>Ontvangen alimentatie of AOW</button>}
    {showExtras && <div className="form-grid">
      <MoneyField label="Alimentatie die je ontvangt, per jaar" value={person.alimonyAnnual} onChange={(alimonyAnnual) => onChange({ ...person, alimonyAnnual })} step={100} />
      <label className="mortgage-span"><input type="checkbox" checked={person.reachedAow} onChange={(event) => onChange({ ...person, reachedAow: event.target.checked })} /> AOW-leeftijd bereikt</label>
    </div>}
    {needsHistory && <YearFields label="Bruto inkomen van de afgelopen jaren" years={person.history} onChange={(history) => onChange({ ...person, history })} />}
    {needsProfits && <>
      <label className="mortgage-plain">Hoe lang onderneem je al (jaren)?<input type="number" min="0" max="50" step="0.5" value={person.monthsActive ? person.monthsActive / 12 : ""} onChange={(event) => onChange({ ...person, monthsActive: Math.round((Number(event.target.value) || 0) * 12) })} /></label>
      <YearFields label="Fiscale winst (IB) per jaar" years={person.profits} onChange={(profits) => onChange({ ...person, profits })} />
    </>}
    {work === "dga" && <>
      <YearFields label="Salaris uit de BV (box 1)" years={person.box1} onChange={(box1) => onChange({ ...person, box1 })} />
      <YearFields label="Uitgekeerd dividend, als je dat meeneemt" years={person.dividend} onChange={(dividend) => onChange({ ...person, dividend })} />
    </>}
    {work === "pension" && <div className="form-grid"><MoneyField className="mortgage-income" label="Pensioen en AOW per jaar" value={person.pensionAnnual} onChange={(pensionAnnual) => onChange({ ...person, pensionAnnual })} step={1000} /></div>}
  </div>;
}

function Foldable({ kicker, title, open, onToggle, children }: { kicker: string; title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return <div className={`mortgage-block ${open ? "is-open" : ""}`}>
    <button type="button" className="mortgage-fold" onClick={onToggle} aria-expanded={open}>
      <span>
        <span className="section-kicker">{kicker}</span>
        <strong>{title}</strong>
      </span>
      <ChevronDown size={16} />
    </button>
    {open && children}
  </div>;
}

function YearFields({ label, years, onChange }: { label: string; years: YearTriple; onChange: (years: YearTriple) => void }) {
  const captions = ["Laatste jaar", "Jaar daarvoor", "2 jaar geleden"];
  return <div className="mortgage-years"><span>{label}</span><div className="form-grid">{captions.map((caption, index) => <MoneyField key={caption} label={caption} value={years[index]} onChange={(value) => {
    const next: YearTriple = [...years];
    next[index] = value;
    onChange(next);
  }} step={1000} />)}</div></div>;
}

function MoneyField({ label, value, onChange, step = 50, hint, className, placeholder = "0" }: { label: string; value: number; onChange: (value: number) => void; step?: number; hint?: string; className?: string; placeholder?: string }) {
  return <label className={className}>{label}{hint ? <small className="mortgage-field-hint">{hint}</small> : null}<input type="number" min="0" step={step} inputMode="numeric" placeholder={placeholder} value={value || ""} onChange={(event) => {
    const parsed = Number(event.target.value);
    onChange(Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
  }} /></label>;
}

function rateHint(market: MortgageMarketSnapshot | null, period: FixedPeriodYears, nhg: boolean) {
  const rate = marketIndicativeRate(market, period, nhg).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (period < 10) {
    const floor = market?.toetsrente.live ? `${market.toetsrente.rate.toLocaleString("nl-NL")}% (${market.toetsrente.label})` : "minimaal 5%";
    return `Startrente rond ${rate}%. Omdat je korter dan 10 jaar vastzet, toetsen we wettelijk op ${floor}.`;
  }
  if (market?.indicativeRates.live) {
    return `Actuele marktrente ${rate}% (DNB/ECB nieuwe woninghypotheken, ${market.indicativeRates.asOf}${nhg ? ", NHG-indicatie" : ""}). Geen bankofferte.`;
  }
  return `Indicatieve startrente ${rate}%. Pas aan als je een offerte hebt.`;
}

export function MortgagePageIntro() {
  return <div className="mortgage-heading">
    <div>
      <div className="eyebrow"><Sparkles size={13} /> hypotheek {MORTGAGE_NORMS_YEAR}</div>
      <h1>Wat kun je lenen — en wat kost het?</h1>
      <p className="hero-copy">Vul je maandsalaris in. Je ziet meteen wat je mag lenen, wat het maandelijks kost, en welke eenmalige kosten erbij komen. Details en grafieken klap je open als je wilt.</p>
    </div>
    <div className="mortgage-heading-note"><Wallet size={16} /> Rekenschets, geen advies. Banken toetsen vaak strenger.</div>
  </div>;
}
