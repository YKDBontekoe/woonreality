import { Landmark } from "lucide-react";
import { formatEuro } from "@/src/lib/purchase";
import { wozRatio } from "@/src/lib/types";
import type { Analysis, PropertyListing } from "@/src/lib/types";

type WozRow = {
  key: string;
  label: string;
  average?: number;
};

/**
 * CBS-WOZ benchmark: what homes cost on average around the subject, at three
 * region levels. Deliberately framed as context, never as a valuation.
 */
export function WozBenchmarkCard({ analysis, listing }: { analysis: Analysis; listing: PropertyListing | null }) {
  const benchmark = analysis.wozBenchmark;
  if (!benchmark) return null;

  const rows: WozRow[] = [
    { key: "buurt", label: benchmark.buurtName ? `Buurt (${benchmark.buurtName})` : "Buurt", average: benchmark.buurtAverage },
    { key: "wijk", label: "Wijk", average: benchmark.wijkAverage },
    { key: "gemeente", label: "Gemeente", average: benchmark.gemeenteAverage },
  ];
  const available = rows.filter((row) => row.average != null && row.average > 0);
  if (!available.length) return null;
  const maxAverage = Math.max(...available.map((row) => row.average ?? 0));

  const askingPrice = listing?.askingPrice ?? null;
  const ratio = askingPrice ? wozRatio(askingPrice, benchmark.buurtAverage) : null;
  const ratioLabel = ratio == null
    ? null
    : ratio >= 1.05
      ? `circa ${Math.round((ratio - 1) * 100)}% boven het buurtgemiddelde`
      : ratio <= 0.95
        ? `circa ${Math.round((1 - ratio) * 100)}% onder het buurtgemiddelde`
        : "rond het buurtgemiddelde";

  return (
    <section className="dash-collapsible-panel woz-benchmark" aria-label="WOZ-omgevingsschets">
      <div className="section-inline-heading">
        <div>
          <div className="eyebrow"><Landmark size={13} /> waarde in de omgeving</div>
          <h2>Wat kost de buurt?</h2>
          <p>Gemiddelde WOZ-waarde van álle woningen per gebied (CBS {new Date(benchmark.fetchedAt).getFullYear()}). Dit is geen waarde van deze woning en geen taxatie.</p>
        </div>
        {askingPrice != null && ratioLabel ? (
          <span className="coverage-pill">{formatEuro(askingPrice)} — {ratioLabel}</span>
        ) : null}
      </div>
      <div className="woz-benchmark-rows">
        {rows.filter((row) => row.average != null && row.average > 0).map((row) => (
          <div className="woz-benchmark-row" key={row.key}>
            <span className="woz-benchmark-label">{row.label}</span>
            <span
              className="woz-benchmark-bar"
              role="img"
              aria-label={`${row.label}: ${formatEuro(row.average!)}`}
            >
              <i style={{ width: `${Math.max(6, Math.round(((row.average ?? 0) / maxAverage) * 100))}%` }} />
            </span>
            <strong>{formatEuro(row.average)}</strong>
          </div>
        ))}
        {!askingPrice && <small>Vul of importeer een advertentie met vraagprijs om je af te zetten tegen deze gemiddelden.</small>}
      </div>
      <small className="woz-benchmark-caveat">
        Het buurtgemiddelde mixt appartementen, rijwoningen en villa&rsquo;s; een afwijkend woningtype verklaart meestal een groot verschil met de vraagprijs.
      </small>
    </section>
  );
}
