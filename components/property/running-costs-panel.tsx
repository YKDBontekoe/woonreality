"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { formatEuro } from "@/src/lib/purchase";
import type { RunningCostEstimate } from "@/src/lib/running-costs";

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
  const [estimate, setEstimate] = useState<RunningCostEstimate | null>(null);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    // Reset state before each request to avoid flicker and stale results.
    setEstimate(null);
    setError(false);

    const params = new URLSearchParams();
    if (vveContribution != null) params.set("vveContribution", String(vveContribution));
    if (gasConnection === false) params.set("gasConnection", "false");
    if (housingType) params.set("housingType", housingType);
    const qs = params.toString();

    fetch(`/api/running-costs/${encodeURIComponent(bagId)}${qs ? `?${qs}` : ""}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("fetch failed");
        const payload = await response.json() as RunningCostEstimate;
        if (cancelled) return;
        setEstimate(payload);
      })
      .catch((caught) => {
        if (cancelled) return;
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(true);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [bagId, vveContribution, gasConnection, housingType, retryCount]);

  if (error) return (
    <details className="dash-collapsible-panel">
      <summary>Geschatte woonlasten</summary>
      <p className="dash-deal-empty">Woonlasten konden nu niet worden berekend.{" "}
        <button className="text-link" type="button" onClick={() => { setError(false); setRetryCount((count) => count + 1); }}>
          <RotateCcw size={12} /> Opnieuw proberen
        </button>
      </p>
    </details>
  );

  return (
    <details className="dash-collapsible-panel">
      <summary>Geschatte woonlasten</summary>
      {!estimate ? (
        <p className="dash-deal-empty">Woonlasten worden berekend…</p>
      ) : (
        <>
          <table className="running-costs-table">
            <tbody>
              {estimate.lines.map((line) => (
                <tr key={line.key} className={`running-cost-row is-${line.category}`}>
                  <td className="running-cost-label">
                    {line.label}
                    {line.cbsSourced && <span className="running-cost-badge" title="CBS open data">CBS</span>}
                  </td>
                  <td className="running-cost-amount">{formatEuro(line.amountMonthly)}<small>/mnd</small></td>
                  <td className="running-cost-amount is-yearly">{formatEuro(line.amountYearly)}<small>/jaar</small></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="running-cost-total">
                <td>Totaal geschat</td>
                <td className="running-cost-amount">{formatEuro(estimate.monthlyTotal)}<small>/mnd</small></td>
                <td className="running-cost-amount is-yearly">{formatEuro(estimate.yearlyTotal)}<small>/jaar</small></td>
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
