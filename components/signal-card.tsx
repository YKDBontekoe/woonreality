import { ExternalLink } from "lucide-react";
import { SignalInterpretationBlock } from "@/components/property/signal-interpretation";
import { confidenceLabel } from "@/src/lib/analysis/evidence";
import type { SignalInterpretation } from "@/src/lib/signal-interpretation";
import type { Signal } from "@/src/lib/types";

function evidenceDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("nl-NL");
}

export function SignalCard({
  signal,
  interpretation,
}: {
  signal: Signal;
  interpretation?: SignalInterpretation | null;
}) {
  const score = typeof signal.score === "number" ? Math.round(signal.score * 10) : undefined;
  const value =
    typeof signal.value === "number"
      ? signal.value.toLocaleString("nl-NL", { maximumFractionDigits: 1 })
      : signal.value;
  const context = [confidenceLabel(signal.confidence), signal.spatialScale].filter(Boolean).join(" · ");

  return (
    <article className="signal-card">
      <div className="signal-card-top">
        <div className="signal-title">
          <span className={`signal-dot ${signal.severity}`} />
          <div>
            <h3>{signal.label}</h3>
            <small className="signal-category">{signal.category}</small>
          </div>
        </div>
        <div className="signal-value">
          {signal.availability === "unavailable" ? (
            "Geen data"
          ) : (
            <>
              {value}
              {signal.unit && (
                <small style={{ fontSize: 10, color: "var(--muted)" }}>{signal.unit}</small>
              )}
            </>
          )}
        </div>
      </div>
      {interpretation && <SignalInterpretationBlock interpretation={interpretation} />}
      <p className="signal-summary">{signal.summary}</p>
      <p className="signal-context" aria-label={`Datakwaliteit: ${context}`}>
        Datakwaliteit: {context}
      </p>
      <div className="signal-action">
        <strong>Check dit:</strong> {signal.action}
      </div>
      {score !== undefined && signal.availability !== "unavailable" && (
        <div className="signal-bar">
          <div
            className={`signal-bar-fill ${signal.severity}`}
            style={{ width: `${Math.max(0, Math.min(100, score * 10))}%` }}
          />
        </div>
      )}
      <details className="evidence-list">
        <summary>Waarom zie ik dit?</summary>
        <div className="evidence-content">
          {signal.evidence.map((evidence) => (
            <div key={evidence.id}>
              <strong>{evidence.source}</strong>
              {evidence.caveat && <> · {evidence.caveat}</>}{" "}
              <a href={evidence.sourceUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={9} style={{ verticalAlign: "-1px" }} /> bron
              </a>
              <small>
                Opgehaald {new Date(evidence.fetchedAt).toLocaleString("nl-NL")}
                {evidence.sourceUpdatedAt ? ` · brondata ${evidenceDate(evidence.sourceUpdatedAt)}` : ""}
                {evidence.sourceRecordId ? ` · record ${evidence.sourceRecordId}` : ""}
              </small>
            </div>
          ))}
        </div>
      </details>
    </article>
  );
}
