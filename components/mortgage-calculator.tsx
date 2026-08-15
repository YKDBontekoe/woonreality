"use client";

import { Calculator, CircleAlert, Landmark, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  INDICATIVE_RATES,
  MORTGAGE_NORMS_YEAR,
  calculateMortgageCapacity,
  defaultDgaSource,
  defaultEmploymentSource,
  defaultPensionSource,
  defaultSelfEmployedSource,
  emptyTriple,
  indicativeRate,
  type FixedPeriodYears,
  type IncomeSource,
  type MortgageFinance,
  type PersonFinance,
  type RepaymentType,
  type WorkType,
  type YearTriple,
} from "@/src/lib/mortgage";
import { formatEuro } from "@/src/lib/purchase";

const STORAGE_KEY = "woonreality.mortgage.v1";

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
  otherMonthlyDebts: number;
  alimonyPaidMonthly: number;
  ownFunds: number;
  nhg: boolean;
  interestRate: number;
  rateTouched: boolean;
  fixedPeriodYears: FixedPeriodYears;
  repayment: RepaymentType;
  energyLabel: string;
  askingPrice: number;
  includeEnergyMeasures: boolean;
  energyPerformanceGuarantee: boolean;
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
    otherMonthlyDebts: 0,
    alimonyPaidMonthly: 0,
    ownFunds: 0,
    nhg: true,
    interestRate: indicativeRate(10, true),
    rateTouched: false,
    fixedPeriodYears: 10,
    repayment: "annuity",
    energyLabel: "",
    askingPrice: 0,
    includeEnergyMeasures: false,
    energyPerformanceGuarantee: false,
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
    otherMonthlyDebts: asNumber(record.otherMonthlyDebts),
    alimonyPaidMonthly: asNumber(record.alimonyPaidMonthly),
    ownFunds: asNumber(record.ownFunds),
    nhg: record.nhg === undefined ? defaults.nhg : Boolean(record.nhg),
    interestRate: asNumber(record.interestRate, defaults.interestRate),
    rateTouched: Boolean(record.rateTouched),
    fixedPeriodYears: period === 5 || period === 10 || period === 20 || period === 30 ? period : 10,
    repayment: record.repayment === "linear" ? "linear" : "annuity",
    energyLabel: typeof record.energyLabel === "string" ? record.energyLabel : defaults.energyLabel,
    askingPrice: asNumber(record.askingPrice),
    includeEnergyMeasures: Boolean(record.includeEnergyMeasures),
    energyPerformanceGuarantee: Boolean(record.energyPerformanceGuarantee),
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

function toFinance(state: CalculatorState): MortgageFinance {
  return {
    applicant: personFinance(state.applicant),
    partner: state.withPartner ? personFinance(state.partner) : null,
    studentLoanMonthly: state.studentLoanMonthly,
    otherMonthlyDebts: state.otherMonthlyDebts,
    alimonyPaidMonthly: state.alimonyPaidMonthly,
    interestRate: state.interestRate,
    fixedPeriodYears: state.fixedPeriodYears,
    repayment: state.repayment,
    energyPerformanceGuarantee: state.energyPerformanceGuarantee,
    includeEnergyMeasures: state.includeEnergyMeasures,
  };
}

export function MortgageCalculator({ initialEnergyLabel, initialAskingPrice, initialNhg }: { initialEnergyLabel?: string; initialAskingPrice?: number; initialNhg?: boolean }) {
  const [state, setState] = useState<CalculatorState>(() => {
    const defaults = defaultState();
    if (initialEnergyLabel) defaults.energyLabel = initialEnergyLabel;
    if (initialAskingPrice && initialAskingPrice > 0) defaults.askingPrice = initialAskingPrice;
    if (initialNhg != null) {
      defaults.nhg = initialNhg;
      defaults.interestRate = indicativeRate(defaults.fixedPeriodYears, initialNhg);
    }
    return defaults;
  });
  const [ready, setReady] = useState(false);
  const [showDebts, setShowDebts] = useState(false);
  const [showIncomeExtras, setShowIncomeExtras] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const restored = restoreState(JSON.parse(raw), defaultState());
        if (initialEnergyLabel) restored.energyLabel = initialEnergyLabel;
        if (initialAskingPrice && initialAskingPrice > 0) restored.askingPrice = initialAskingPrice;
        if (initialNhg != null) restored.nhg = initialNhg;
        if (!restored.rateTouched) restored.interestRate = indicativeRate(restored.fixedPeriodYears, restored.nhg);
        setState(restored);
        if (restored.studentLoanMonthly || restored.otherMonthlyDebts || restored.alimonyPaidMonthly) setShowDebts(true);
      }
    } catch { /* ignore */ }
    setReady(true);
  }, [initialAskingPrice, initialEnergyLabel, initialNhg]);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }, [ready, state]);

  const result = useMemo(() => calculateMortgageCapacity(toFinance(state), {
    energyLabel: state.energyLabel,
    askingPrice: state.askingPrice,
    ownFunds: state.ownFunds,
    nhg: state.nhg,
  }), [state]);

  function patch<K extends keyof CalculatorState>(key: K, value: CalculatorState[K]) {
    setState((current) => ({ ...current, [key]: value }));
  }

  function setPeriod(period: FixedPeriodYears) {
    setState((current) => ({
      ...current,
      fixedPeriodYears: period,
      interestRate: current.rateTouched ? current.interestRate : indicativeRate(period, current.nhg),
    }));
  }

  function setNhg(nhg: boolean) {
    setState((current) => ({
      ...current,
      nhg,
      interestRate: current.rateTouched ? current.interestRate : indicativeRate(current.fixedPeriodYears, nhg),
    }));
  }

  const youngSelfEmployed = [state.applicant, state.withPartner ? state.partner : null].some((person) => person && (person.workType === "self_employed" || person.workType === "dga" || person.workType === "mix") && person.monthsActive < 12);

  return <div className="mortgage-layout">
    <section className="mortgage-form-card">
      <div className="section-kicker">Jouw situatie</div>
      <h2>Wie koopt er?</h2>
      <div className="work-chips" role="group" aria-label="Kopers">
        <button type="button" className={!state.withPartner ? "active" : undefined} onClick={() => patch("withPartner", false)}>Alleen</button>
        <button type="button" className={state.withPartner ? "active" : undefined} onClick={() => patch("withPartner", true)}>Met partner</button>
      </div>
      <PersonFields title={state.withPartner ? "Jij" : "Inkomen"} person={state.applicant} showExtras={showIncomeExtras} onExtras={() => setShowIncomeExtras(true)} onChange={(applicant) => patch("applicant", applicant)} />
      {state.withPartner && <PersonFields title="Partner" person={state.partner} showExtras={showIncomeExtras} onExtras={() => setShowIncomeExtras(true)} onChange={(partner) => patch("partner", partner)} />}

      <button className="text-link mortgage-toggle" type="button" onClick={() => setShowDebts((value) => !value)}>{showDebts ? "Verberg lasten" : "Schulden en alimentatie"}</button>
      {showDebts && <div className="form-grid">
        <MoneyField label="Studieschuld (DUO per maand)" value={state.studentLoanMonthly} onChange={(studentLoanMonthly) => patch("studentLoanMonthly", studentLoanMonthly)} />
        <MoneyField label="Overige maandlasten (BKR)" value={state.otherMonthlyDebts} onChange={(otherMonthlyDebts) => patch("otherMonthlyDebts", otherMonthlyDebts)} />
        <MoneyField label="Alimentatie die je betaalt" value={state.alimonyPaidMonthly} onChange={(alimonyPaidMonthly) => patch("alimonyPaidMonthly", alimonyPaidMonthly)} />
      </div>}

      <div className="mortgage-block">
        <div className="section-kicker">Hypotheek</div>
        <div className="form-grid">
          <label>Rentevast
            <select value={state.fixedPeriodYears} onChange={(event) => setPeriod(Number(event.target.value) as FixedPeriodYears)}>
              <option value={5}>5 jaar</option>
              <option value={10}>10 jaar</option>
              <option value={20}>20 jaar</option>
              <option value={30}>30 jaar</option>
            </select>
          </label>
          <label>Rente (%)
            <input type="number" min="0" max="15" step="0.01" value={state.interestRate || ""} onChange={(event) => setState((current) => ({ ...current, interestRate: Number(event.target.value) || 0, rateTouched: true }))} />
          </label>
          <label>Aflosvorm
            <select value={state.repayment} onChange={(event) => patch("repayment", event.target.value as RepaymentType)}>
              <option value="annuity">Annuïteit</option>
              <option value="linear">Lineair</option>
            </select>
          </label>
          <MoneyField label="Eigen geld" value={state.ownFunds} onChange={(ownFunds) => patch("ownFunds", ownFunds)} step={5000} />
        </div>
        <p className="mortgage-hint">Indicatie {INDICATIVE_RATES.asOf}: {indicativeRate(state.fixedPeriodYears, state.nhg).toLocaleString("nl-NL", { minimumFractionDigits: 2 })}% bij {state.fixedPeriodYears} jaar {state.nhg ? "met NHG" : "zonder NHG"}. Geen live bankrente.</p>
        <div className="toggle-grid">
          <label><input type="checkbox" checked={state.nhg} onChange={(event) => setNhg(event.target.checked)} /> NHG (grens 2026 € 470.000)</label>
          <label><input type="checkbox" checked={state.includeEnergyMeasures} onChange={(event) => patch("includeEnergyMeasures", event.target.checked)} /> Verduurzaming meefinancieren</label>
        </div>
      </div>

      <div className="mortgage-block">
        <div className="section-kicker">Optioneel: deze woning</div>
        <div className="form-grid">
          <MoneyField label="Vraagprijs" value={state.askingPrice} onChange={(askingPrice) => patch("askingPrice", askingPrice)} step={5000} />
          <label>Energielabel
            <select value={state.energyLabel} onChange={(event) => patch("energyLabel", event.target.value)}>
              <option value="">Onbekend</option>
              {["A++++", "A+++", "A++", "A+", "A", "B", "C", "D", "E", "F", "G"].map((label) => <option value={label} key={label}>{label}</option>)}
            </select>
          </label>
        </div>
        {state.energyLabel.startsWith("A++++") && <label className="mortgage-check"><input type="checkbox" checked={state.energyPerformanceGuarantee} onChange={(event) => patch("energyPerformanceGuarantee", event.target.checked)} /> Energieprestatiegarantie ≥ 10 jaar (€ 40.000 extra)</label>}
      </div>
      {youngSelfEmployed && <p className="mortgage-warning"><CircleAlert size={14} /> Onder 12 maanden ondernemerschap nemen de meeste banken dit inkomen niet of nauwelijks mee.</p>}
    </section>

    <aside className="mortgage-result-card" aria-live="polite">
      <div className="mortgage-result-head">
        <span className="section-kicker"><Calculator size={13} /> leennormen {MORTGAGE_NORMS_YEAR}</span>
        <span className="coverage-pill"><ShieldCheck size={12} /> geen advies</span>
      </div>
      {!result.available ? <>
        <h2>Vul je inkomen in</h2>
        <p>De maximale hypotheek verschijnt hier direct, inclusief partner, schulden, rente en energielabel.</p>
      </> : <>
        <p className="mortgage-kicker">Maximale hypotheek</p>
        <div className="mortgage-amount">{formatEuro(result.maxLoan)}</div>
        <div className="mortgage-result-grid">
          <div><small>Max. koopsom</small><strong>{formatEuro(result.maxPurchasePrice)}</strong></div>
          <div><small>{state.repayment === "linear" ? "1e maand (lineair)" : "Maandlast"}</small><strong>{formatEuro(result.monthlyPayment)}</strong></div>
          <div><small>Toetsinkomen</small><strong>{formatEuro(result.toetsinkomen)}</strong></div>
          <div><small>Toetsrente</small><strong>{result.toetsrente.toLocaleString("nl-NL", { minimumFractionDigits: 2 })}%</strong></div>
        </div>
        {result.fit !== "unknown" && <div className={`mortgage-fit ${result.fit}`}>{result.fit === "fits" ? "Deze woning past binnen de berekende leenruimte." : result.fit === "tight" ? "Krap: de vraagprijs ligt boven de koopsom, verduurzaming of extra eigen geld kan het gat dichten." : "De vraagprijs ligt boven wat deze rekenschets toelaat."}</div>}
        <ul className="mortgage-lines">
          {result.lines.filter((line) => line.key !== "ikv" && line.key !== "toetsrente").map((line) => (
            <li key={line.key}><span>{line.label}</span><strong>{line.amount === 0 ? "—" : formatEuro(line.amount)}</strong><small>{line.note}</small></li>
          ))}
        </ul>
      </>}
      <p className="mortgage-disclaimer"><Landmark size={14} /> {result.disclaimer}</p>
    </aside>
  </div>;
}

function PersonFields({ title, person, showExtras, onExtras, onChange }: { title: string; person: PersonForm; showExtras: boolean; onExtras: () => void; onChange: (person: PersonForm) => void }) {
  const work = person.workType;
  const needsHistory = work === "temporary" && !person.intent || work === "flex" && !person.perspectief;
  const needsProfits = work === "self_employed" || work === "mix";
  const needsJob = work === "permanent" || work === "temporary" || work === "flex" || work === "mix";

  return <div className="mortgage-person">
    <h3>{title}</h3>
    <div className="work-chips" role="group" aria-label={`Werktype ${title}`}>
      {WORK_TYPES.map((item) => <button type="button" key={item.value} className={work === item.value ? "active" : undefined} onClick={() => onChange({ ...person, workType: item.value })}>{item.label}</button>)}
    </div>
    {needsJob && <div className="form-grid">
      <MoneyField label="Bruto jaarinkomen" value={person.grossAnnual} onChange={(grossAnnual) => onChange({ ...person, grossAnnual })} step={1000} />
      {work === "temporary" && <label className="mortgage-span"><input type="checkbox" checked={person.intent} onChange={(event) => onChange({ ...person, intent: event.target.checked })} /> Intentieverklaring voor onbepaalde tijd</label>}
      {work === "flex" && <label className="mortgage-span"><input type="checkbox" checked={person.perspectief} onChange={(event) => onChange({ ...person, perspectief: event.target.checked })} /> Perspectiefverklaring</label>}
    </div>}
    {needsJob && !showExtras && <button className="text-link" type="button" onClick={onExtras}>13e maand of bonus</button>}
    {needsJob && showExtras && <div className="form-grid">
      <MoneyField label="13e maand (jaar)" value={person.thirteenthMonth} onChange={(thirteenthMonth) => onChange({ ...person, thirteenthMonth })} step={100} />
      <MoneyField label="Structurele bonus (jaar)" value={person.bonus} onChange={(bonus) => onChange({ ...person, bonus })} step={100} />
    </div>}
    {needsHistory && <YearFields label="Bruto inkomen per jaar" years={person.history} onChange={(history) => onChange({ ...person, history })} />}
    {needsProfits && <>
      <label>Maanden ondernemer<input type="number" min="0" max="600" value={person.monthsActive || ""} onChange={(event) => onChange({ ...person, monthsActive: Number(event.target.value) || 0 })} /></label>
      <YearFields label="Fiscale winst (IB)" years={person.profits} onChange={(profits) => onChange({ ...person, profits })} />
    </>}
    {work === "dga" && <>
      <YearFields label="Box 1 uit de BV" years={person.box1} onChange={(box1) => onChange({ ...person, box1 })} />
      <YearFields label="Uitgekeerd dividend (optioneel)" years={person.dividend} onChange={(dividend) => onChange({ ...person, dividend })} />
    </>}
    {work === "pension" && <div className="form-grid"><MoneyField label="Pensioen / AOW (jaar)" value={person.pensionAnnual} onChange={(pensionAnnual) => onChange({ ...person, pensionAnnual })} step={1000} /></div>}
    <label className="mortgage-check"><input type="checkbox" checked={person.reachedAow} onChange={(event) => onChange({ ...person, reachedAow: event.target.checked })} /> AOW-leeftijd bereikt</label>
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

function MoneyField({ label, value, onChange, step = 50 }: { label: string; value: number; onChange: (value: number) => void; step?: number }) {
  return <label>{label}<input type="number" min="0" step={step} value={value || ""} onChange={(event) => onChange(Number(event.target.value) || 0)} /></label>;
}

export function MortgagePageIntro() {
  return <div className="mortgage-heading">
    <div>
      <div className="eyebrow"><Sparkles size={13} /> hypotheek {MORTGAGE_NORMS_YEAR}</div>
      <h1>Wat kun je lenen — volgens de wet, niet volgens een folder.</h1>
      <p className="hero-copy">Inkomen, partner, zelfstandige winst, schulden, toetsrente, NHG en energielabel. Het resultaat volgt de leennormen {MORTGAGE_NORMS_YEAR} en herberekent terwijl je typt.</p>
    </div>
    <div className="mortgage-heading-note"><Wallet size={16} /> Geen account nodig. Geen bankofferte. Wel de officiële woonquotes en energietabel.</div>
  </div>;
}
