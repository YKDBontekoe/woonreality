"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { RotateCcw } from "lucide-react";
import { useApi } from "@/components/hooks/use-api";
import { formatEuro } from "@/src/lib/purchase";
import type { RunningCostCategory, RunningCostEstimate } from "@/src/lib/running-costs";

const CATEGORY_META: Record<RunningCostCategory, { labelKey: string; tone: string }> = {
  energy: { labelKey: "catEnergy", tone: "is-energy" },
  housing: { labelKey: "catHousing", tone: "is-housing" },
  tax: { labelKey: "catTax", tone: "is-tax" },
};

export function RunningCostsPanel({
  bagId,
  vveContribution,
  gasConnection,
  housingType,
}: {
  bagId: string;
  vveContribution?: number;
  gasConnection?: boolean;
  housingType?: string;
}) {
  const t = useTranslations("woning");

  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (vveContribution != null) params.set("vveContribution", String(vveContribution));
    if (gasConnection === false) params.set("gasConnection", "false");
    if (housingType) params.set("housingType", housingType);
    const qs = params.toString();
    return `/api/running-costs/${encodeURIComponent(bagId)}${qs ? `?${qs}` : ""}`;
  }, [bagId, vveContribution, gasConnection, housingType]);

  const { data: estimate, loading, error, reload } = useApi<RunningCostEstimate>(url, { errorMessage: "" });

  if (error) return (
    <details className="dash-collapsible-panel">
      <summary>{t("runningCosts.summary")}</summary>
      <p className="dash-deal-empty">{t("runningCosts.calcFailed")}{" "}
        <button className="text-link" type="button" onClick={reload}>
          <RotateCcw size={12} /> {t("runningCosts.retry")}
        </button>
      </p>
    </details>
  );

  return (
    <details className="dash-collapsible-panel">
      <summary>{t("runningCosts.summary")}</summary>
      {!estimate || loading ? (
        <p className="dash-deal-empty">{t("runningCosts.calculating")}</p>
      ) : (
        <>
          {(() => {
            const groups = (Object.keys(CATEGORY_META) as RunningCostCategory[])
              .map((key) => ({
                key,
                amount: estimate.lines
                  .filter((line) => line.category === key)
                  .reduce((sum, line) => sum + line.amountMonthly, 0),
                ...CATEGORY_META[key],
              }))
              .filter((group) => group.amount > 0);
            if (groups.length < 2 || estimate.monthlyTotal <= 0) return null;
            return (
              <div className="running-costs-composition">
                <div
                  className="running-costs-composition-bar"
                  role="img"
                  aria-label={groups
                    .map((group) => `${t(group.labelKey)} ${Math.round((group.amount / estimate.monthlyTotal) * 100)}%`)
                    .join(", ")}
                >
                  {groups.map((group) => (
                    <i
                      className={group.tone}
                      key={group.key}
                      style={{ width: `${(group.amount / estimate.monthlyTotal) * 100}%` }}
                      title={`${t(group.labelKey)} — ${formatEuro(group.amount)}${t("runningCosts.perMonth")}`}
                    />
                  ))}
                </div>
                <ul className="running-costs-composition-legend">
                  {groups.map((group) => (
                    <li key={group.key}>
                      <i className={group.tone} aria-hidden="true" />
                      {t(group.labelKey)}
                      <strong>{formatEuro(group.amount)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}
          <table className="running-costs-table">
            <tbody>
              {estimate.lines.map((line) => (
                <tr key={line.key} className={`running-cost-row is-${line.category}`}>
                  <td className="running-cost-label">
                    {line.label}
                    {line.cbsSourced && <span className="running-cost-badge" title={t("runningCosts.cbsBadgeTitle")}>CBS</span>}
                  </td>
                  <td className="running-cost-amount">{formatEuro(line.amountMonthly)}<small>{t("runningCosts.perMonth")}</small></td>
                  <td className="running-cost-amount is-yearly">{formatEuro(line.amountYearly)}<small>{t("runningCosts.perYear")}</small></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="running-cost-total">
                <td>{t("runningCosts.totalEstimated")}</td>
                <td className="running-cost-amount">{formatEuro(estimate.monthlyTotal)}<small>{t("runningCosts.perMonth")}</small></td>
                <td className="running-cost-amount is-yearly">{formatEuro(estimate.yearlyTotal)}<small>{t("runningCosts.perYear")}</small></td>
              </tr>
            </tfoot>
          </table>
          <ul className="running-costs-notes">
            {estimate.lines.map((line) => (
              <li key={line.key}><strong>{line.label}:</strong> {line.note}</li>
            ))}
          </ul>
          <p className="running-costs-disclaimer">
            {estimate.disclaimer}
          </p>
          <p className="running-costs-sources">
            Tarieven: {estimate.tariffSource} ({estimate.tariffPeriod}).
            Verbruik: {estimate.consumptionSource} ({estimate.consumptionPeriod}).
          </p>
        </>
      )}
    </details>
  );
}
