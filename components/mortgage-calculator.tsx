"use client";

import { Calculator, ChevronDown, CircleAlert, Landmark, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  MORTGAGE_NORMS_YEAR,
  calculateMortgageCapacity,
  defaultDgaSource,
  defaultEmploymentSource,
  defaultPensionSource,
  defaultSelfEmployedSource,
  emptyTriple,
  marketIndicativeRate,
  ownFundsTotal,
  type FixedPeriodYears,
  type IncomeSource,
  type MortgageFinance,
  type MortgageMarketSnapshot,
  type PersonFinance,
  type RepaymentType,
  type WorkType,
  type YearTriple,
} from "@/src/lib/mortgage";
import { formatEuro } from "@/src/lib/purchase";

const STORAGE_KEY = "woonreality.mortgage.v2";
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
  return {
    ...base,
    contract,
    grossAnnual: person.grossAnnual,
    thirteenthMonth: person.thirteenthMonth,
    bonus: person.bonus,
    history: person.history,
    perspectief: person.workType === "flex" && person.perspectief,
  };
}

function sourcesFromPerson(person: PersonForm): IncomeSource[] {
  const sources: IncomeSource[] = [];
  if (person.workType === "self_employed") sources.push({ ...defaultSelfEmployedSource(), monthsActive: person.monthsActive, profits: person.profits });
  else if (person.workType === "dga") sources.push({ ...defaultDgaSource(), box1: person.box1, dividend: person.dividend });
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
  if (state.studentLoanMonthly) parts.push("studieschuld");
  else if (state.studentLoanRemaining) parts.push("studieschuld");
  if (state.revolvingCreditLimit) parts.push("kredietlimiet");
  if (state.installmentLoanMonthly) parts.push("leningen");
  if (state.groundLeaseMonthly) parts.push("erfpacht");
  if (state.alimonyPaidMonthly) parts.push("alimentatie");
  if (state.otherMonthlyDebts) parts.push("overig");
  return parts;
}

export function MortgageCalculator({ initialEnergyLabel, initialAskingPrice, initialNhg }: { initialEnergyLabel?: string; initialAskingPrice?: number; initialNhg?: boolean }) {
  const [state, setState] = useState<CalculatorState>(() => {
    const defaults = defaultState();
    if (initialEnergyLabel) defaults.energyLabel = initialEnergyLabel;
    if (initialAskingPrice && initialAskingPrice > 0) defaults.askingPrice = initialAskingPrice;
    if (initialNhg != null) {
      defaults.nhg = initialNhg;
      defaults.interestRate = marketIndicativeRate(null, defaults.fixedPeriodYears, initialNhg);
    }
    return defaults;
  });
  const [ready, setReady] = useState(false);
  const [market, setMarket] = useState<MortgageMarketSnapshot | null>(null);
  const [showIncomeExtras, setShowIncomeExtras] = useState(false);
  const [showMoreWork, setShowMoreWork] = useState(false);
  const [openFunds, setOpenFunds] = useState(false);
  const [openDebts, setOpenDebts] = useState(false);
  const [openLoan, setOpenLoan] = useState(false);
  const [openExplain, setOpenExplain] = useState(false);
  const [studentMode, setStudentMode] = useState<"monthly" | "remaining">("monthly");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const restored = restoreState(JSON.parse(raw), defaultState());
        if (initialEnergyLabel) restored.energyLabel = initialEnergyLabel;
        if (initialAskingPrice && initialAskingPrice > 0) restored.askingPrice = initialAskingPrice;
        if (initialNhg != null) restored.nhg = initialNhg;
        if (!restored.rateTouched) restored.interestRate = marketIndicativeRate(null, restored.fixedPeriodYears, restored.nhg);
        setState(restored);
        if (fundsTotal(restored) > 0) setOpenFunds(true);
        if (debtSummary(restored).length) setOpenDebts(true);
        if (restored.studentLoanRemaining > 0 && restored.studentLoanMonthly <= 0) setStudentMode("remaining");
        if (EXTRA_WORK.includes(restored.applicant.workType) || EXTRA_WORK.includes(restored.partner.workType)) setShowMoreWork(true);
        if (restored.applicant.thirteenthMonth || restored.applicant.bonus || restored.applicant.alimonyAnnual || restored.applicant.reachedAow) setShowIncomeExtras(true);
      }
    } catch { /* ignore */ }
    setReady(true);
  }, [initialAskingPrice, initialEnergyLabel, initialNhg]);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }, [ready, state]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/mortgage/market")
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
    return () => { cancelled = true; };
  }, []);

  const result = useMemo(() => calculateMortgageCapacity(toFinance(state, studentMode), {
    energyLabel: state.energyLabel,
    askingPrice: state.askingPrice,
    nhg: state.nhg,
  }, market ?? undefined), [market, state, studentMode]);

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

  const youngSelfEmployed = [state.applicant, state.withPartner ? state.partner : null].some((person) => person && (person.workType === "self_employed" || person.workType === "dga" || person.workType === "mix") && person.monthsActive < 12);
  const funds = fundsTotal(state);
  const debts = debtSummary(state);
  const workOptions = showMoreWork ? WORK_TYPES : WORK_TYPES.filter((item) => PRIMARY_WORK.includes(item.value));
  const highlightKeys = new Set(["max-loan", "max-price", "lease", "student", "revolving", "funds-gap"]);

  return <>
    <div className="mortgage-layout">
      <section className="mortgage-form-card">
        <div className="section-kicker">Stap 1 · inkomen</div>
        <h2>Wat is je inkomen?</h2>
        <p className="mortgage-lead">Eén bedrag is genoeg voor een eerste schets. Partner, lasten en eigen geld kun je daarna toevoegen.</p>
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
          <p className="mortgage-hint">10 jaar vast is de standaardtoets. Korter dan 10 jaar wordt wettelijk zwaarder getoetst.</p>
          <div className="work-chips" role="group" aria-label="Rentevastperiode">
            {([5, 10, 20, 30] as FixedPeriodYears[]).map((period) => (
              <button type="button" key={period} className={state.fixedPeriodYears === period ? "active" : undefined} onClick={() => setPeriod(period)}>{period} jaar</button>
            ))}
          </div>
          <label className="mortgage-check"><input type="checkbox" checked={state.nhg} onChange={(event) => setNhg(event.target.checked)} /> NHG meenemen (grens € 470.000). Vaak iets lagere rente, soms een lager maximum.</label>
          <button className="text-link mortgage-toggle" type="button" onClick={() => setOpenLoan((value) => !value)}>{openLoan ? "Verberg extra hypotheekopties" : "Rente, aflosvorm of verduurzaming aanpassen"}</button>
          {openLoan && <div className="form-grid">
            <label>Rente (%)
              <input type="number" min="0" max="15" step="0.01" value={state.interestRate || ""} onChange={(event) => setState((current) => ({ ...current, interestRate: Number(event.target.value) || 0, rateTouched: true }))} />
            </label>
            <label>Aflosvorm
              <select value={state.repayment} onChange={(event) => patch("repayment", event.target.value as RepaymentType)}>
                <option value="annuity">Annuïteit</option>
                <option value="linear">Lineair</option>
              </select>
            </label>
            <label className="mortgage-span"><input type="checkbox" checked={state.includeEnergyMeasures} onChange={(event) => patch("includeEnergyMeasures", event.target.checked)} /> Extra lenen voor verduurzaming (alleen te gebruiken voor energiebesparing)</label>
            <p className="mortgage-hint mortgage-span">{rateHint(market, state.fixedPeriodYears, state.nhg)}</p>
          </div>}
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

        <Foldable
          kicker="Optioneel · lasten"
          title={debts.length ? debts.join(" · ") : "Lease, studieschuld of andere lasten"}
          open={openDebts}
          onToggle={() => setOpenDebts((value) => !value)}
        >
          <p className="mortgage-hint">Alleen invullen wat je hebt. Lege velden tellen niet mee.</p>
          <div className="form-grid">
            <MoneyField label="Private lease per maand" hint="De hele maandlast telt mee." value={state.privateLeaseMonthly} onChange={(privateLeaseMonthly) => patch("privateLeaseMonthly", privateLeaseMonthly)} />
            <MoneyField label="Andere leningen per maand" value={state.installmentLoanMonthly} onChange={(installmentLoanMonthly) => patch("installmentLoanMonthly", installmentLoanMonthly)} />
            <MoneyField label="Creditcard- of kredietlimiet" hint="Ook als je die niet gebruikt." value={state.revolvingCreditLimit} onChange={(revolvingCreditLimit) => patch("revolvingCreditLimit", revolvingCreditLimit)} step={500} />
            <MoneyField label="Erfpacht per maand" value={state.groundLeaseMonthly} onChange={(groundLeaseMonthly) => patch("groundLeaseMonthly", groundLeaseMonthly)} />
            <MoneyField label="Alimentatie die je betaalt" value={state.alimonyPaidMonthly} onChange={(alimonyPaidMonthly) => patch("alimonyPaidMonthly", alimonyPaidMonthly)} />
            <MoneyField label="Overige maandlasten" value={state.otherMonthlyDebts} onChange={(otherMonthlyDebts) => patch("otherMonthlyDebts", otherMonthlyDebts)} />
          </div>
          <div className="mortgage-subblock">
            <span className="mortgage-subhead">Studieschuld</span>
            <div className="work-chips" role="group" aria-label="Studieschuld invoer">
              <button type="button" className={studentMode === "monthly" ? "active" : undefined} onClick={() => setStudentMode("monthly")}>Maandbedrag DUO</button>
              <button type="button" className={studentMode === "remaining" ? "active" : undefined} onClick={() => setStudentMode("remaining")}>Ik ken alleen het restant</button>
            </div>
            {studentMode === "monthly"
              ? <div className="form-grid"><MoneyField label="DUO-termijn per maand" value={state.studentLoanMonthly} onChange={(studentLoanMonthly) => patch("studentLoanMonthly", studentLoanMonthly)} /></div>
              : <div className="form-grid">
                <MoneyField label="Openstaande studieschuld" value={state.studentLoanRemaining} onChange={(studentLoanRemaining) => patch("studentLoanRemaining", studentLoanRemaining)} step={500} />
                <label className="mortgage-span"><input type="checkbox" checked={state.studentLoanSf35} onChange={(event) => patch("studentLoanSf35", event.target.checked)} /> Nieuwe studieschuld (vanaf 2024) — telt minder zwaar</label>
              </div>}
          </div>
        </Foldable>

        <div className="mortgage-block">
          <div className="section-kicker">Optioneel · deze woning</div>
          <h3>Past dit huis?</h3>
          <div className="form-grid">
            <MoneyField label="Vraagprijs" value={state.askingPrice} onChange={(askingPrice) => patch("askingPrice", askingPrice)} step={5000} />
            <label>Energielabel
              <select value={state.energyLabel} onChange={(event) => patch("energyLabel", event.target.value)}>
                <option value="">Nog niet bekend</option>
                {["A++++", "A+++", "A++", "A+", "A", "B", "C", "D", "E", "F", "G"].map((label) => <option value={label} key={label}>{label}</option>)}
              </select>
            </label>
          </div>
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
          <h2>Vul je inkomen in</h2>
          <p>Het maximum verschijnt hier meteen. Je hoeft nog geen lasten of eigen geld in te vullen.</p>
        </> : <>
          <p className="mortgage-kicker">Je kunt volgens deze schets lenen</p>
          <div className="mortgage-amount">{formatEuro(result.maxLoan)}</div>
          <p className="mortgage-result-note">Maximale koopsom {formatEuro(result.maxPurchasePrice)}{funds > 0 ? ` inclusief ${formatEuro(funds)} eigen geld` : ""}.</p>
          <div className="mortgage-result-grid">
            <div><small>{state.repayment === "linear" ? "Eerste maand" : "Maandlast"}</small><strong>{formatEuro(result.monthlyPayment)}</strong></div>
            <div><small>Toetsinkomen</small><strong>{formatEuro(result.toetsinkomen)}</strong></div>
            {result.obligationBurden > 0 && <div><small>Lasten in de toets</small><strong>−{formatEuro(result.obligationBurden)}</strong></div>}
            {result.buyerCosts != null && <div><small>Kosten koper</small><strong>{formatEuro(result.buyerCosts)}</strong></div>}
          </div>
          {result.fit !== "unknown" && <div className={`mortgage-fit ${result.fit}`}>{result.fit === "fits" ? "Deze vraagprijs past binnen de berekende leenruimte." : result.fit === "tight" ? "Krap: de vraagprijs ligt boven de koopsom. Extra eigen geld of een lager bod kan het gat dichten." : "Deze vraagprijs ligt boven wat deze rekenschets toelaat."}</div>}
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
        </>}
        <p className="mortgage-disclaimer"><Landmark size={14} /> {result.disclaimer}</p>
        {market && <p className="mortgage-sources">
          {market.toetsrente.live ? <>Toetsrente AFM {market.toetsrente.rate.toLocaleString("nl-NL")}% ({market.toetsrente.label}). </> : "Toetsrente: wettelijk minimum 5%. "}
          {market.indicativeRates.live
            ? <>Startrente uit {market.indicativeRates.source}, {market.indicativeRates.asOf}. Geen bankvergelijking.</>
            : "Startrente is een ingebouwde indicatie tot de marktrente geladen is."}
        </p>}
      </aside>
    </div>
    {result.available && <a className="mortgage-mobile-dock" href="#hypotheek-result">
      <span>
        <small>Maximale hypotheek</small>
        <strong>{formatEuro(result.maxLoan)}</strong>
      </span>
      <em>Bekijk uitleg</em>
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

  return <div className={title ? "mortgage-person" : "mortgage-person is-first"}>
    {title && <h3>{title}</h3>}
    <div className="work-chips" role="group" aria-label={title ? `Werktype ${title}` : "Werktype"}>
      {workOptions.map((item) => <button type="button" key={item.value} className={work === item.value ? "active" : undefined} onClick={() => onChange({ ...person, workType: item.value })}>{item.label}</button>)}
      {!showMoreWork && <button type="button" className="is-quiet" onClick={onMoreWork}>DGA, pensioen of mix</button>}
    </div>
    {needsJob && <div className="form-grid">
      <MoneyField className="mortgage-income" label="Bruto jaarinkomen" hint="Wat er op je jaaropgave staat, vóór belasting." value={person.grossAnnual} onChange={(grossAnnual) => onChange({ ...person, grossAnnual })} step={1000} placeholder="55000" />
      {work === "temporary" && <label className="mortgage-span"><input type="checkbox" checked={person.intent} onChange={(event) => onChange({ ...person, intent: event.target.checked })} /> Ik krijg een intentieverklaring voor vast werk</label>}
      {work === "flex" && <label className="mortgage-span"><input type="checkbox" checked={person.perspectief} onChange={(event) => onChange({ ...person, perspectief: event.target.checked })} /> Ik heb een perspectiefverklaring</label>}
    </div>}
    {!showExtras && <button className="text-link" type="button" onClick={onExtras}>{needsJob ? "13e maand, bonus, alimentatie of AOW" : "Alimentatie of AOW toevoegen"}</button>}
    {showExtras && <div className="form-grid">
      {needsJob && <>
        <MoneyField label="13e maand per jaar" value={person.thirteenthMonth} onChange={(thirteenthMonth) => onChange({ ...person, thirteenthMonth })} step={100} />
        <MoneyField label="Vaste bonus per jaar" value={person.bonus} onChange={(bonus) => onChange({ ...person, bonus })} step={100} />
      </>}
      <MoneyField label="Alimentatie die je ontvangt, per jaar" value={person.alimonyAnnual} onChange={(alimonyAnnual) => onChange({ ...person, alimonyAnnual })} step={100} />
      <label className="mortgage-span"><input type="checkbox" checked={person.reachedAow} onChange={(event) => onChange({ ...person, reachedAow: event.target.checked })} /> AOW-leeftijd bereikt</label>
    </div>}
    {needsHistory && <YearFields label="Bruto inkomen van de afgelopen jaren" years={person.history} onChange={(history) => onChange({ ...person, history })} />}
    {needsProfits && <>
      <label className="mortgage-plain">Hoeveel maanden onderneem je al?<input type="number" min="0" max="600" value={person.monthsActive || ""} onChange={(event) => onChange({ ...person, monthsActive: Number(event.target.value) || 0 })} /></label>
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
  return <label className={className}>{label}{hint ? <small className="mortgage-field-hint">{hint}</small> : null}<input type="number" min="0" step={step} inputMode="numeric" placeholder={placeholder} value={value || ""} onChange={(event) => onChange(Number(event.target.value) || 0)} /></label>;
}

function rateHint(market: MortgageMarketSnapshot | null, period: FixedPeriodYears, nhg: boolean) {
  const rate = marketIndicativeRate(market, period, nhg).toLocaleString("nl-NL", { minimumFractionDigits: 2 });
  if (period < 10) {
    const floor = market?.toetsrente.live ? `${market.toetsrente.rate.toLocaleString("nl-NL")}% (${market.toetsrente.label})` : "minimaal 5%";
    return `Startrente ${rate}%. Omdat je korter dan 10 jaar vastzet, toetsen we op ${floor}.`;
  }
  if (market?.indicativeRates.live) {
    return `Startrente ${rate}% uit recente DNB/ECB-cijfers. Pas aan als je een offerte hebt.`;
  }
  return `Startrente ${rate}%. Pas aan als je een offerte hebt.`;
}

export function MortgagePageIntro() {
  return <div className="mortgage-heading">
    <div>
      <div className="eyebrow"><Sparkles size={13} /> hypotheek {MORTGAGE_NORMS_YEAR}</div>
      <h1>Wat kun je lenen?</h1>
      <p className="hero-copy">Vul je inkomen in. De maximale hypotheek volgt de leennormen {MORTGAGE_NORMS_YEAR} en telt mee terwijl je typt. Geen account, geen bankofferte.</p>
    </div>
    <div className="mortgage-heading-note"><Wallet size={16} /> Dit is een wettelijke rekenschets. Een geldverstrekker kan strenger zijn.</div>
  </div>;
}
