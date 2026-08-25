"use client";

import { Link, usePathname } from "@/src/lib/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Calculator, Check, ChevronDown, CircleAlert, Landmark, Link2, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ENERGY_LABELS,
  MORTGAGE_NORMS_YEAR,
  NHG,
  WORK_TYPES,
  buildMortgageScenarios,
  buildMortgageSchedule,
  calculateMortgageCapacity,
  calculatorFundsTotal,
  calculatorStateToFinance,
  currentMortgageReference,
  defaultCalculatorState,
  buildSalaryBreakdown,
  formatRatePct,
  marketIndicativeRate,
  parseCanonicalEnergyLabel,
  rateImpactRows,
  summarizeHousingTax,
  switchIncomeEntry,
  type CalculatorState,
  type FixedPeriodYears,
  type MortgageMarketSnapshot,
  type PersonForm,
  type WorkType,
  type YearTriple,
} from "@/src/lib/mortgage";
import { estimateBuyerCosts } from "@/src/lib/costs";
import { formatEuro } from "@/src/lib/purchase";
import { MortgageCostInsight, type CostInsightOptions } from "@/components/mortgage-cost-insight";
import { apiFetch } from "@/components/hooks/use-api";
import { useMortgagePersistence } from "@/components/hooks/use-mortgage-persistence";
import { MortgageScenarios } from "@/components/mortgage/result-panel";

type Translator = ReturnType<typeof useTranslations>;

const DEBT_FIELDS: { key: DebtKey; labelKey: string; addKey: string; hintKey?: string }[] = [
  { key: "lease", labelKey: "debtLeaseLabel", addKey: "debtLeaseAdd", hintKey: "debtLeaseHint" },
  { key: "student", labelKey: "debtStudentLabel", addKey: "debtStudentAdd" },
  { key: "installment", labelKey: "debtInstallmentLabel", addKey: "debtInstallmentAdd" },
  { key: "revolving", labelKey: "debtRevolvingLabel", addKey: "debtRevolvingAdd", hintKey: "debtRevolvingHint" },
  { key: "erfpacht", labelKey: "debtErfpachtLabel", addKey: "debtErfpachtAdd" },
  { key: "alimony", labelKey: "debtAlimonyLabel", addKey: "debtAlimonyAdd" },
  { key: "other", labelKey: "debtOtherLabel", addKey: "debtOtherAdd" },
];

type DebtKey = "lease" | "student" | "installment" | "revolving" | "erfpacht" | "alimony" | "other";
const PRIMARY_WORK: WorkType[] = ["permanent", "temporary", "flex", "self_employed"];
const EXTRA_WORK: WorkType[] = ["dga", "pension", "mix"];

function debtSummary(state: CalculatorState, t: Translator) {
  const parts: string[] = [];
  if (state.privateLeaseMonthly) parts.push(t("summaryLease", { amount: formatEuro(state.privateLeaseMonthly) }));
  if (state.studentLoanMonthly || state.studentLoanRemaining) parts.push(t("summaryStudent"));
  if (state.revolvingCreditLimit) parts.push(t("summaryCredit"));
  if (state.installmentLoanMonthly) parts.push(t("summaryLoans"));
  if (state.groundLeaseMonthly) parts.push(t("summaryErfpacht"));
  if (state.alimonyPaidMonthly) parts.push(t("summaryAlimony"));
  if (state.otherMonthlyDebts) parts.push(t("summaryOther"));
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

function fitCopy(result: { fit: "unknown" | "fits" | "tight" | "over"; maxPurchasePrice: number; askingPrice: number }, t: Translator) {
  if (result.fit === "unknown") return null;
  const gap = Math.round(result.askingPrice - result.maxPurchasePrice);
  if (result.fit === "fits") {
    const room = Math.max(0, -gap);
    return room > 0
      ? t("fitFitsRoom", { room: formatEuro(room) })
      : t("fitFits");
  }
  if (result.fit === "tight") {
    return t("fitTight", { gap: formatEuro(gap), max: formatEuro(result.maxPurchasePrice) });
  }
  return t("fitOver", { price: formatEuro(result.askingPrice), max: formatEuro(result.maxPurchasePrice), gap: formatEuro(gap) });
}

export function MortgageCalculator({
  initialEnergyLabel,
  initialAskingPrice,
  initialNhg,
  variant = "full",
  onCapacityChange,
}: {
  initialEnergyLabel?: string;
  initialAskingPrice?: number;
  initialNhg?: boolean;
  variant?: "full" | "onboarding";
  onCapacityChange?: (ready: boolean) => void;
}) {
  const onboarding = variant === "onboarding";
  const t = useTranslations("hypotheek");
  const locale = useLocale();
  const pathname = usePathname();
  const onCapacityChangeRef = useRef(onCapacityChange);
  onCapacityChangeRef.current = onCapacityChange;
  const [state, setState] = useState<CalculatorState>(() => {
    const defaults = defaultCalculatorState();
    const energyLabel = parseCanonicalEnergyLabel(initialEnergyLabel);
    if (energyLabel) defaults.energyLabel = energyLabel;
    if (initialAskingPrice && initialAskingPrice > 0) defaults.askingPrice = initialAskingPrice;
    if (initialNhg != null) {
      defaults.nhg = initialNhg;
      defaults.interestRate = marketIndicativeRate(null, defaults.fixedPeriodYears, initialNhg);
    }
    return defaults;
  });
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
  const [linkCopied, setLinkCopied] = useState(false);

  // Share only the non-sensitive scenario trio (price, label, NHG) — never
  // income or debt details, which stay in the workspace/account.
  async function copyScenarioLink() {
    const params = new URLSearchParams();
    if (state.askingPrice > 0) params.set("price", String(state.askingPrice));
    if (state.energyLabel) params.set("label", state.energyLabel);
    params.set("nhg", state.nhg ? "1" : "0");
    const url = `${window.location.origin}/${locale}${pathname}?${params.toString()}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      window.prompt(t("copyPrompt"), url);
    }
  }

  const applyRestored = useCallback((restored: CalculatorState) => {
    const energyLabel = parseCanonicalEnergyLabel(initialEnergyLabel);
    if (energyLabel) restored.energyLabel = energyLabel;
    if (initialAskingPrice && initialAskingPrice > 0) restored.askingPrice = initialAskingPrice;
    if (initialNhg != null) restored.nhg = initialNhg;
    if (!restored.rateTouched) restored.interestRate = marketIndicativeRate(marketRef.current, restored.fixedPeriodYears, restored.nhg);
    setState(restored);
    if (calculatorFundsTotal(restored) > 0) setOpenFunds(true);
    if (filledDebtKeys(restored).length) {
      setOpenDebts(true);
      setAddedDebts(filledDebtKeys(restored));
    }
    if (restored.studentLoanRemaining > 0 && restored.studentLoanMonthly <= 0) setStudentMode("remaining");
    if (EXTRA_WORK.includes(restored.applicant.workType) || EXTRA_WORK.includes(restored.partner.workType)) setShowMoreWork(true);
    if (restored.applicant.alimonyAnnual || restored.applicant.reachedAow || restored.partner.alimonyAnnual || restored.partner.reachedAow) setShowIncomeExtras(true);
  }, [initialAskingPrice, initialEnergyLabel, initialNhg]);

  const { authenticated, saveStatus } = useMortgagePersistence({ state, applyRestored });

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    apiFetch<MortgageMarketSnapshot>("/api/mortgage/market", { signal: controller.signal })
      .then((response) => {
        const snapshot = response.ok ? response.data : null;
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

  const result = useMemo(() => calculateMortgageCapacity(calculatorStateToFinance(state, studentMode), {
    energyLabel: state.energyLabel,
    askingPrice: state.askingPrice,
    nhg: state.nhg,
  }, market ?? undefined), [market, state, studentMode]);

  useEffect(() => {
    onCapacityChangeRef.current?.(result.available);
  }, [result.available]);

  const funds = calculatorFundsTotal(state);
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
    () => (!onboarding && displayLoan > 0 ? buildMortgageSchedule(displayLoan, state.interestRate, "annuity") : null),
    [displayLoan, onboarding, state.interestRate],
  );
  const linearSchedule = useMemo(
    () => (!onboarding && displayLoan > 0 ? buildMortgageSchedule(displayLoan, state.interestRate, "linear") : null),
    [displayLoan, onboarding, state.interestRate],
  );
  const activeSchedule = state.repayment === "linear" ? linearSchedule : annuitySchedule;

  const housingTax = useMemo(() => {
    if (onboarding || !activeSchedule || displayLoan <= 0) return null;
    return summarizeHousingTax({
      taxableIncome: result.toetsinkomen,
      wozValue: effectiveWoz,
      schedule: activeSchedule,
      oneOffDeductibleCosts: detailedCosts?.deductibleTotal ?? 0,
      reference,
    });
  }, [activeSchedule, detailedCosts?.deductibleTotal, displayLoan, effectiveWoz, onboarding, reference, result.toetsinkomen]);

  const impact = useMemo(
    () => (!onboarding && displayLoan > 0 ? rateImpactRows(displayLoan, state.interestRate, state.repayment) : []),
    [displayLoan, onboarding, state.interestRate, state.repayment],
  );

  const scenarios = useMemo(() => {
    if (!result.available) return [];
    return buildMortgageScenarios(calculatorStateToFinance(state, studentMode), {
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
  const debts = debtSummary(state, t);
  const shownDebts = Array.from(new Set([...filledDebtKeys(state), ...addedDebts]));
  const unusedDebts = DEBT_FIELDS.filter((item) => !shownDebts.includes(item.key));
  const workOptions = showMoreWork ? WORK_TYPES : WORK_TYPES.filter((item) => PRIMARY_WORK.includes(item.value));
  const highlightKeys = new Set(["max-loan", "max-price", "nhg", "lease", "student", "revolving", "funds-gap"]);

  return <>
    <div className="mortgage-account-bar" role="status">
      {saveStatus === "saved" && <span><ShieldCheck size={14} /> {t("savedAccount")}{onboarding ? "" : <> · <Link href="/mijn-aankoop">{t("openDashboard")}</Link></>}</span>}
      {saveStatus === "saving" && <span>{t("saving")}</span>}
      {saveStatus === "local" && <span>{t("savedLocal")}{onboarding ? "" : <> · <Link href="/mijn-aankoop">{t("viewDashboard")}</Link></>}</span>}
      {saveStatus === "login" && <span><CircleAlert size={14} /> <Link href="/login">{t("login")}</Link> {t("loginToSave")}</span>}
      {saveStatus === "idle" && !authenticated && <span><Link href="/login">{t("login")}</Link> {t("loginToSync")}</span>}
    </div>
    <div className={`mortgage-layout${onboarding ? " mortgage-layout-onboarding" : ""}`}>
      <section className="mortgage-form-card">
        <div className="section-kicker">{t("step1Kicker")}</div>
        <h2>{t("step1Title")}</h2>
        <p className="mortgage-lead">{t("step1Lead")}</p>
        <div className="work-chips" role="group" aria-label={t("buyersAria")}>
          <button type="button" className={!state.withPartner ? "active" : undefined} aria-pressed={!state.withPartner} onClick={() => patch("withPartner", false)}>{t("alone")}</button>
          <button type="button" className={state.withPartner ? "active" : undefined} aria-pressed={state.withPartner} onClick={() => patch("withPartner", true)}>{t("withPartner")}</button>
        </div>
        <PersonFields
          title={state.withPartner ? t("you") : undefined}
          person={state.applicant}
          workOptions={workOptions}
          showMoreWork={showMoreWork}
          onMoreWork={() => setShowMoreWork(true)}
          showExtras={showIncomeExtras}
          onExtras={() => setShowIncomeExtras(true)}
          onChange={(applicant) => patch("applicant", applicant)}
        />
        {state.withPartner && <PersonFields
          title={t("partner")}
          person={state.partner}
          workOptions={workOptions}
          showMoreWork={showMoreWork}
          onMoreWork={() => setShowMoreWork(true)}
          showExtras={showIncomeExtras}
          onExtras={() => setShowIncomeExtras(true)}
          onChange={(partner) => patch("partner", partner)}
        />}
        {youngSelfEmployed && <p className="mortgage-warning"><CircleAlert size={14} /> {t("selfEmployedWarning")}</p>}

        <div className="mortgage-block">
          <div className="section-kicker">{t("step2Kicker")}</div>
          <h3>{t("step2Title")}</h3>
          <p className="mortgage-hint">{t("step2Hint")}</p>
          <div className="work-chips mortgage-period-chips" role="group" aria-label={t("periodAria")}>
            {([5, 10, 20, 30] as FixedPeriodYears[]).map((period) => {
              const periodRate = marketIndicativeRate(market, period, state.nhg);
              return (
                <button type="button" key={period} className={state.fixedPeriodYears === period ? "active" : undefined} aria-pressed={state.fixedPeriodYears === period} onClick={() => setPeriod(period)}>
                  <span>{t("yearsLabel", { period })}</span>
                  <small>{formatRatePct(periodRate)}</small>
                </button>
              );
            })}
          </div>
          <div className="mortgage-rate-row">
            <span className="mortgage-rate-label">
              {t("rateLabel")}
              <small>{state.rateTouched ? t("rateManual") : market?.indicativeRates.live ? t("rateMarketAsOf", { asOf: market.indicativeRates.asOf }) : t("rateIndication")}</small>
            </span>
            <div className="mortgage-rate-controls">
              <button type="button" className="mortgage-rate-nudge" onClick={() => nudgeRate(-0.1)} aria-label={t("rateDownAria")}>−</button>
              <label className="mortgage-rate-input">
                <span className="sr-only">{t("rateSrOnly")}</span>
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
              <button type="button" className="mortgage-rate-nudge" onClick={() => nudgeRate(0.1)} aria-label={t("rateUpAria")}>+</button>
            </div>
          </div>
          {(state.rateTouched || Math.abs(state.interestRate - marketRate) > 0.001) && (
            <button type="button" className="text-link mortgage-toggle" onClick={useMarketRate}>
              {t("useMarketRate", { rate: marketRate.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) })}
            </button>
          )}
          <p className="mortgage-hint">{rateHint(market, state.fixedPeriodYears, state.nhg, t)}</p>
          <label className="mortgage-check"><input type="checkbox" checked={state.nhg} onChange={(event) => setNhg(event.target.checked)} /> {t("nhgCheck", { limit: formatEuro(NHG.limit) })}</label>
          <div className="work-chips" role="group" aria-label={t("repaymentAria")}>
            <button type="button" className={state.repayment === "annuity" ? "active" : undefined} aria-pressed={state.repayment === "annuity"} onClick={() => patch("repayment", "annuity")}>{t("annuity")}</button>
            <button type="button" className={state.repayment === "linear" ? "active" : undefined} aria-pressed={state.repayment === "linear"} onClick={() => patch("repayment", "linear")}>{t("linear")}</button>
          </div>
        </div>

        <Foldable
          kicker={t("fundsKicker")}
          title={funds > 0 ? formatEuro(funds) : t("fundsFallbackTitle")}
          open={openFunds}
          onToggle={() => setOpenFunds((value) => !value)}
        >
          <p className="mortgage-hint">{t("fundsHint")}</p>
          <div className="form-grid">
            <MoneyField label={t("savings")} value={state.savings} onChange={(savings) => patch("savings", savings)} step={1000} />
            <MoneyField label={t("gift")} value={state.gift} onChange={(gift) => patch("gift", gift)} step={1000} />
            <MoneyField label={t("saleEquity")} value={state.saleEquity} onChange={(saleEquity) => patch("saleEquity", saleEquity)} step={1000} />
          </div>
        </Foldable>

        <div className={`mortgage-block ${openDebts || shownDebts.length ? "is-open" : ""}`}>
          <button type="button" className="mortgage-fold" onClick={() => setOpenDebts((value) => !value)} aria-expanded={openDebts}>
            <span>
              <span className="section-kicker">{t("debtsKicker")}</span>
              <strong>{debts.length ? debts.join(" · ") : t("debtsFallback")}</strong>
            </span>
            <ChevronDown size={16} />
          </button>
          <p className="mortgage-hint">{t("debtsHint")}</p>
          {unusedDebts.length > 0 && <div className="work-chips mortgage-add-debts" role="group" aria-label={t("addDebtAria")}>
            {unusedDebts.map((item) => (
              <button type="button" key={item.key} onClick={() => {
                setAddedDebts((current) => current.includes(item.key) ? current : [...current, item.key]);
                setOpenDebts(true);
              }}>+ {t(item.addKey)}</button>
            ))}
          </div>}
          {(openDebts || shownDebts.length > 0) && shownDebts.map((key) => {
            const field = DEBT_FIELDS.find((item) => item.key === key);
            if (!field) return null;
            const fieldLabel = t(field.labelKey);
            return <div className="mortgage-debt-row" key={key}>
              {key === "student" ? <>
                <div className="work-chips" role="group" aria-label={t("studentInputAria")}>
                  <button type="button" className={studentMode === "monthly" ? "active" : undefined} aria-pressed={studentMode === "monthly"} onClick={() => setStudentMode("monthly")}>{t("studentMonthly")}</button>
                  <button type="button" className={studentMode === "remaining" ? "active" : undefined} aria-pressed={studentMode === "remaining"} onClick={() => setStudentMode("remaining")}>{t("studentRemainingMode")}</button>
                </div>
                {studentMode === "monthly"
                  ? <MoneyField label={t("duoMonthlyLabel")} value={state.studentLoanMonthly} onChange={(studentLoanMonthly) => patch("studentLoanMonthly", studentLoanMonthly)} />
                  : <>
                    <MoneyField label={t("studentRemainingLabel")} value={state.studentLoanRemaining} onChange={(studentLoanRemaining) => patch("studentLoanRemaining", studentLoanRemaining)} step={500} />
                    <label className="mortgage-span"><input type="checkbox" checked={state.studentLoanSf35} onChange={(event) => patch("studentLoanSf35", event.target.checked)} /> {t("studentSf35")}</label>
                  </>}
              </> : key === "lease" ? <MoneyField label={fieldLabel} hint={field.hintKey ? t(field.hintKey) : undefined} value={state.privateLeaseMonthly} onChange={(privateLeaseMonthly) => patch("privateLeaseMonthly", privateLeaseMonthly)} />
              : key === "installment" ? <MoneyField label={fieldLabel} value={state.installmentLoanMonthly} onChange={(installmentLoanMonthly) => patch("installmentLoanMonthly", installmentLoanMonthly)} />
              : key === "revolving" ? <MoneyField label={fieldLabel} hint={field.hintKey ? t(field.hintKey) : undefined} value={state.revolvingCreditLimit} onChange={(revolvingCreditLimit) => patch("revolvingCreditLimit", revolvingCreditLimit)} step={500} />
              : key === "erfpacht" ? <MoneyField label={fieldLabel} value={state.groundLeaseMonthly} onChange={(groundLeaseMonthly) => patch("groundLeaseMonthly", groundLeaseMonthly)} />
              : key === "alimony" ? <MoneyField label={fieldLabel} value={state.alimonyPaidMonthly} onChange={(alimonyPaidMonthly) => patch("alimonyPaidMonthly", alimonyPaidMonthly)} />
              : <MoneyField label={fieldLabel} value={state.otherMonthlyDebts} onChange={(otherMonthlyDebts) => patch("otherMonthlyDebts", otherMonthlyDebts)} />}
              <button type="button" className="text-link" aria-label={t("removeDebtAria", { label: fieldLabel })} onClick={() => {
                setState((current) => clearDebt(current, key));
                setAddedDebts((current) => current.filter((item) => item !== key));
              }}>{t("remove")}</button>
            </div>;
          })}
        </div>

        <div className="mortgage-block">
          <div className="section-kicker">{t("houseKicker")}</div>
          <h3>{t("houseTitle")}</h3>
          <div className="form-grid">
            <MoneyField label={t("askingPrice")} value={state.askingPrice} onChange={(askingPrice) => patch("askingPrice", askingPrice)} step={5000} />
            <label>{t("energyLabelField")}
              <select value={state.energyLabel} onChange={(event) => patch("energyLabel", event.target.value)}>
                <option value="">{t("energyUnknown")}</option>
                {ENERGY_LABELS.map((label) => <option value={label} key={label}>{label}</option>)}
              </select>
            </label>
          </div>
          <label className="mortgage-check"><input type="checkbox" checked={state.includeEnergyMeasures} onChange={(event) => patch("includeEnergyMeasures", event.target.checked)} /> {t("energyMeasuresCheck")}</label>
          {state.askingPrice > 0 && <>
            <label className="mortgage-check"><input type="checkbox" checked={state.starterExemption} onChange={(event) => patch("starterExemption", event.target.checked)} /> {t("starterExemptionCheck")}</label>
            {state.starterExemption && <div className="form-grid"><label>{t("yourAge")}
              <input type="number" inputMode="numeric" min="18" max="120" value={state.buyerAge || ""} onChange={(event) => patch("buyerAge", Number(event.target.value) || 0)} />
            </label></div>}
          </>}
          {state.energyLabel.startsWith("A++++") && <label className="mortgage-check"><input type="checkbox" checked={state.energyPerformanceGuarantee} onChange={(event) => patch("energyPerformanceGuarantee", event.target.checked)} /> {t("epgCheck")}</label>}
        </div>
      </section>

      <aside className="mortgage-result-card" id="hypotheek-result" aria-live="polite">
        <div className="mortgage-result-head">
          <span className="section-kicker"><Calculator size={13} /> {t("normsKicker", { year: MORTGAGE_NORMS_YEAR })}</span>
          <span className="coverage-pill"><ShieldCheck size={12} /> {t("noAdvicePill")}</span>
        </div>
        {!result.available ? <>
          <h2>{t("resultPlaceholderTitle")}</h2>
          <p>{t("resultPlaceholderCopy")}</p>
        </> : <>
          <p className="mortgage-kicker">{t("maxForPurchaseKicker")}</p>
          <div className="mortgage-amount">{formatEuro(result.maxLoanForPurchase)}</div>
          <p className="mortgage-result-note">
            {t("resultNoteMaxPrice", { price: formatEuro(result.maxPurchasePrice) })}
            {funds > 0 ? t("resultNoteFunds", { funds: formatEuro(funds) }) : ""}
            {t("resultNotePeriod")}
            {result.energyMeasureExtra > 0 ? t("resultNoteEnergy", { amount: formatEuro(result.energyMeasureExtra) }) : ""}
          </p>
          {result.nhgCapped && <div className="mortgage-nhg-banner">
            <p>
              {t("nhgCappedBanner", { limit: formatEuro(NHG.limit), uncapped: formatEuro(result.uncappedMaxLoanForPurchase) })}
            </p>
            <button type="button" className="text-link" onClick={() => setNhg(false)}>{t("showWithoutNhgCap")}</button>
          </div>}
          <div className="mortgage-result-grid">
            <div className="is-hero"><small>{state.repayment === "linear" ? t("firstMonthGross") : t("monthlyGross")}</small><strong>{formatEuro(result.monthlyPayment)}</strong></div>
            {housingTax && <div className="is-hero"><small>{t("netPerMonth")}</small><strong>{formatEuro(housingTax.ongoingMonthlyNet)}</strong></div>}
            <div><small>{t("testIncome")}</small><strong>{formatEuro(result.toetsinkomen)}</strong></div>
            {result.obligationBurden > 0 && <div><small>{t("obligationsInTest")}</small><strong>−{formatEuro(result.obligationBurden)}</strong></div>}
            {detailedCosts != null && <div><small>{t("buyerCosts")}</small><strong>{formatEuro(detailedCosts.total)}</strong></div>}
          </div>
          {fitCopy(result, t) && <div className={`mortgage-fit ${result.fit}`}>{fitCopy(result, t)}</div>}
          {!onboarding && <button className="text-link mortgage-toggle" type="button" onClick={() => void copyScenarioLink()}>{linkCopied ? <Check size={13} /> : <Link2 size={13} />} {linkCopied ? t("linkCopied") : t("copyScenarioLink")}</button>}
          {!onboarding && detailedCosts && <a className="text-link mortgage-toggle" href="#kosten-inzicht">{t("viewCostsCharts")}</a>}
          <button className="text-link mortgage-toggle" type="button" onClick={() => setOpenExplain((value) => !value)} aria-expanded={openExplain}>
            {openExplain ? t("hideRules") : t("howCalculated")}
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
          <MortgageScenarios scenarios={scenarios} open={openScenarios} onToggle={() => setOpenScenarios((value) => !value)} />
        </>}
        {!result.available ? null : <p className="mortgage-disclaimer"><Landmark size={14} /> {result.disclaimer}</p>}
        {result.available && market && <p className="mortgage-sources">
          {market.toetsrente.live ? <>{t("afmTestRate", { rate: market.toetsrente.rate.toLocaleString("nl-NL"), label: market.toetsrente.label })}</> : t("testRateMin")}
          {market.indicativeRates.live
            ? t("startRateSource", { source: market.indicativeRates.source, asOf: market.indicativeRates.asOf })
            : t("startRateBuiltIn")}
        </p>}
      </aside>
    </div>
    {!onboarding && (
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
        { label: t("refTransferTax"), url: reference.sources.transferTax },
        { label: t("refNhg"), url: reference.sources.nhg },
        { label: t("refKadaster"), url: reference.sources.kadaster },
        { label: t("refBox1"), url: reference.sources.box1 },
        { label: t("refEigenwoningforfait"), url: reference.sources.eigenwoningforfait },
      ]}
    />
    )}
    {result.available && <a className="mortgage-mobile-dock" href="#hypotheek-result">
      <span>
        <small>{t("dockMaxMortgage")}</small>
        <strong>{formatEuro(result.maxLoanForPurchase)}</strong>
      </span>
      <em>{t("dockDetails")}</em>
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
  const t = useTranslations("hypotheek");
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
    <div className="work-chips" role="group" aria-label={title ? t("workTypeAriaNamed", { title }) : t("workTypeAria")}>
      {workOptions.map((item) => <button type="button" key={item.value} className={work === item.value ? "active" : undefined} aria-pressed={work === item.value} onClick={() => onChange({ ...person, workType: item.value })}>{item.label}</button>)}
      {!showMoreWork && <button type="button" className="is-quiet" onClick={onMoreWork}>{t("moreWork")}</button>}
    </div>
    {needsJob && <>
      <div className="work-chips" role="group" aria-label={t("entryAria")}>
        <button type="button" className={person.incomeEntry === "monthly" ? "active" : undefined} aria-pressed={person.incomeEntry === "monthly"} onClick={() => onChange(switchIncomeEntry(person, "monthly"))}>{t("entryMonthly")}</button>
        <button type="button" className={person.incomeEntry === "annual" ? "active" : undefined} aria-pressed={person.incomeEntry === "annual"} onClick={() => onChange(switchIncomeEntry(person, "annual"))}>{t("entryAnnual")}</button>
      </div>
      {person.incomeEntry === "monthly" ? <>
        <div className="form-grid">
          <MoneyField className="mortgage-income" label={t("grossMonthly")} hint={t("grossMonthlyHint")} value={person.monthlyGross} onChange={(monthlyGross) => onChange({ ...person, monthlyGross })} step={50} placeholder="3500" />
        </div>
        <div className="mortgage-subblock">
          <span className="mortgage-subhead">{t("holidayHead")}</span>
          <div className="work-chips" role="group" aria-label={t("holidayAria")}>
            <button type="button" className={person.holidayMode === "standard" ? "active" : undefined} aria-pressed={person.holidayMode === "standard"} onClick={() => onChange({ ...person, holidayMode: "standard" })}>{t("holidayStandard")}</button>
            <button type="button" className={person.holidayMode === "included" ? "active" : undefined} aria-pressed={person.holidayMode === "included"} onClick={() => onChange({ ...person, holidayMode: "included" })}>{t("holidayIncluded")}</button>
            <button type="button" className={person.holidayMode === "custom" ? "active" : undefined} aria-pressed={person.holidayMode === "custom"} onClick={() => onChange({ ...person, holidayMode: "custom" })}>{t("holidayCustomBtn")}</button>
          </div>
          {person.holidayMode === "custom" && <div className="form-grid"><MoneyField label={t("holidayCustomYear")} value={person.holidayCustom} onChange={(holidayCustom) => onChange({ ...person, holidayCustom })} step={50} /></div>}
        </div>
      </> : <div className="form-grid">
        <MoneyField className="mortgage-income" label={t("grossAnnual")} hint={t("grossAnnualHint")} value={person.grossAnnual} onChange={(grossAnnual) => onChange({ ...person, grossAnnual })} step={1000} placeholder="55000" />
      </div>}
      <button className="text-link mortgage-toggle" type="button" onClick={() => setOpenPay((value) => !value)} aria-expanded={openPay}>
        {openPay ? t("payHideExtras") : t("payAddExtras")}
      </button>
      {openPay && <div className="form-grid">
        <label className="mortgage-span"><input type="checkbox" checked={person.hasThirteenth} onChange={(event) => onChange({ ...person, hasThirteenth: event.target.checked, thirteenthMonth: event.target.checked ? person.thirteenthMonth || person.monthlyGross : person.thirteenthMonth })} /> {t("thirteenthCheck")}</label>
        {person.hasThirteenth && <MoneyField label={t("thirteenthLabel")} hint={t("thirteenthHint")} value={person.thirteenthMonth} onChange={(thirteenthMonth) => onChange({ ...person, thirteenthMonth, hasThirteenth: true })} step={50} />}
        <MoneyField label={t("yearEndPayout")} value={person.yearEndPayout} onChange={(yearEndPayout) => onChange({ ...person, yearEndPayout })} step={50} />
        <MoneyField label={t("fixedAllowance")} hint={t("fixedAllowanceHint")} value={person.monthlyAllowances} onChange={(monthlyAllowances) => onChange({ ...person, monthlyAllowances })} step={25} />
        <MoneyField label={t("structuralBonus")} value={person.structuralBonus} onChange={(structuralBonus) => onChange({ ...person, structuralBonus, bonus: structuralBonus })} step={100} />
      </div>}
      {openPay && <>
        <p className="mortgage-hint">{t("variableBonusHint")}</p>
        <YearFields label={t("variableBonusLabel")} years={person.variableBonus} onChange={(variableBonus) => onChange({ ...person, variableBonus })} />
      </>}
      {pay.toetsinkomen > 0 && person.incomeEntry === "monthly" && <ul className="mortgage-pay-lines">
        {pay.lines.map((line) => <li key={line.key}><span>{line.label}</span><strong>{formatEuro(line.amount)}</strong></li>)}
        <li className="is-total"><span>{t("testIncome")}</span><strong>{formatEuro(pay.toetsinkomen)}</strong></li>
      </ul>}
      {work === "temporary" && <label className="mortgage-span"><input type="checkbox" checked={person.intent} onChange={(event) => onChange({ ...person, intent: event.target.checked })} /> {t("intentCheck")}</label>}
      {work === "flex" && <label className="mortgage-span"><input type="checkbox" checked={person.perspectief} onChange={(event) => onChange({ ...person, perspectief: event.target.checked })} /> {t("perspectiefCheck")}</label>}
    </>}
    {!showExtras && <button className="text-link" type="button" onClick={onExtras}>{t("extrasButton")}</button>}
    {showExtras && <div className="form-grid">
      <MoneyField label={t("alimonyReceived")} value={person.alimonyAnnual} onChange={(alimonyAnnual) => onChange({ ...person, alimonyAnnual })} step={100} />
      <label className="mortgage-span"><input type="checkbox" checked={person.reachedAow} onChange={(event) => onChange({ ...person, reachedAow: event.target.checked })} /> {t("aowReached")}</label>
    </div>}
    {needsHistory && <YearFields label={t("historyLabel")} years={person.history} onChange={(history) => onChange({ ...person, history })} />}
    {needsProfits && <>
      <label className="mortgage-plain">{t("yearsActiveLabel")}<input type="number" inputMode="numeric" min="0" max="50" step="0.5" value={person.monthsActive ? person.monthsActive / 12 : ""} onChange={(event) => onChange({ ...person, monthsActive: Math.round((Number(event.target.value) || 0) * 12) })} /></label>
      <YearFields label={t("profitsLabel")} years={person.profits} onChange={(profits) => onChange({ ...person, profits })} />
    </>}
    {work === "dga" && <>
      <YearFields label={t("bvSalaryLabel")} years={person.box1} onChange={(box1) => onChange({ ...person, box1 })} />
      <YearFields label={t("dividendLabel")} years={person.dividend} onChange={(dividend) => onChange({ ...person, dividend })} />
    </>}
    {work === "pension" && <div className="form-grid"><MoneyField className="mortgage-income" label={t("pensionLabel")} value={person.pensionAnnual} onChange={(pensionAnnual) => onChange({ ...person, pensionAnnual })} step={1000} /></div>}
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
  const t = useTranslations("hypotheek");
  const captions = [t("yearLast"), t("yearBefore"), t("twoYearsAgo")];
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

function rateHint(market: MortgageMarketSnapshot | null, period: FixedPeriodYears, nhg: boolean, t: Translator) {
  const rate = marketIndicativeRate(market, period, nhg).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (period < 10) {
    const floor = market?.toetsrente.live ? t("toetsLive", { rate: market.toetsrente.rate.toLocaleString("nl-NL"), label: market.toetsrente.label }) : t("toetsMin");
    return t("rateHintShort", { rate, floor });
  }
  if (market?.indicativeRates.live) {
    return t("rateHintMarket", { rate, asOf: market.indicativeRates.asOf, extra: nhg ? t("nhgIndication") : "" });
  }
  return t("rateHintFallback", { rate });
}

export function MortgagePageIntro() {
  const t = useTranslations("hypotheek");
  return <div className="mortgage-heading">
    <div>
      <div className="eyebrow"><Sparkles size={13} /> {t("introEyebrow", { year: MORTGAGE_NORMS_YEAR })}</div>
      <h1>{t("introTitle")}</h1>
      <p className="hero-copy">{t("introCopy")}</p>
    </div>
    <div className="mortgage-heading-note"><Wallet size={16} /> {t("introNote")}</div>
  </div>;
}
