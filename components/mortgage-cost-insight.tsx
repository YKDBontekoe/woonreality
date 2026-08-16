"use client";

import { CircleHelp, Receipt, Scale } from "lucide-react";
import type { BuyerCostEstimate } from "@/src/lib/costs";
import type { HousingTaxSummary } from "@/src/lib/mortgage/tax";
import type { MortgageMarketSnapshot, MortgageSchedule, RepaymentType } from "@/src/lib/mortgage";
import { formatDeductionRate } from "@/src/lib/mortgage/tax";
import { formatEuro } from "@/src/lib/purchase";
import {
  BalanceComparisonChart,
  CumulativeInterestChart,
  PaymentComparisonChart,
  RateHistoryChart,
  RateImpactChart,
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
  const hasLoan = loanAmount > 0;
  const showSchedules = hasLoan && annuity && linear;

  return (
    <section className="mortgage-insight" id="kosten-inzicht" aria-labelledby="kosten-inzicht-title">
      <div className="mortgage-insight-head">
        <div>
          <div className="section-kicker"><Receipt size={13} /> kosten &amp; aftrek {referenceYear}</div>
          <h2 id="kosten-inzicht-title">Wat gaat dit kosten?</h2>
          <p>Overzicht van eenmalige aankoopkosten (met aftrekbaarheid), netto maandlast na hypotheekrenteaftrek, en grafieken. Marktrente is live via DNB/ECB; wettelijke tarieven komen uit de jaartabel {referenceYear}.</p>
        </div>
        <div className="mortgage-insight-meta">
          <span className="coverage-pill"><Scale size={12} /> geldend {referenceYear}</span>
          {market?.indicativeRates.live && (
            <span className="coverage-pill">rente {market.indicativeRates.asOf}</span>
          )}
        </div>
      </div>

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
        <p className="mortgage-hint">Vul een vraagprijs in om het kostenoverzicht te zien. Zonder prijs rekenen we wel door op je maximale hypotheek voor de grafieken.</p>
      ) : (
        <div className="mortgage-cost-panel">
          <div className="mortgage-cost-summary">
            <div><small>Totaal bij overdracht</small><strong>{formatEuro(costs.total)}</strong></div>
            <div><small>Waarvan aftrekbaar (jaar 1)</small><strong>{formatEuro(costs.deductibleTotal)}</strong></div>
            <div><small>Niet aftrekbaar</small><strong>{formatEuro(costs.nonDeductibleTotal)}</strong></div>
            <div><small>Eigen geld nodig</small><strong>{formatEuro(Math.round(costs.ownFundsNeeded))}</strong></div>
            {ownFunds > 0 && (
              <div>
                <small>{costs.ownFundsNeeded - ownFunds > 0 ? "Tekort t.o.v. inleg" : "Ruimte in inleg"}</small>
                <strong>{formatEuro(Math.round(Math.abs(costs.ownFundsNeeded - ownFunds)))}</strong>
              </div>
            )}
          </div>

          <ul className="mortgage-cost-lines">
            {costs.lines.map((line) => (
              <li key={line.key}>
                <span>
                  {line.label}
                  <em className={line.deductible ? "is-deductible" : "is-not-deductible"}>
                    {line.deductible ? "aftrekbaar" : "niet aftrekbaar"}
                  </em>
                </span>
                <strong>{formatEuro(line.amount)}</strong>
                <small>{line.note}</small>
              </li>
            ))}
          </ul>

          <div className="mortgage-cost-extras">
            <p className="mortgage-hint">Optionele posten meenemen:</p>
            <label className="mortgage-check"><input type="checkbox" checked={options.includeAdvice} onChange={(event) => onOptionsChange({ includeAdvice: event.target.checked })} /> Hypotheekadvies</label>
            <label className="mortgage-check"><input type="checkbox" checked={options.includeInspection} onChange={(event) => onOptionsChange({ includeInspection: event.target.checked })} /> Bouwkundige keuring</label>
            <label className="mortgage-check"><input type="checkbox" checked={options.includeBankGuarantee} onChange={(event) => onOptionsChange({ includeBankGuarantee: event.target.checked })} /> Bankgarantie</label>
            <label className="mortgage-check"><input type="checkbox" checked={options.includeBuyingAgent} onChange={(event) => onOptionsChange({ includeBuyingAgent: event.target.checked })} /> Aankoopmakelaar</label>
            <label className="mortgage-check"><input type="checkbox" checked={options.includeMoving} onChange={(event) => onOptionsChange({ includeMoving: event.target.checked })} /> Verhuiskosten</label>
          </div>
          <p className="mortgage-disclaimer"><CircleHelp size={14} /> {costs.disclaimer}</p>
        </div>
      )}

      {tax && hasLoan && (
        <div className="mortgage-tax-panel">
          <div className="section-kicker">Hypotheekrenteaftrek {tax.referenceYear}</div>
          <h3>Bruto vs netto maandlast</h3>
          <p className="mortgage-hint">
            Aftrektarief {formatDeductionRate(tax.deductionRate)} (max eigen woning). Eigenwoningforfait {formatEuro(tax.eigenwoningforfait)}/jaar.
            {repayment === "linear" ? " Getoond voor lineair (eerste jaar)." : " Getoond voor annuïteit (eerste jaar)."}
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
          <div className="mortgage-result-grid">
            <div className="is-hero"><small>Bruto maandlast</small><strong>{formatEuro(tax.ongoingMonthlyGross)}</strong></div>
            <div className="is-hero"><small>Netto (doorlopend)</small><strong>{formatEuro(tax.ongoingMonthlyNet)}</strong></div>
            <div><small>Belastingvoordeel jaar 1</small><strong>{formatEuro(tax.year1.taxBenefit)}</strong></div>
            <div><small>Netto maand jaar 1</small><strong>{formatEuro(tax.year1.netMonthlyCost)}</strong></div>
          </div>
          <p className="mortgage-hint">
            Jaar 1 is lager door eenmalige aftrekbare financieringskosten ({formatEuro(tax.year1.oneOffDeductible)}).
            Daarna valt dat weg; het doorlopende netto-bedrag is realistischer voor de lange termijn.
          </p>
          <p className="mortgage-disclaimer"><CircleHelp size={14} /> {tax.disclaimer}</p>
        </div>
      )}

      <div className="mortgage-charts-grid">
        {market && market.history.length > 0 && (
          <RateHistoryChart history={market.history} activePeriod={activePeriod} />
        )}
        {showSchedules && (
          <>
            <BalanceComparisonChart annuity={annuity} linear={linear} />
            <PaymentComparisonChart annuity={annuity} linear={linear} />
            <CumulativeInterestChart annuity={annuity} linear={linear} />
          </>
        )}
        {impactRows.length > 0 && <RateImpactChart rows={impactRows} />}
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
