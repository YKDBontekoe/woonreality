import { AlertTriangle } from "lucide-react";
import type { Analysis } from "@/src/lib/types";

function Donut({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(10, score));
  const radius = 36;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - clamped / 10);
  return (
    <svg className="dash-donut" viewBox="0 0 96 96" aria-hidden="true">
      <circle cx="48" cy="48" r={radius} fill="none" stroke="var(--line)" strokeWidth="8" />
      <circle
        cx="48"
        cy="48"
        r={radius}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="8"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 48 48)"
      />
      <text x="48" y="52" textAnchor="middle" fontSize="18" fontFamily="Space Grotesk, sans-serif" fontWeight="600" fill="var(--ink)">
        {clamped.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}
      </text>
    </svg>
  );
}

export function PropertyScoreCharts({ analysis }: { analysis: Analysis }) {
  const attention = (analysis.everydayInsights ?? []).filter((item) => item.tone === "attention").length;
  const good = (analysis.everydayInsights ?? []).filter((item) => item.tone === "good").length;
  return (
    <section className="dash-score-charts" id="overzicht">
      <div className="dash-score-card">
        <div className="section-kicker">Omgevingsscore</div>
        <div className="dash-score-hero">
          <Donut score={analysis.overallScore} />
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
                    <AlertTriangle size={11} aria-label="Open aandachtspunt zonder score" style={{ marginLeft: 4, verticalAlign: -1, color: "#b8860b" }} />
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
