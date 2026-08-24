import { useTranslations } from "next-intl";
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
  const t = useTranslations("woning");
  const benchmark = analysis.wozBenchmark;
  if (!benchmark) return null;

  const rows: WozRow[] = [
    { key: "buurt", label: benchmark.buurtName ? t("woz.buurtNamed", { name: benchmark.buurtName }) : t("woz.buurt"), average: benchmark.buurtAverage },
    { key: "wijk", label: t("woz.wijk"), average: benchmark.wijkAverage },
    { key: "gemeente", label: t("woz.gemeente"), average: benchmark.gemeenteAverage },
  ];
  const available = rows.filter((row) => row.average != null && row.average > 0);
  if (!available.length) return null;
  const maxAverage = Math.max(...available.map((row) => row.average ?? 0));

  const askingPrice = listing?.askingPrice ?? null;
  const ratio = askingPrice ? wozRatio(askingPrice, benchmark.buurtAverage) : null;
  const ratioLabel = ratio == null
    ? null
    : ratio >= 1.05
      ? t("woz.ratioAbove", { pct: Math.round((ratio - 1) * 100) })
      : ratio <= 0.95
        ? t("woz.ratioBelow", { pct: Math.round((1 - ratio) * 100) })
        : t("woz.ratioAround");

  return (
    <section className="dash-collapsible-panel woz-benchmark" aria-label={t("woz.surroundingsSketchAria")}>
      <div className="section-inline-heading">
        <div>
          <div className="eyebrow"><Landmark size={13} /> {t("woz.areaValueEyebrow")}</div>
          <h2>{t("woz.whatDoesAreaCost")}</h2>
          <p>{t("woz.intro", { year: new Date(benchmark.fetchedAt).getFullYear() })}</p>
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
              aria-label={t("woz.rowAria", { label: row.label, amount: formatEuro(row.average!) })}
            >
              <i style={{ width: `${Math.max(6, Math.round(((row.average ?? 0) / maxAverage) * 100))}%` }} />
            </span>
            <strong>{formatEuro(row.average)}</strong>
          </div>
        ))}
        {!askingPrice && <small>{t("woz.importPrompt")}</small>}
      </div>
      <small className="woz-benchmark-caveat">
        {t("woz.caveat")}
      </small>
    </section>
  );
}
