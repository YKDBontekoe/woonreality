"use client";

import { ChevronDown, CircleHelp, Receipt, Scale } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { BuyerCostEstimate, BuyerCostLine } from "@/src/lib/costs";
import type { HousingTaxSummary } from "@/src/lib/mortgage/tax";
import type { MortgageMarketSnapshot, MortgageSchedule, RepaymentType } from "@/src/lib/mortgage";
import { deductionRefund, formatDeductionRate } from "@/src/lib/mortgage";
import { LOAN_TERM_YEARS } from "@/src/lib/mortgage/norms-2026";
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
  tax: "costCatTax",
  deed: "costCatDeed",
  finance: "costCatFinance",
  optional: "costCatOptional",
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
  maxDeductionRate: number;
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

function CostLineRow({
  line,
  expanded,
  onToggle,
  refund,
}: {
  line: BuyerCostLine;
  expanded: boolean;
  onToggle: () => void;
  refund: number | null;
}) {
  const t = useTranslations("hypotheek");
  return (
    <li className={expanded ? "is-open" : undefined}>
      <button type="button" onClick={onToggle} aria-expanded={expanded}>
        <span>
          {line.label}
          <em className={line.deductible ? "is-deductible" : "is-not-deductible"}>
            {line.deductible ? t("lineDeductible") : t("lineNotDeductible")}
          </em>
        </span>
        <span className="mortgage-cost-amounts">
          <strong>{formatEuro(line.amount)}</strong>
          {line.deductible && refund != null && refund > 0 && <b>{t("lineRefund", { refund: formatEuro(refund) })}</b>}
        </span>
      </button>
      {expanded && (
        <small>
          {line.note}
          {line.deductible && refund != null ? t("lineRefundNote", { refund: formatEuro(refund) }) : ""}
        </small>
      )}
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
  maxDeductionRate,
  referenceSources,
}: Props) {
  const t = useTranslations("hypotheek");
  const [open, setOpen] = useState<PanelId | null>(null);
  const [expandedLine, setExpandedLine] = useState<string | null>(null);
  const [showImpactTable, setShowImpactTable] = useState(false);
  const hasLoan = loanAmount > 0;
  const showSchedules = hasLoan && annuity && linear;
  const fundsGap = costs ? Math.round(costs.ownFundsNeeded - ownFunds) : null;
  const fundsTone = fundsGap == null ? undefined : fundsGap <= 0 ? "ok" : fundsGap / Math.max(1, costs?.ownFundsNeeded ?? 1) <= 0.15 ? "tight" : "short";
  const interestDelta = showSchedules ? Math.round(annuity.totalInterest - linear.totalInterest) : 0;
  const chosen = repayment === "linear" ? linear : annuity;
  const loanTermYears = annuity?.years.length ?? linear?.years.length ?? LOAN_TERM_YEARS;
  const deductionRate = tax?.deductionRate ?? maxDeductionRate;
  const refundKnown = Boolean(tax);
  const costsRefund = costs ? deductionRefund(costs.deductibleTotal, deductionRate) : 0;

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
          <div className="section-kicker"><Receipt size={13} /> {t("insightKicker", { year: referenceYear })}</div>
          <h2 id="kosten-inzicht-title">{t("insightTitle")}</h2>
        </div>
        <div className="mortgage-insight-meta">
          <span className="coverage-pill"><Scale size={12} /> {t("validPill", { year: referenceYear })}</span>
          {market?.indicativeRates.live && <span className="coverage-pill">{t("ratePill", { asOf: market.indicativeRates.asOf })}</span>}
        </div>
      </div>

      <div className="mortgage-snapshot">
        <article className="mortgage-indicator">
          <small>{t("oneOffAtTransfer")}</small>
          <strong>{costs ? formatEuro(costs.total) : "—"}</strong>
          {costs ? (
            <em>
              {t("deductibleAmount", { amount: formatEuro(costs.deductibleTotal) })}
              {costsRefund > 0 ? (refundKnown ? t("refundPart", { amount: formatEuro(costsRefund) }) : t("refundPartMax", { amount: formatEuro(costsRefund) })) : ""}
            </em>
          ) : <em>{t("enterAskingPrice")}</em>}
        </article>
        <article className={`mortgage-indicator ${fundsTone ? `is-${fundsTone}` : ""}`}>
          <small>{t("ownFundsNeeded")}</small>
          <strong>{costs ? formatEuro(Math.round(costs.ownFundsNeeded)) : "—"}</strong>
          {costs ? (
            <>
              <em>
                {costs.cashForPrice > 0
                  ? t("ownFundsWithCash", { kk: formatEuro(costs.total), cash: formatEuro(Math.round(costs.cashForPrice)) })
                  : t("ownFundsInMortgage", { kk: formatEuro(costs.total) })}
              </em>
              <FundsMeter needed={costs.ownFundsNeeded} available={ownFunds} />
            </>
          ) : (
            <em>{t("ownFundsExplain")}</em>
          )}
        </article>
        <article className="mortgage-indicator is-hero">
          <small>{t("netMonthly")}</small>
          <strong>{tax ? formatEuro(tax.ongoingMonthlyNet) : hasLoan && chosen ? formatEuro(Math.round(chosen.firstPayment)) : "—"}</strong>
          {tax
            ? <em>{t("netBreakdown", { gross: formatEuro(tax.ongoingMonthlyGross), rate: formatDeductionRate(tax.deductionRate) })}</em>
            : <em>{repayment === "linear" ? t("firstMonthOnlyLinear") : t("grossUntilIncome")}</em>}
        </article>
        <article className="mortgage-indicator">
          <small>{t("annuityVsLinear")}</small>
          {showSchedules ? (
            <>
              <strong>{formatEuro(Math.round(interestDelta))}</strong>
              <em>{t("lessInterestLinear", { years: loanTermYears })}</em>
            </>
          ) : (
            <>
              <strong>—</strong>
              <em>{t("appearsWithLoan")}</em>
            </>
          )}
        </article>
      </div>

      {costs && <CostCompositionBar lines={costs.lines} total={costs.total} />}

      {market && market.history.length > 0 && (
        <div className="mortgage-rate-glance">
          <div>
            <small>{t("marketGlance", { period: activePeriod })}</small>
            <RateSparkline history={market.history} activePeriod={activePeriod} />
          </div>
          <button type="button" className="text-link" onClick={() => toggle("rates")}>
            {open === "rates" ? t("hideHistory") : t("showHistory")}
          </button>
        </div>
      )}

      <div className="mortgage-panels">
        <InsightPanel
          id="costs"
          title={t("panelCostsTitle")}
          summary={costs
            ? t("panelCostsSummary", {
              total: formatEuro(costs.total),
              detail: costsRefund > 0 ? t("costsSummaryRefund", { amount: formatEuro(costsRefund) }) : t("deductibleAmount", { amount: formatEuro(costs.deductibleTotal) }),
            })
            : t("costsSummaryEmpty")}
          tone={fundsTone}
          open={open === "costs"}
          onToggle={() => toggle("costs")}
        >
          <div className="mortgage-insight-toggles">
            <div className="work-chips" role="group" aria-label={t("propertyTypeAria")}>
              <button type="button" className={!options.newBuild ? "active" : undefined} aria-pressed={!options.newBuild} onClick={() => onOptionsChange({ newBuild: false })}>{t("existingBuild")}</button>
              <button type="button" className={options.newBuild ? "active" : undefined} aria-pressed={options.newBuild} onClick={() => onOptionsChange({ newBuild: true })}>{t("newBuild")}</button>
            </div>
            <div className="work-chips" role="group" aria-label={t("usageAria")}>
              <button type="button" className={!options.investment ? "active" : undefined} aria-pressed={!options.investment} onClick={() => onOptionsChange({ investment: false })}>{t("mainResidence")}</button>
              <button type="button" className={options.investment ? "active" : undefined} aria-pressed={options.investment} onClick={() => onOptionsChange({ investment: true })}>{t("investment")}</button>
            </div>
          </div>
          {!costs ? (
            <p className="mortgage-hint">{t("noAskingPriceHint")}</p>
          ) : (
            <>
              {groupedLines.map((group) => (
                <div className="mortgage-cost-group" key={group.category}>
                  <h3>{t(CATEGORY_LABEL[group.category])}</h3>
                  <ul className="mortgage-cost-lines">
                    {group.lines.map((line) => (
                      <CostLineRow
                        key={line.key}
                        line={line}
                        expanded={expandedLine === line.key}
                        onToggle={() => setExpandedLine((current) => current === line.key ? null : line.key)}
                        refund={line.deductible ? deductionRefund(line.amount, deductionRate) : null}
                      />
                    ))}
                  </ul>
                </div>
              ))}
              {costsRefund > 0 && (
                <div className="mortgage-refund-total">
                  <span>
                    {t("refundTotalLabel")}
                    <small>
                      {refundKnown ? t("refundRateKnown", { rate: formatDeductionRate(deductionRate) }) : t("refundRateUnknown", { rate: formatDeductionRate(deductionRate) })}
                      {t("refundViaReturn")}
                    </small>
                  </span>
                  <strong>{refundKnown ? "" : t("refundMaxPrefix")}{formatEuro(costsRefund)}</strong>
                </div>
              )}
              <div className="mortgage-cost-extras">
                <p className="mortgage-hint">{t("optionalItems")}</p>
                <label className="mortgage-check"><input type="checkbox" checked={options.includeAdvice} onChange={(event) => onOptionsChange({ includeAdvice: event.target.checked })} /> {t("optAdvice")}</label>
                <label className="mortgage-check"><input type="checkbox" checked={options.includeInspection} onChange={(event) => onOptionsChange({ includeInspection: event.target.checked })} /> {t("optInspection")}</label>
                <label className="mortgage-check"><input type="checkbox" checked={options.includeBankGuarantee} onChange={(event) => onOptionsChange({ includeBankGuarantee: event.target.checked })} /> {t("optBankGuarantee")}</label>
                <label className="mortgage-check"><input type="checkbox" checked={options.includeBuyingAgent} onChange={(event) => onOptionsChange({ includeBuyingAgent: event.target.checked })} /> {t("optBuyingAgent")}</label>
                <label className="mortgage-check"><input type="checkbox" checked={options.includeMoving} onChange={(event) => onOptionsChange({ includeMoving: event.target.checked })} /> {t("optMoving")}</label>
              </div>
              <p className="mortgage-disclaimer"><CircleHelp size={14} /> {costs.disclaimer}</p>
            </>
          )}
        </InsightPanel>

        <InsightPanel
          id="tax"
          title={t("panelTaxTitle")}
          summary={tax
            ? `${t("taxSummaryFilled", { net: formatEuro(tax.ongoingMonthlyNet) })}${tax.oneOffRefund > 0 ? t("taxOneOffPart", { amount: formatEuro(tax.oneOffRefund) }) : ""}`
            : t("taxSummaryEmpty")}
          open={open === "tax"}
          onToggle={() => toggle("tax")}
        >
          {tax && hasLoan ? (
            <>
              <div className="mortgage-result-grid">
                <div className="is-hero"><small>{t("colGross")}</small><strong>{formatEuro(tax.ongoingMonthlyGross)}</strong></div>
                <div className="is-hero"><small>{t("colNetOngoing")}</small><strong>{formatEuro(tax.ongoingMonthlyNet)}</strong></div>
                <div><small>{t("colOneOffBack")}</small><strong>{formatEuro(tax.oneOffRefund)}</strong></div>
                <div><small>{t("colYear1Benefit")}</small><strong>{formatEuro(tax.year1.taxBenefit)}</strong></div>
              </div>
              <p className="mortgage-hint">
                {t("taxExplanation", {
                  rate: formatDeductionRate(tax.deductionRate),
                  costs: formatEuro(tax.year1.oneOffDeductible),
                  refund: formatEuro(tax.oneOffRefund),
                  ewf: formatEuro(tax.eigenwoningforfait),
                })}
              </p>
              <div className="form-grid mortgage-woz-row">
                <label>{t("wozLabel")}
                  <input
                    type="number" inputMode="numeric"
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
            <p className="mortgage-hint">{t("taxEmptyHint")}</p>
          )}
        </InsightPanel>

        <InsightPanel
          id="compare"
          title={t("panelCompareTitle")}
          summary={showSchedules
            ? t("compareChosen", {
              chosen: repayment === "linear" ? t("linear") : t("annuity"),
              delta: formatEuro(Math.round(Math.abs(interestDelta))),
            })
            : t("compareEmpty")}
          open={open === "compare"}
          onToggle={() => toggle("compare")}
        >
          {showSchedules ? (
            <>
              <div className="mortgage-compare-strip">
                <div className={repayment === "annuity" ? "is-active" : undefined}>
                  <small>{t("annuity")}</small>
                  <strong>{formatEuro(Math.round(annuity.firstPayment))}</strong>
                  <em>{t("compareAnnuityFixed", { interest: formatEuro(Math.round(annuity.totalInterest)) })}</em>
                </div>
                <div className={repayment === "linear" ? "is-active" : undefined}>
                  <small>{t("linear")}</small>
                  <strong>{formatEuro(Math.round(linear.firstPayment))}</strong>
                  <em>{t("compareLinearStart", { interest: formatEuro(Math.round(linear.totalInterest)) })}</em>
                </div>
              </div>
              <p className="mortgage-hint">
                {t("linearHigher", {
                  linearPayment: formatEuro(Math.round(linear.firstPayment)),
                  annuityPayment: formatEuro(Math.round(annuity.firstPayment)),
                  delta: formatEuro(Math.round(interestDelta)),
                })}
              </p>
              <div className="mortgage-charts-grid">
                <PaymentComparisonChart annuity={annuity} linear={linear} />
                <BalanceComparisonChart annuity={annuity} linear={linear} />
                <CumulativeInterestChart annuity={annuity} linear={linear} />
              </div>
            </>
          ) : (
            <p className="mortgage-hint">{t("compareEmptyHint")}</p>
          )}
        </InsightPanel>

        <InsightPanel
          id="rates"
          title={t("panelRatesTitle")}
          summary={market?.indicativeRates.live ? t("ratesLive", { asOf: market.indicativeRates.asOf }) : t("ratesIndication")}
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
                  {showImpactTable ? t("hideImpactTable") : t("showImpactTable")}
                </button>
              </div>
            )}
          </div>
        </InsightPanel>
      </div>

      {referenceSources.length > 0 && (
        <p className="mortgage-sources">
          {t("sourcesLabel", { year: referenceYear })}{" "}
          {referenceSources.map((source, index) => (
            <span key={source.url}>
              {index > 0 ? " · " : ""}
              <a href={source.url} target="_blank" rel="noreferrer">{source.label}</a>
            </span>
          ))}
          {market?.indicativeRates.live ? (
            <>{" · "}{t("marketRateLabel")}: <a href={market.indicativeRates.sourceUrl} target="_blank" rel="noreferrer">{market.indicativeRates.source}</a></>
          ) : null}
        </p>
      )}
    </section>
  );
}
