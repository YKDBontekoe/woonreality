import { ExternalLink } from "lucide-react";
import { SignalInterpretationBlock } from "@/components/property/signal-interpretation";
import { confidenceLabel } from "@/src/lib/analysis/evidence";
import type { SignalInterpretation } from "@/src/lib/signal-interpretation";
import type { Severity, Signal } from "@/src/lib/types";

const severityLabel: Record<Severity, string> = {
  good: "Positief",
  neutral: "Neutraal",
  attention: "Aandachtspunt",
};

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
  const unavailable = signal.availability === "unavailable";

  return (
    <article className="signal-card">
      <div className="signal-card-top">
        <div className="signal-title">
          {/* The dot alone is colour-only; the hidden text carries the verdict to
              screen readers and colour-blind users. */}
          <span className={`signal-dot ${signal.severity}`} aria-hidden="true" />
          <span className="sr-only">{severityLabel[signal.severity]}</span>
          <div>
            <h3>{signal.label}</h3>
            <small className="signal-category">{signal.category}</small>
          </div>
        </div>
        <div className="signal-value">
          {unavailable ? (
            "Geen data"
          ) : (
            <>
              {value}
              {signal.unit && <small className="signal-value-unit">{signal.unit}</small>}
            </>
          )}
        </div>
      </div>
      {interpretation && <SignalInterpretationBlock interpretation={interpretation} />}
      <p className="signal-summary">{signal.summary}</p>
      <p className="signal-context">
        <span className="sr-only">Datakwaliteit: </span>{context}
      </p>
      <div className="signal-action">
        <strong>Check dit:</strong> {signal.action}
      </div>
      {!unavailable && typeof signal.score === "number" && (
        // Convey the bar's meaning as a meter rather than pure decoration.
        <div
          className="signal-bar"
          role="meter"
          aria-valuenow={Math.round(signal.score * 10) / 10}
          aria-valuemin={0}
          aria-valuemax={10}
          aria-label={`${signal.label}: score ${signal.score.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} van 10`}
        >
          <div
            className={`signal-bar-fill ${signal.severity}`}
            style={{ width: `${Math.max(0, Math.min(100, score!))}%` }}
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
                <span className="sr-only"> (opent in nieuw tabblad)</span>
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
