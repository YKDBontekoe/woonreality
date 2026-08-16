"use client";

import { ChevronDown, CircleHelp, Receipt, Scale } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { BuyerCostEstimate, BuyerCostLine } from "@/src/lib/costs";
import type { HousingTaxSummary } from "@/src/lib/mortgage/tax";
import type { MortgageMarketSnapshot, MortgageSchedule, RepaymentType } from "@/src/lib/mortgage";
import { formatDeductionRate } from "@/src/lib/mortgage/tax";
import { formatEuro } from "@/src/lib/purchase";
import {
  BalanceComparisonChart,
  CostCompositionBar,
  CumulativeInterestChart,
  FundsMeter,
  PaymentComparisonChart,
  RateHistoryChart,
  RateImpactChart,
  RateSparkline,
} from "@/components/mortgage-charts";

export type CostInsightOptions = {
  newBuild: boolean;
  investment: boolean;
  includeAdvice: boolean;
  includeBankGuarantee: boolean;
  includeBuyingAgent: boolean;
  includeMoving: boolean;
  includeInspection: boolean;
};

type PanelId = "costs" | "tax" | "compare" | "rates";

const CATEGORY_ORDER = ["tax", "deed", "finance", "optional"] as const;
const CATEGORY_LABEL: Record<(typeof CATEGORY_ORDER)[number], string> = {
  tax: "Belasting",
  deed: "Aktes & kadaster",
  finance: "Financiering",
  optional: "Optioneel",
};

type Props = {
  costs: BuyerCostEstimate | null;
  tax: HousingTaxSummary | null;
  annuity: MortgageSchedule | null;
  linear: MortgageSchedule | null;
  impactRows: { rate: number; firstPayment: number; totalInterest: number }[];
  market: MortgageMarketSnapshot | null;
  activePeriod: number;
  repayment: RepaymentType;
  options: CostInsightOptions;
  onOptionsChange: (patch: Partial<CostInsightOptions>) => void;
  wozValue: number;
  onWozChange: (value: number) => void;
  loanAmount: number;
  ownFunds: number;
  referenceYear: number;
  referenceSources: { label: string; url: string }[];
};

function InsightPanel({
  id,
  title,
  summary,
  tone,
  open,
  onToggle,
  children,
}: {
  id: PanelId;
  title: string;
  summary: string;
  tone?: "ok" | "tight" | "short";
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`mortgage-panel ${open ? "is-open" : ""} ${tone ? `is-${tone}` : ""}`}>
      <button type="button" className="mortgage-panel-toggle" onClick={onToggle} aria-expanded={open} aria-controls={`panel-${id}`}>
        <span>
          <strong>{title}</strong>
          <small>{summary}</small>
        </span>
        <ChevronDown size={16} />
      </button>
      {open && <div className="mortgage-panel-body" id={`panel-${id}`}>{children}</div>}
    </div>
  );
}

function CostLineRow({ line, expanded, onToggle }: { line: BuyerCostLine; expanded: boolean; onToggle: () => void }) {
  return (
    <li className={expanded ? "is-open" : undefined}>
      <button type="button" onClick={onToggle} aria-expanded={expanded}>
        <span>
          {line.label}
          <em className={line.deductible ? "is-deductible" : "is-not-deductible"}>
            {line.deductible ? "aftrekbaar" : "niet"}
          </em>
        </span>
        <strong>{formatEuro(line.amount)}</strong>
      </button>
      {expanded && <small>{line.note}</small>}
    </li>
  );
}

export function MortgageCostInsight({
  costs,
  tax,
  annuity,
  linear,
  impactRows,
  market,
  activePeriod,
  repayment,
  options,
  onOptionsChange,
  wozValue,
  onWozChange,
  loanAmount,
  ownFunds,
  referenceYear,
  referenceSources,
}: Props) {
  const [open, setOpen] = useState<PanelId | null>(null);
  const [expandedLine, setExpandedLine] = useState<string | null>(null);
  const [showImpactTable, setShowImpactTable] = useState(false);
  const hasLoan = loanAmount > 0;
  const showSchedules = hasLoan && annuity && linear;
  const fundsGap = costs ? Math.round(costs.ownFundsNeeded - ownFunds) : null;
  const fundsTone = fundsGap == null ? undefined : fundsGap <= 0 ? "ok" : fundsGap / Math.max(1, costs?.ownFundsNeeded ?? 1) <= 0.15 ? "tight" : "short";
  const interestDelta = showSchedules ? Math.round(annuity.totalInterest - linear.totalInterest) : 0;
  const chosen = repayment === "linear" ? linear : annuity;

  function toggle(id: PanelId) {
    setOpen((current) => (current === id ? null : id));
  }

  const groupedLines = CATEGORY_ORDER.map((category) => ({
    category,
    lines: costs?.lines.filter((line) => line.category === category) ?? [],
  })).filter((group) => group.lines.length > 0);

  return (
    <section className="mortgage-insight" id="kosten-inzicht" aria-labelledby="kosten-inzicht-title">
      <div className="mortgage-insight-head">
        <div>
          <div className="section-kicker"><Receipt size={13} /> in één oogopslag · {referenceYear}</div>
          <h2 id="kosten-inzicht-title">Wat gaat dit kosten?</h2>
        </div>
        <div className="mortgage-insight-meta">
          <span className="coverage-pill"><Scale size={12} /> geldend {referenceYear}</span>
          {market?.indicativeRates.live && <span className="coverage-pill">rente {market.indicativeRates.asOf}</span>}
        </div>
      </div>

      <div className="mortgage-snapshot">
        <article className="mortgage-indicator">
          <small>Eenmalig bij overdracht</small>
          <strong>{costs ? formatEuro(costs.total) : "—"}</strong>
          {costs ? <em>{formatEuro(costs.deductibleTotal)} aftrekbaar</em> : <em>Vul een vraagprijs in</em>}
        </article>
        <article className={`mortgage-indicator ${fundsTone ? `is-${fundsTone}` : ""}`}>
          <small>Eigen geld nodig</small>
          <strong>{costs ? formatEuro(Math.round(costs.ownFundsNeeded)) : "—"}</strong>
          {costs ? <FundsMeter needed={costs.ownFundsNeeded} available={ownFunds} /> : <em>Koopsom + kosten koper − hypotheek</em>}
        </article>
        <article className="mortgage-indicator is-hero">
          <small>Netto maandlast</small>
          <strong>{tax ? formatEuro(tax.ongoingMonthlyNet) : hasLoan && chosen ? formatEuro(Math.round(chosen.firstPayment)) : "—"}</strong>
          {tax
            ? <em>Bruto {formatEuro(tax.ongoingMonthlyGross)} · aftrek {formatDeductionRate(tax.deductionRate)}</em>
            : <em>{repayment === "linear" ? "Eerste maand, bruto" : "Bruto, tot je inkomen invult"}</em>}
        </article>
        <article className="mortgage-indicator">
          <small>Annuïteit vs lineair</small>
          {showSchedules ? (
            <>
              <strong>{formatEuro(Math.round(interestDelta))}</strong>
              <em>minder rente bij lineair over 30 jaar</em>
            </>
          ) : (
            <>
              <strong>—</strong>
              <em>Verschijnt bij een hypotheekbedrag</em>
            </>
          )}
        </article>
      </div>

      {costs && <CostCompositionBar lines={costs.lines} total={costs.total} />}

      {market && market.history.length > 0 && (
        <div className="mortgage-rate-glance">
          <div>
            <small>Marktrente {activePeriod} jaar vast</small>
            <RateSparkline history={market.history} activePeriod={activePeriod} />
          </div>
          <button type="button" className="text-link" onClick={() => toggle("rates")}>
            {open === "rates" ? "Verberg historie" : "Toon historie"}
          </button>
        </div>
      )}

      <div className="mortgage-panels">
        <InsightPanel
          id="costs"
          title="Kostenposten"
          summary={costs ? `${costs.lines.length} posten · ${formatEuro(costs.total)}` : "Vul een vraagprijs in voor de uitsplitsing"}
          tone={fundsTone}
          open={open === "costs"}
          onToggle={() => toggle("costs")}
        >
          <div className="mortgage-insight-toggles">
            <div className="work-chips" role="group" aria-label="Type woning">
              <button type="button" className={!options.newBuild ? "active" : undefined} onClick={() => onOptionsChange({ newBuild: false })}>Bestaande bouw</button>
              <button type="button" className={options.newBuild ? "active" : undefined} onClick={() => onOptionsChange({ newBuild: true })}>Nieuwbouw v.o.n.</button>
            </div>
            <div className="work-chips" role="group" aria-label="Gebruik">
              <button type="button" className={!options.investment ? "active" : undefined} onClick={() => onOptionsChange({ investment: false })}>Hoofdverblijf</button>
              <button type="button" className={options.investment ? "active" : undefined} onClick={() => onOptionsChange({ investment: true })}>Belegging</button>
            </div>
          </div>
          {!costs ? (
            <p className="mortgage-hint">Zonder vraagprijs kunnen we overdrachtsbelasting en aktes niet rekenen. Grafieken hieronder gebruiken je maximale hypotheek.</p>
          ) : (
            <>
              {groupedLines.map((group) => (
                <div className="mortgage-cost-group" key={group.category}>
                  <h3>{CATEGORY_LABEL[group.category]}</h3>
                  <ul className="mortgage-cost-lines">
                    {group.lines.map((line) => (
                      <CostLineRow
                        key={line.key}
                        line={line}
                        expanded={expandedLine === line.key}
                        onToggle={() => setExpandedLine((current) => current === line.key ? null : line.key)}
                      />
                    ))}
                  </ul>
                </div>
              ))}
              <div className="mortgage-cost-extras">
                <p className="mortgage-hint">Optionele posten</p>
                <label className="mortgage-check"><input type="checkbox" checked={options.includeAdvice} onChange={(event) => onOptionsChange({ includeAdvice: event.target.checked })} /> Hypotheekadvies</label>
                <label className="mortgage-check"><input type="checkbox" checked={options.includeInspection} onChange={(event) => onOptionsChange({ includeInspection: event.target.checked })} /> Bouwkundige keuring</label>
                <label className="mortgage-check"><input type="checkbox" checked={options.includeBankGuarantee} onChange={(event) => onOptionsChange({ includeBankGuarantee: event.target.checked })} /> Bankgarantie</label>
                <label className="mortgage-check"><input type="checkbox" checked={options.includeBuyingAgent} onChange={(event) => onOptionsChange({ includeBuyingAgent: event.target.checked })} /> Aankoopmakelaar</label>
                <label className="mortgage-check"><input type="checkbox" checked={options.includeMoving} onChange={(event) => onOptionsChange({ includeMoving: event.target.checked })} /> Verhuiskosten</label>
              </div>
              <p className="mortgage-disclaimer"><CircleHelp size={14} /> {costs.disclaimer}</p>
            </>
          )}
        </InsightPanel>

        <InsightPanel
          id="tax"
          title="Hypotheekrenteaftrek"
          summary={tax ? `Netto ${formatEuro(tax.ongoingMonthlyNet)} / maand` : "Vul inkomen in voor de nettorekening"}
          open={open === "tax"}
          onToggle={() => toggle("tax")}
        >
          {tax && hasLoan ? (
            <>
              <div className="mortgage-result-grid">
                <div className="is-hero"><small>Bruto</small><strong>{formatEuro(tax.ongoingMonthlyGross)}</strong></div>
                <div className="is-hero"><small>Netto doorlopend</small><strong>{formatEuro(tax.ongoingMonthlyNet)}</strong></div>
                <div><small>Voordeel jaar 1</small><strong>{formatEuro(tax.year1.taxBenefit)}</strong></div>
                <div><small>Netto maand jaar 1</small><strong>{formatEuro(tax.year1.netMonthlyCost)}</strong></div>
              </div>
              <p className="mortgage-hint">
                Aftrektarief {formatDeductionRate(tax.deductionRate)}. Eigenwoningforfait {formatEuro(tax.eigenwoningforfait)}/jaar.
                Jaar 1 is lager door eenmalige financieringskosten ({formatEuro(tax.year1.oneOffDeductible)}).
              </p>
              <div className="form-grid mortgage-woz-row">
                <label>WOZ-waarde
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={wozValue || ""}
                    onChange={(event) => onWozChange(Number(event.target.value) || 0)}
                  />
                </label>
              </div>
              <p className="mortgage-disclaimer"><CircleHelp size={14} /> {tax.disclaimer}</p>
            </>
          ) : (
            <p className="mortgage-hint">Met inkomen rekenen we het maximale aftrektarief, forfait en netto maandlast.</p>
          )}
        </InsightPanel>

        <InsightPanel
          id="compare"
          title="Annuïteit vs lineair"
          summary={showSchedules
            ? `${repayment === "linear" ? "Lineair" : "Annuïteit"} gekozen · ${formatEuro(Math.round(Math.abs(interestDelta)))} renteverschil`
            : "Zelfde lening, twee aflosvormen"}
          open={open === "compare"}
          onToggle={() => toggle("compare")}
        >
          {showSchedules ? (
            <>
              <div className="mortgage-compare-strip">
                <div className={repayment === "annuity" ? "is-active" : undefined}>
                  <small>Annuïteit</small>
                  <strong>{formatEuro(Math.round(annuity.firstPayment))}</strong>
                  <em>vast / mnd · rente {formatEuro(Math.round(annuity.totalInterest))}</em>
                </div>
                <div className={repayment === "linear" ? "is-active" : undefined}>
                  <small>Lineair</small>
                  <strong>{formatEuro(Math.round(linear.firstPayment))}</strong>
                  <em>start / mnd · rente {formatEuro(Math.round(linear.totalInterest))}</em>
                </div>
              </div>
              <p className="mortgage-hint">
                Lineair start hoger ({formatEuro(Math.round(linear.firstPayment))} vs {formatEuro(Math.round(annuity.firstPayment))})
                maar je betaalt {formatEuro(Math.round(interestDelta))} minder rente.
              </p>
              <div className="mortgage-charts-grid">
                <PaymentComparisonChart annuity={annuity} linear={linear} />
                <BalanceComparisonChart annuity={annuity} linear={linear} />
                <CumulativeInterestChart annuity={annuity} linear={linear} />
              </div>
            </>
          ) : (
            <p className="mortgage-hint">Vul inkomen of een vraagprijs in om de aflosvormen te vergelijken.</p>
          )}
        </InsightPanel>

        <InsightPanel
          id="rates"
          title="Rente: historie en impact"
          summary={market?.indicativeRates.live ? `Live ${market.indicativeRates.asOf}` : "Indicatie tot marktdata binnen is"}
          open={open === "rates"}
          onToggle={() => toggle("rates")}
        >
          <div className="mortgage-charts-grid">
            {market && market.history.length > 0 && (
              <RateHistoryChart history={market.history} activePeriod={activePeriod} />
            )}
            {impactRows.length > 0 && (
              <div>
                <RateImpactChart rows={impactRows} showTable={showImpactTable} />
                <button type="button" className="text-link mortgage-toggle" onClick={() => setShowImpactTable((value) => !value)}>
                  {showImpactTable ? "Verberg cijfertabel" : "Toon cijfertabel"}
                </button>
              </div>
            )}
          </div>
        </InsightPanel>
      </div>

      {referenceSources.length > 0 && (
        <p className="mortgage-sources">
          Bronnen {referenceYear}:{" "}
          {referenceSources.map((source, index) => (
            <span key={source.url}>
              {index > 0 ? " · " : ""}
              <a href={source.url} target="_blank" rel="noreferrer">{source.label}</a>
            </span>
          ))}
          {market?.indicativeRates.live ? (
            <> · Marktrente: <a href={market.indicativeRates.sourceUrl} target="_blank" rel="noreferrer">{market.indicativeRates.source}</a></>
          ) : null}
        </p>
      )}
    </section>
  );
}
