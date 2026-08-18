import type { SignalInterpretation } from "@/src/lib/signal-interpretation";

export function SignalInterpretationBlock({
  interpretation,
  compact = false,
  hidePill = false,
}: {
  interpretation: SignalInterpretation;
  compact?: boolean;
  hidePill?: boolean;
}) {
  return (
    <div className={`signal-interpretation ${compact ? "is-compact" : ""}`}>
      {!hidePill && (
        <span className={`signal-interpretation-pill is-${interpretation.verdict}`}>
          {interpretation.label}
        </span>
      )}
      {interpretation.benchmark && !compact && (
        <div className="signal-benchmark">
          <div className="signal-benchmark-track" aria-hidden="true">
            {interpretation.benchmark.markers.map((marker) => (
              <i
                className={`signal-benchmark-marker is-${marker.kind}`}
                key={`${marker.kind}-${marker.label}`}
                style={{ left: `${marker.position}%` }}
                title={marker.label}
              />
            ))}
          </div>
          <div className="signal-benchmark-legend">
            {interpretation.benchmark.markers.map((marker) => {
              const value =
                marker.kind === "you"
                  ? interpretation.benchmark?.value
                  : marker.kind === "reference"
                    ? interpretation.benchmark?.referenceValue
                    : interpretation.benchmark?.secondaryReferenceValue;
              const digits = interpretation.benchmark?.precision ?? 1;
              return (
                <span key={`legend-${marker.kind}-${marker.label}`}>
                  <i className={`signal-benchmark-swatch is-${marker.kind}`} />
                  {marker.label}
                  {value != null && ` ${value.toLocaleString("nl-NL", { maximumFractionDigits: digits })}`}
                </span>
              );
            })}
          </div>
        </div>
      )}
      {!compact && (
        <p className="signal-explainer">
          <strong>Wat betekent dit?</strong> {interpretation.explainer}
        </p>
      )}
    </div>
  );
}
