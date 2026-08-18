import { AlertTriangle } from "lucide-react";
import { scoreBand } from "@/src/lib/report-summary";
import type { Analysis } from "@/src/lib/types";

export function PropertyScoreCharts({ analysis }: { analysis: Analysis }) {
  return (
    <section className="dash-score-charts">
      <div className="dash-score-card">
        <div className="section-kicker">Score per onderwerp</div>
        <h2 className="dash-score-heading">Waar de score vandaan komt</h2>
        <div className="score-profile" aria-label="Score per onderwerp">
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
                      aria-label="Open aandachtspunt zonder score"
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
