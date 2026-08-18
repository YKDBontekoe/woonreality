"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SignalInterpretationBlock } from "@/components/property/signal-interpretation";
import { interpretSignal } from "@/src/lib/signal-interpretation";
import { scoreBand, triageSignals } from "@/src/lib/report-summary";
import type { Analysis, Signal } from "@/src/lib/types";

type FilterId = "focus" | "attention" | "good" | "unavailable" | "all";

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "focus", label: "Wat valt op" },
  { id: "attention", label: "Let op" },
  { id: "good", label: "Goed" },
  { id: "unavailable", label: "Geen data" },
  { id: "all", label: "Alles" },
];

function matchesFilter(filter: FilterId, signal: Signal, triaged: ReturnType<typeof triageSignals>) {
  if (filter === "all") return true;
  if (filter === "focus") {
    return triaged.attention.includes(signal) || triaged.watch.includes(signal);
  }
  if (filter === "attention") return triaged.attention.includes(signal);
  if (filter === "good") return triaged.good.includes(signal);
  return triaged.unavailable.includes(signal);
}

function signalValue(signal: Signal) {
  if (signal.availability === "unavailable") return "—";
  if (typeof signal.value === "number") {
    return `${signal.value.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}${signal.unit ? ` ${signal.unit}` : ""}`;
  }
  return String(signal.value);
}

export function SignalExplorer({
  analysis,
  focusSignalKey,
}: {
  analysis: Analysis;
  focusSignalKey?: string | null;
}) {
  const [filter, setFilter] = useState<FilterId>("focus");
  const [expandedKey, setExpandedKey] = useState<string | null>(focusSignalKey ?? null);

  const triaged = useMemo(() => triageSignals(analysis.signals), [analysis.signals]);

  useEffect(() => {
    if (!focusSignalKey) return;
    setExpandedKey(focusSignalKey);
    setFilter("all");
    const timer = window.setTimeout(() => {
      document.getElementById(`signal-${focusSignalKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [focusSignalKey]);

  const visibleCount = analysis.signals.filter((signal) => matchesFilter(filter, signal, triaged)).length;

  return (
    <section className="dash-signal-explorer" id="signalen">
      <div className="section-inline-heading">
        <div>
          <div className="section-kicker">Open data</div>
          <h2>Signalen</h2>
          <p className="dash-signal-explorer-note">
            {visibleCount} {filter === "focus" ? "punten die opvallen" : "signalen"} · tik een regel voor uitleg
          </p>
        </div>
      </div>
      <div className="dash-point-filters" role="group" aria-label="Signaalfilters">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={filter === item.id ? "is-on" : ""}
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="dash-signal-domains">
        {analysis.domains.map((domain) => {
          const domainSignals = (triaged.byDomain[domain.key] ?? []).filter((signal) =>
            matchesFilter(filter, signal, triaged),
          );
          if (!domainSignals.length) return null;
          const tone = scoreBand(domain.score);
          return (
            <section className="dash-signal-domain" key={domain.key}>
              <header className="dash-signal-domain-head">
                <div>
                  <strong>{domain.label}</strong>
                  {domain.score != null && (
                    <span className={`dash-signal-domain-score is-${tone}`}>
                      {domain.score.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}
                    </span>
                  )}
                </div>
                <div className="profile-track dash-signal-domain-track">
                  <i className={`is-${tone}`} style={{ width: `${Math.round((domain.score ?? 0) * 10)}%` }} />
                </div>
              </header>
              <div className="dash-signal-list">
                {domainSignals.map((signal) => {
                  const interpretation = interpretSignal(signal);
                  const expanded = expandedKey === signal.key;
                  return (
                    <article
                      className={`dash-signal-row is-${interpretation?.verdict ?? signal.severity} ${expanded ? "is-expanded" : ""}`}
                      key={signal.key}
                      id={`signal-${signal.key}`}
                    >
                      <button
                        type="button"
                        className="dash-signal-row-toggle"
                        aria-expanded={expanded}
                        onClick={() => setExpandedKey(expanded ? null : signal.key)}
                      >
                        <span className="dash-signal-row-copy">
                          <strong>{signal.label}</strong>
                          {interpretation && (
                            <span className={`signal-interpretation-pill is-${interpretation.verdict}`}>
                              {interpretation.label}
                            </span>
                          )}
                        </span>
                        <span className="dash-signal-row-value">{signalValue(signal)}</span>
                        <ChevronDown size={16} className={expanded ? "is-open" : ""} />
                      </button>
                      {expanded && (
                        <div className="dash-signal-detail">
                          {interpretation && (
                            <SignalInterpretationBlock interpretation={interpretation} hidePill />
                          )}
                          <p className="signal-summary">{signal.summary}</p>
                          <p className="signal-action"><strong>Check dit:</strong> {signal.action}</p>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
