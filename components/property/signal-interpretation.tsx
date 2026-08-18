import type { SignalInterpretation } from "@/src/lib/signal-interpretation";

export function SignalInterpretationBlock({
  interpretation,
  compact = false,
}: {
  interpretation: SignalInterpretation;
  compact?: boolean;
}) {
  return (
    <div className={`signal-interpretation ${compact ? "is-compact" : ""}`}>
      <span className={`signal-interpretation-pill is-${interpretation.verdict}`}>
        {interpretation.label}
      </span>
      {interpretation.benchmark && !compact && (
        <div className="signal-benchmark" aria-hidden="true">
          <div className="signal-benchmark-track">
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
            {interpretation.benchmark.markers.map((marker) => (
              <span key={`legend-${marker.kind}-${marker.label}`}>{marker.label}</span>
            ))}
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
