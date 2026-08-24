import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { scoreBand } from "@/src/lib/report-summary";
import type { Analysis } from "@/src/lib/types";

export function PropertyScoreCharts({ analysis }: { analysis: Analysis }) {
  const t = useTranslations("woning");
  return (
    <section className="dash-score-charts">
      <div className="dash-score-card">
        <div className="section-kicker">{t("charts.topicScoreKicker")}</div>
        <h2 className="dash-score-heading">{t("charts.whereScoreFrom")}</h2>
        <div className="score-profile" aria-label={t("charts.topicScoreKicker")}>
          {analysis.domains.map((domain) => {
            const score = domain.score;
            const tone = scoreBand(score);
            return (
              <div className="profile-row" key={domain.key}>
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
                <div className="profile-track">
                  <i className={`is-${tone}`} style={{ width: `${Math.round((score ?? 0) * 10)}%` }} />
                </div>
                <strong className={`is-${tone}`}>
                  {score == null ? "—" : score.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}
                </strong>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
