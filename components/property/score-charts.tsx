import { AlertTriangle } from "lucide-react";
import { ScoreDonut } from "@/components/property/score-donut";
import type { Analysis } from "@/src/lib/types";

export function PropertyScoreCharts({ analysis }: { analysis: Analysis }) {
  const attention = (analysis.everydayInsights ?? []).filter((item) => item.tone === "attention").length;
  const good = (analysis.everydayInsights ?? []).filter((item) => item.tone === "good").length;
  return (
    <section className="dash-score-charts">
      <div className="dash-score-card">
        <div className="section-kicker">Score per onderwerp</div>
        <div className="dash-score-hero">
          <ScoreDonut score={analysis.overallScore} />
          <div>
            <strong>{good} plus · {attention} let op</strong>
            <p>{analysis.dataCoverage.label}</p>
          </div>
        </div>
        <div className="score-profile" aria-label="Score per onderwerp">
          {analysis.domains.map((domain) => {
            const score = domain.score ?? 0;
            return (
              <div className="profile-row" key={domain.key}>
                <span>
                  {domain.label}
                  {domain.hasUnscoredAttention && (
                    <AlertTriangle
                      size={11}
                      aria-label="Open aandachtspunt zonder score"
                      style={{ marginLeft: 4, verticalAlign: -1, color: "#b8860b" }}
                    />
                  )}
                </span>
                <div className="profile-track">
                  <i style={{ width: `${Math.round(score * 10)}%` }} />
                </div>
                <strong>
                  {domain.score == null ? "—" : score.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}
                </strong>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
