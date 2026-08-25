import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { scoreBand, triageSignals } from "@/src/lib/report-summary";
import type { Analysis, SignalCategory } from "@/src/lib/types";
import { DomainRadar } from "@/components/property/domain-radar";

const MIX_BUCKETS = ["good", "watch", "attention", "unavailable"] as const;

export function PropertyScoreCharts({
  analysis,
  onSelectDomain,
  onOpenSignals,
  onOpenSources,
}: {
  analysis: Analysis;
  onSelectDomain?: (key: SignalCategory) => void;
  onOpenSignals?: () => void;
  onOpenSources?: () => void;
}) {
  const t = useTranslations("woning");
  const triaged = triageSignals(analysis.signals);
  const total = analysis.signals.length || 1;
  const mix = MIX_BUCKETS.map((bucket) => ({
    bucket,
    count: triaged[bucket].length,
    pct: Math.round((triaged[bucket].length / total) * 100),
  })).filter((entry) => entry.count > 0);

  const statuses = analysis.sourceStatuses.map((source) => source.status);
  const statusCounts = {
    ok: statuses.filter((status) => status === "ok").length,
    partial: statuses.filter((status) => status === "partial").length,
    unavailable: statuses.filter((status) => status === "unavailable").length,
  };

  return (
    <section className="dash-score-charts">
      <div className="dash-score-card">
        <div className="section-kicker">{t("charts.topicScoreKicker")}</div>
        <h2 className="dash-score-heading">{t("charts.whereScoreFrom")}</h2>
        <div className="domain-score-grid">
          <DomainRadar domains={analysis.domains} onSelectDomain={onSelectDomain} />
          <div className="score-profile" aria-label={t("charts.topicScoreKicker")}>
            {analysis.domains.map((domain) => {
              const score = domain.score;
              const tone = scoreBand(score);
              return (
                <button
                  className="profile-row is-clickable"
                  type="button"
                  key={domain.key}
                  disabled={!onSelectDomain}
                  onClick={() => onSelectDomain?.(domain.key)}
                >
                  <span>
                    {domain.label}
                    {domain.hasUnscoredAttention && (
                      <AlertTriangle
                        size={11}
                        aria-label={t("charts.unscoredAttentionAria")}
                        style={{ marginLeft: 4, verticalAlign: -1, color: "var(--attention-deep)" }}
                      />
                    )}
                  </span>
                  <span className="profile-track">
                    <i className={`is-${tone}`} style={{ width: `${Math.round((score ?? 0) * 10)}%` }} />
                  </span>
                  <strong className={`is-${tone}`}>
                    {score == null ? "—" : score.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}
                  </strong>
                </button>
              );
            })}
          </div>
        </div>
        {mix.length > 0 && (
          <div className="signal-mix">
            <div className="signal-mix-head">
              <span>{t("charts.mixTitle")}</span>
              {onOpenSignals && (
                <button className="text-link" type="button" onClick={onOpenSignals}>
                  {t("charts.openSignals")} <ArrowRight size={12} />
                </button>
              )}
            </div>
            <div
              className="signal-mix-bar"
              role="img"
              aria-label={mix
                .map((entry) => t(`charts.mix.${entry.bucket}`, { count: entry.count }))
                .join(", ")}
            >
              {mix.map((entry) => (
                <i
                  className={`is-${entry.bucket}`}
                  key={entry.bucket}
                  style={{ width: `${Math.max(entry.pct, mix.length > 1 ? 3 : 100)}%` }}
                />
              ))}
            </div>
            <ul className="signal-mix-legend">
              {mix.map((entry) => (
                <li key={entry.bucket}>
                  <i className={`is-${entry.bucket}`} aria-hidden="true" />
                  {t(`charts.mix.${entry.bucket}`, { count: entry.count })}
                </li>
              ))}
            </ul>
          </div>
        )}
        {analysis.sourceStatuses.length > 0 && (
          <button
            className={`coverage-strip ${onOpenSources ? "is-clickable" : ""}`}
            type="button"
            onClick={() => onOpenSources?.()}
            disabled={!onOpenSources}
          >
            <span className="coverage-strip-head">
              <span>{t("charts.coverageTitle")}</span>
              <strong>{analysis.dataCoverage.label}</strong>
            </span>
            <span className="coverage-strip-bar" role="img" aria-label={t("charts.coverageAria", {
              ok: statusCounts.ok,
              partial: statusCounts.partial,
              unavailable: statusCounts.unavailable,
            })}>
              {analysis.sourceStatuses.map((source) => (
                <i className={source.status} key={source.source} />
              ))}
            </span>
            <span className="coverage-strip-foot">
              {t("charts.sourceOk", { count: statusCounts.ok })}
              {statusCounts.partial > 0 && <> · {t("charts.sourcePartial", { count: statusCounts.partial })}</>}
              {statusCounts.unavailable > 0 && <> · {t("charts.sourceUnavailable", { count: statusCounts.unavailable })}</>}
              <ArrowRight size={12} />
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
