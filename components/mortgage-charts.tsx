"use client";

import { useTranslations } from "next-intl";
import type { BuyerCostLine } from "@/src/lib/costs";
import type { MortgageMarketHistorySeries } from "@/src/lib/mortgage";
import type { MortgageSchedule } from "@/src/lib/mortgage/schedule";
import { formatEuro } from "@/src/lib/purchase";

const COST_CATEGORY_META: Record<string, { labelKey: string; color: string }> = {
  tax: { labelKey: "costCatTax", color: "#2f6fed" },
  deed: { labelKey: "costCatDeed", color: "#7a9e8a" },
  finance: { labelKey: "costCatFinance", color: "#244b3c" },
  optional: { labelKey: "costCatOptional", color: "#c4a574" },
};

export function CostCompositionBar({ lines, total }: { lines: BuyerCostLine[]; total: number }) {
  const t = useTranslations("hypotheek");
  if (total <= 0) return null;
  const grouped = (["tax", "deed", "finance", "optional"] as const).map((key) => {
    const amount = lines.filter((line) => line.category === key).reduce((sum, line) => sum + line.amount, 0);
    return { key, amount, ...COST_CATEGORY_META[key] };
  }).filter((group) => group.amount > 0);
  const deductible = lines.filter((line) => line.deductible).reduce((sum, line) => sum + line.amount, 0);
  const deductiblePct = Math.round((deductible / total) * 100);

  return (
    <div className="mortgage-stack">
      <div className="mortgage-stack-bar" role="img" aria-label={t("compositionAria")}>
        {grouped.map((group) => (
          <span
            key={group.key}
            style={{ width: `${(group.amount / total) * 100}%`, background: group.color }}
            title={t("compositionTip", { label: t(group.labelKey), amount: formatEuro(group.amount) })}
          />
        ))}
      </div>
      <ul className="mortgage-stack-legend">
        {grouped.map((group) => (
          <li key={group.key}>
            <i style={{ background: group.color }} />
            {t(group.labelKey)} <strong>{formatEuro(group.amount)}</strong>
          </li>
        ))}
        <li className="is-note">{t("deductibleYear1", { pct: deductiblePct })}</li>
      </ul>
    </div>
  );
}

export function FundsMeter({ needed, available }: { needed: number; available: number }) {
  const t = useTranslations("hypotheek");
  if (needed <= 0) return null;
  const ratio = Math.min(1, Math.max(0, available / needed));
  const gap = needed - available;
  const tone = gap <= 0 ? "ok" : gap / needed <= 0.15 ? "tight" : "short";
  return (
    <div className={`mortgage-meter is-${tone}`}>
      <div className="mortgage-meter-track" aria-hidden="true"><span style={{ width: `${ratio * 100}%` }} /></div>
      <small>
        {gap > 0
          ? t("fundsMeterShort", {
            available: formatEuro(Math.round(available)),
            needed: formatEuro(Math.round(needed)),
            gap: formatEuro(Math.round(gap)),
          })
          : available > 0
            ? t("fundsMeterCover", {
              available: formatEuro(Math.round(available)),
              needed: formatEuro(Math.round(needed)),
              surplus: formatEuro(Math.round(-gap)),
            })
            : t("fundsMeterOwn", { needed: formatEuro(Math.round(needed)) })}
      </small>
    </div>
  );
}

type LineSeries = {
  id: string;
  label: string;
  color: string;
  points: { x: number; y: number }[];
  emphasized?: boolean;
};

function niceMax(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function LineChart({
  title,
  subtitle,
  series,
  xLabel,
  yFormat,
  height = 220,
}: {
  title: string;
  subtitle?: string;
  series: LineSeries[];
  xLabel: (x: number) => string;
  yFormat: (y: number) => string;
  height?: number;
}) {
  const width = 640;
  const pad = { top: 16, right: 16, bottom: 36, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const allPoints = series.flatMap((item) => item.points);
  const maxX = Math.max(1, ...allPoints.map((point) => point.x));
  const maxY = niceMax(Math.max(0, ...allPoints.map((point) => point.y)));
  const minY = 0;

  function sx(x: number) {
    return pad.left + (x / maxX) * innerW;
  }
  function sy(y: number) {
    return pad.top + innerH - ((y - minY) / (maxY - minY || 1)) * innerH;
  }

  const gridYs = [0, 0.25, 0.5, 0.75, 1].map((fraction) => minY + (maxY - minY) * fraction);
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round(maxX * fraction));

  return (
    <figure className="mortgage-chart">
      <figcaption>
        <strong>{title}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} className="mortgage-chart-svg">
        {gridYs.map((y) => (
          <g key={`g-${y}`}>
            <line x1={pad.left} x2={width - pad.right} y1={sy(y)} y2={sy(y)} className="mortgage-chart-grid" />
            <text x={pad.left - 8} y={sy(y) + 3} textAnchor="end" className="mortgage-chart-tick">{yFormat(y)}</text>
          </g>
        ))}
        {xTicks.map((x) => (
          <text key={`x-${x}`} x={sx(x)} y={height - 10} textAnchor="middle" className="mortgage-chart-tick">{xLabel(x)}</text>
        ))}
        {series.map((item) => {
          if (item.points.length === 0) return null;
          const d = item.points.map((point, index) => `${index === 0 ? "M" : "L"} ${sx(point.x).toFixed(1)} ${sy(point.y).toFixed(1)}`).join(" ");
          return (
            <path
              key={item.id}
              d={d}
              fill="none"
              stroke={item.color}
              strokeWidth={item.emphasized ? 2.5 : 1.75}
              strokeOpacity={item.emphasized === false ? 0.45 : 1}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <ul className="mortgage-chart-legend">
        {series.map((item) => (
          <li key={item.id}>
            <i style={{ background: item.color, opacity: item.emphasized === false ? 0.45 : 1 }} />
            {item.label}
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function BalanceComparisonChart({ annuity, linear }: { annuity: MortgageSchedule; linear: MortgageSchedule }) {
  const t = useTranslations("hypotheek");
  return (
    <LineChart
      title={t("balanceTitle")}
      subtitle={t("balanceSubtitle")}
      series={[
        {
          id: "annuity",
          label: t("balanceAnnuity"),
          color: "var(--moss)",
          points: annuity.years.map((year) => ({ x: year.year, y: year.balanceEnd })),
          emphasized: true,
        },
        {
          id: "linear",
          label: t("balanceLinear"),
          color: "var(--coral-deep)",
          points: linear.years.map((year) => ({ x: year.year, y: year.balanceEnd })),
        },
      ]}
      xLabel={(x) => (x === 0 ? t("chartStart") : t("chartYear", { x }))}
      yFormat={(y) => (y >= 1000 ? `${Math.round(y / 1000)}k` : String(Math.round(y)))}
    />
  );
}

export function PaymentComparisonChart({ annuity, linear }: { annuity: MortgageSchedule; linear: MortgageSchedule }) {
  const t = useTranslations("hypotheek");
  return (
    <LineChart
      title={t("paymentTitle")}
      subtitle={t("paymentSubtitle")}
      series={[
        {
          id: "annuity",
          label: t("paymentAnnuity"),
          color: "var(--moss)",
          points: annuity.years.map((year) => ({ x: year.year, y: year.payment / 12 })),
          emphasized: true,
        },
        {
          id: "linear",
          label: t("paymentLinear"),
          color: "var(--coral-deep)",
          points: linear.years.map((year) => ({ x: year.year, y: year.payment / 12 })),
        },
      ]}
      xLabel={(x) => (x === 0 ? t("chartStart") : t("chartYear", { x }))}
      yFormat={(y) => `€${Math.round(y)}`}
    />
  );
}

export function CumulativeInterestChart({ annuity, linear }: { annuity: MortgageSchedule; linear: MortgageSchedule }) {
  const t = useTranslations("hypotheek");
  return (
    <LineChart
      title={t("interestTitle")}
      subtitle={t("interestSubtitle", {
        annuity: formatEuro(Math.round(annuity.totalInterest)),
        linear: formatEuro(Math.round(linear.totalInterest)),
      })}
      series={[
        {
          id: "annuity",
          label: t("interestAnnuity"),
          color: "var(--moss)",
          points: annuity.years.map((year) => ({ x: year.year, y: year.cumulativeInterest })),
          emphasized: true,
        },
        {
          id: "linear",
          label: t("interestLinear"),
          color: "var(--coral-deep)",
          points: linear.years.map((year) => ({ x: year.year, y: year.cumulativeInterest })),
        },
      ]}
      xLabel={(x) => (x === 0 ? t("chartStart") : t("chartYear", { x }))}
      yFormat={(y) => (y >= 1000 ? `${Math.round(y / 1000)}k` : String(Math.round(y)))}
    />
  );
}

export function RateImpactChart({
  rows,
  showTable = false,
}: {
  rows: { rate: number; firstPayment: number; totalInterest: number }[];
  showTable?: boolean;
}) {
  const t = useTranslations("hypotheek");
  const width = 640;
  const height = 200;
  const pad = { top: 16, right: 16, bottom: 36, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxY = niceMax(Math.max(0, ...rows.map((row) => row.firstPayment)));
  const sx = (index: number) => pad.left + (index / Math.max(1, rows.length - 1)) * innerW;
  const sy = (y: number) => pad.top + innerH - (y / (maxY || 1)) * innerH;
  const d = rows.map((row, index) => `${index === 0 ? "M" : "L"} ${sx(index).toFixed(1)} ${sy(row.firstPayment).toFixed(1)}`).join(" ");
  const gridYs = [0, 0.25, 0.5, 0.75, 1].map((fraction) => maxY * fraction);

  return (
    <figure className="mortgage-chart">
      <figcaption>
        <strong>{t("rateImpactTitle")}</strong>
        <span>{t("rateImpactSubtitle")}</span>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("rateImpactTitle")} className="mortgage-chart-svg">
        {gridYs.map((y) => (
          <g key={`ri-${y}`}>
            <line x1={pad.left} x2={width - pad.right} y1={sy(y)} y2={sy(y)} className="mortgage-chart-grid" />
            <text x={pad.left - 8} y={sy(y) + 3} textAnchor="end" className="mortgage-chart-tick">€{Math.round(y)}</text>
          </g>
        ))}
        {rows.map((row, index) => (
          <text key={index} x={sx(index)} y={height - 10} textAnchor="middle" className="mortgage-chart-tick">
            {row.rate.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%
          </text>
        ))}
        <path d={d} fill="none" stroke="var(--moss)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      {showTable && (
        <div className="mortgage-chart-table-wrap">
          <table className="mortgage-chart-table">
            <caption className="sr-only">{t("rateImpactTableCaption")}</caption>
            <thead>
              <tr>
                <th>{t("colRate")}</th>
                <th>{t("colMonthly")}</th>
                <th>{t("colTotalInterest")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  <td>{row.rate.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</td>
                  <td>{formatEuro(Math.round(row.firstPayment))}</td>
                  <td>{formatEuro(Math.round(row.totalInterest))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
}

const HISTORY_COLORS: Record<number, string> = {
  5: "#7a9e8a",
  10: "#244b3c",
  20: "#2f6fed",
};

export function RateHistoryChart({
  history,
  activePeriod,
}: {
  history: MortgageMarketHistorySeries[];
  activePeriod: number;
}) {
  const t = useTranslations("hypotheek");
  if (history.length === 0) return null;
  const displaySeries = history.filter((item) => item.period === 5 || item.period === 10 || item.period === 20);
  if (displaySeries.length === 0) return null;

  const months = [...new Set(displaySeries.flatMap((series) => series.points.map((point) => point.month)))].sort();
  const monthIndex = new Map(months.map((month, index) => [month, index]));
  const series: LineSeries[] = displaySeries.map((item) => ({
    id: String(item.period),
    label: item.period === 20 ? t("periodFixed20") : t("periodFixedYears", { period: item.period }),
    color: HISTORY_COLORS[item.period] ?? "#1d1d1f",
    emphasized: item.period === activePeriod || (activePeriod === 30 && item.period === 20),
    points: item.points.map((point) => ({
      x: monthIndex.get(point.month) ?? 0,
      y: point.rate,
    })),
  }));

  const first = months[0] ?? "";
  const last = months[months.length - 1] ?? "";

  return (
    <LineChart
      title={t("historyTitle")}
      subtitle={t("historySubtitle", { first, last })}
      series={series}
      xLabel={(index) => months[index] ?? ""}
      yFormat={(y) => `${y.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%`}
    />
  );
}

export function RateSparkline({
  history,
  activePeriod,
}: {
  history: MortgageMarketHistorySeries[];
  activePeriod: number;
}) {
  const t = useTranslations("hypotheek");
  const series = history.find((item) => item.period === activePeriod)
    ?? history.find((item) => item.period === 20 && activePeriod === 30)
    ?? history[0];
  if (!series || series.points.length < 2) return null;
  const values = series.points.map((point) => point.rate);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const last = values[values.length - 1];
  const first = values[0];
  const delta = last - first;
  const width = 160;
  const height = 36;
  const d = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - 4 - ((value - min) / (max - min || 1)) * (height - 8);
    return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  return (
    <div className="mortgage-spark">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("sparklineAria", { period: activePeriod })} className="mortgage-spark-svg">
        <path d={d} fill="none" stroke="var(--moss)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div>
        <strong>{last.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</strong>
        <small className={delta > 0.05 ? "is-worse" : delta < -0.05 ? "is-better" : undefined}>
          {delta > 0 ? "+" : ""}{delta.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pt
        </small>
      </div>
    </div>
  );
}
