"use client";

import { Calculator, CircleAlert, Landmark, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  MORTGAGE_NORMS_YEAR,
  calculateMortgageCapacity,
  defaultDgaSource,
  defaultEmploymentSource,
  defaultPensionSource,
  defaultSelfEmployedSource,
  emptyTriple,
  marketIndicativeRate,
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

function toFinance(state: CalculatorState): MortgageFinance {
  return {
    applicant: personFinance(state.applicant),
    partner: state.withPartner ? personFinance(state.partner) : null,
    studentLoanMonthly: state.studentLoanMonthly,
    studentLoanRemaining: state.studentLoanRemaining,
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

  const result = useMemo(() => calculateMortgageCapacity(toFinance(state), {
    energyLabel: state.energyLabel,
    askingPrice: state.askingPrice,
    nhg: state.nhg,
  }, market ?? undefined), [market, state]);

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

      <div className="mortgage-block">
        <div className="section-kicker">Eigen geld</div>
        <p className="mortgage-hint">Spaargeld, schenking of overwaarde. Dit telt mee voor de maximale koopsom en voor de kosten koper.</p>
        <div className="form-grid">
          <MoneyField label="Spaargeld" value={state.savings} onChange={(savings) => patch("savings", savings)} step={1000} />
          <MoneyField label="Schenking" value={state.gift} onChange={(gift) => patch("gift", gift)} step={1000} />
          <MoneyField label="Overwaarde / inbreng" value={state.saleEquity} onChange={(saleEquity) => patch("saleEquity", saleEquity)} step={1000} />
        </div>
      </div>

      <div className="mortgage-block">
        <div className="section-kicker">Lasten en verplichtingen</div>
        <p className="mortgage-hint">Private lease telt voor 100% van de werkelijke maandlast (NHG/BKR-OA). Revolverend krediet: 2% van de limiet per maand. Studieschuld: DUO-termijn, of 0,35%/0,65% van de restschuld.</p>
        <div className="form-grid">
          <MoneyField label="Private lease (maand)" hint="Auto, fiets of andere OA-contracten." value={state.privateLeaseMonthly} onChange={(privateLeaseMonthly) => patch("privateLeaseMonthly", privateLeaseMonthly)} />
          <MoneyField label="Aflopende leningen (maand)" hint="Persoonlijke lening of vaste kredietlast." value={state.installmentLoanMonthly} onChange={(installmentLoanMonthly) => patch("installmentLoanMonthly", installmentLoanMonthly)} />
          <MoneyField label="Creditcard / RK-limiet" hint="Ook als je de limiet niet gebruikt." value={state.revolvingCreditLimit} onChange={(revolvingCreditLimit) => patch("revolvingCreditLimit", revolvingCreditLimit)} step={500} />
          <MoneyField label="Erfpachtcanon (maand)" value={state.groundLeaseMonthly} onChange={(groundLeaseMonthly) => patch("groundLeaseMonthly", groundLeaseMonthly)} />
          <MoneyField label="Studieschuld, DUO per maand" hint="Heeft voorrang op de restschuldtoets." value={state.studentLoanMonthly} onChange={(studentLoanMonthly) => patch("studentLoanMonthly", studentLoanMonthly)} />
          <MoneyField label="Studieschuld, restant" hint="Alleen als je het termijnbedrag niet weet." value={state.studentLoanRemaining} onChange={(studentLoanRemaining) => patch("studentLoanRemaining", studentLoanRemaining)} step={500} />
          <label className="mortgage-span"><input type="checkbox" checked={state.studentLoanSf35} onChange={(event) => patch("studentLoanSf35", event.target.checked)} /> SF35 / studieschuld vanaf 2024 (0,35% van restant)</label>
          <MoneyField label="Alimentatie die je betaalt" hint="Partner- en kinderalimentatie per maand." value={state.alimonyPaidMonthly} onChange={(alimonyPaidMonthly) => patch("alimonyPaidMonthly", alimonyPaidMonthly)} />
          <MoneyField label="Overige maandlasten" hint="Andere BKR- of vaste verplichtingen." value={state.otherMonthlyDebts} onChange={(otherMonthlyDebts) => patch("otherMonthlyDebts", otherMonthlyDebts)} />
        </div>
      </div>

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
        </div>
        <p className="mortgage-hint">{rateHint(market, state.fixedPeriodYears, state.nhg)}</p>
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
          <label>Leeftijd koper
            <input type="number" min="0" max="120" value={state.buyerAge || ""} onChange={(event) => patch("buyerAge", Number(event.target.value) || 0)} />
          </label>
        </div>
        <label className="mortgage-check"><input type="checkbox" checked={state.starterExemption} onChange={(event) => patch("starterExemption", event.target.checked)} /> Startersvrijstelling overdrachtsbelasting (indicatie tot € 555.000, leeftijd 18–35)</label>
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
        <p>De maximale hypotheek verschijnt hier direct, inclusief partner, lasten, eigen geld, rente en energielabel.</p>
      </> : <>
        <p className="mortgage-kicker">Maximale hypotheek</p>
        <div className="mortgage-amount">{formatEuro(result.maxLoan)}</div>
        <div className="mortgage-result-grid">
          <div><small>Max. koopsom</small><strong>{formatEuro(result.maxPurchasePrice)}</strong></div>
          <div><small>{state.repayment === "linear" ? "1e maand (lineair)" : "Maandlast"}</small><strong>{formatEuro(result.monthlyPayment)}</strong></div>
          <div><small>Toetsinkomen</small><strong>{formatEuro(result.toetsinkomen)}</strong></div>
          <div><small>Toetsrente</small><strong>{result.toetsrente.toLocaleString("nl-NL", { minimumFractionDigits: 2 })}%</strong></div>
          {result.ownFunds > 0 && <div><small>Eigen geld</small><strong>{formatEuro(result.ownFunds)}</strong></div>}
          {result.buyerCosts != null && <div><small>Kosten koper</small><strong>{formatEuro(result.buyerCosts)}</strong></div>}
        </div>
        {result.fit !== "unknown" && <div className={`mortgage-fit ${result.fit}`}>{result.fit === "fits" ? "Deze woning past binnen de berekende leenruimte." : result.fit === "tight" ? "Krap: de vraagprijs ligt boven de koopsom, verduurzaming of extra eigen geld kan het gat dichten." : "De vraagprijs ligt boven wat deze rekenschets toelaat."}</div>}
        <ul className="mortgage-lines">
          {result.lines.filter((line) => line.key !== "ikv" && line.key !== "toetsrente").map((line) => (
            <li key={line.key}><span>{line.label}</span><strong>{line.amount === 0 ? "—" : formatEuro(line.amount)}</strong><small>{line.note}</small></li>
          ))}
        </ul>
      </>}
      <p className="mortgage-disclaimer"><Landmark size={14} /> {result.disclaimer}</p>
      {market && <p className="mortgage-sources">
        {market.toetsrente.live ? <>AFM-toetsrente {market.toetsrente.rate.toLocaleString("nl-NL")}% ({market.toetsrente.label}). </> : "AFM-toetsrente: wettelijk minimum 5%. "}
        {market.indicativeRates.live
          ? <>Indicatieve rente uit {market.indicativeRates.source}, periode {market.indicativeRates.asOf}. NHG-voordeel is een vaste 0,2%-punt, geen bankvergelijking.</>
          : "Indicatieve rente is een ingebouwde fallback tot DNB/ECB bereikbaar is."}
      </p>}
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
    {!showExtras && <button className="text-link" type="button" onClick={onExtras}>{needsJob ? "13e maand, bonus of alimentatie" : "Ontvangen alimentatie"}</button>}
    {showExtras && <div className="form-grid">
      {needsJob && <>
        <MoneyField label="13e maand (jaar)" value={person.thirteenthMonth} onChange={(thirteenthMonth) => onChange({ ...person, thirteenthMonth })} step={100} />
        <MoneyField label="Structurele bonus (jaar)" value={person.bonus} onChange={(bonus) => onChange({ ...person, bonus })} step={100} />
      </>}
      <MoneyField label="Ontvangen alimentatie (jaar)" value={person.alimonyAnnual} onChange={(alimonyAnnual) => onChange({ ...person, alimonyAnnual })} step={100} />
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

function MoneyField({ label, value, onChange, step = 50, hint }: { label: string; value: number; onChange: (value: number) => void; step?: number; hint?: string }) {
  return <label>{label}{hint ? <small className="mortgage-field-hint">{hint}</small> : null}<input type="number" min="0" step={step} value={value || ""} onChange={(event) => onChange(Number(event.target.value) || 0)} /></label>;
}

function rateHint(market: MortgageMarketSnapshot | null, period: FixedPeriodYears, nhg: boolean) {
  const rate = marketIndicativeRate(market, period, nhg).toLocaleString("nl-NL", { minimumFractionDigits: 2 });
  const afm = market?.toetsrente.live
    ? `Bij rentevast onder 10 jaar toetsen we op de AFM-toetsrente (${market.toetsrente.rate.toLocaleString("nl-NL")}%, ${market.toetsrente.label}).`
    : "Bij rentevast onder 10 jaar toetsen we wettelijk op minimaal 5%.";
  if (market?.indicativeRates.live) {
    return `Startwaarde ${rate}% uit ${market.indicativeRates.source} (${market.indicativeRates.asOf}, ${period} jaar ${nhg ? "met NHG-indicatie" : "zonder NHG"}). Geen bankvergelijking. ${afm}`;
  }
  return `Indicatie ${rate}% bij ${period} jaar ${nhg ? "met NHG" : "zonder NHG"}. Vul de rente in die je bij je adviseur of bank ziet. ${afm}`;
}

export function MortgagePageIntro() {
  return <div className="mortgage-heading">
    <div>
      <div className="eyebrow"><Sparkles size={13} /> hypotheek {MORTGAGE_NORMS_YEAR}</div>
      <h1>Wat kun je lenen — volgens de wet, niet volgens een folder.</h1>
      <p className="hero-copy">Inkomen, partner, zelfstandige winst, private lease, studieschuld, eigen geld, toetsrente, NHG en energielabel. Het resultaat volgt de leennormen {MORTGAGE_NORMS_YEAR} en herberekent terwijl je typt.</p>
    </div>
    <div className="mortgage-heading-note"><Wallet size={16} /> Geen account nodig. Geen bankofferte. Wel AFM-toetsrente, DNB/ECB-indicatie en de officiële woonquotes.</div>
  </div>;
}
