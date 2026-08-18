"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SignalCard } from "@/components/signal-card";
import { interpretSignal, interpretationForDomain } from "@/src/lib/signal-interpretation";
import { triageSignals } from "@/src/lib/report-summary";
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
  if (filter === "attention") return triaged.attention.includes(signal) || triaged.watch.includes(signal);
  if (filter === "good") return triaged.good.includes(signal);
  return triaged.unavailable.includes(signal);
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
  const [openDomains, setOpenDomains] = useState<Record<string, boolean>>({});

  const triaged = useMemo(() => triageSignals(analysis.signals), [analysis.signals]);

  useEffect(() => {
    if (!focusSignalKey) return;
    setExpandedKey(focusSignalKey);
    setFilter("all");
    const signal = analysis.signals.find((item) => item.key === focusSignalKey);
    if (signal?.category) {
      setOpenDomains((current) => ({ ...current, [signal.category as string]: true }));
    }
    window.setTimeout(() => {
      document.getElementById(`signal-${focusSignalKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  }, [analysis.signals, focusSignalKey]);

  const hiddenCount =
    triaged.good.length + triaged.unavailable.length;

  return (
    <section className="dash-signal-explorer" id="signalen">
      <div className="section-inline-heading">
        <div>
          <div className="section-kicker">Open data</div>
          <h2>Signalen</h2>
          {filter === "focus" && hiddenCount > 0 && (
            <p className="dash-signal-explorer-note">
              {triaged.attention.length + triaged.watch.length} punten nu zichtbaar · {hiddenCount} overige signalen onder filters
            </p>
          )}
        </div>
        <span className="coverage-pill">{analysis.signals.length}</span>
      </div>
      <div className="dash-point-filters" role="tablist" aria-label="Signaalfilters">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={filter === item.id ? "is-on" : ""}
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
          const open = openDomains[domain.key] ?? filter !== "all";
          const domainSummary = interpretationForDomain(domain, analysis.signals);
          return (
            <section className="dash-signal-domain" key={domain.key}>
              <button
                type="button"
                className="dash-signal-domain-toggle"
                aria-expanded={open}
                onClick={() =>
                  setOpenDomains((current) => ({ ...current, [domain.key]: !open }))
                }
              >
                <div>
                  <strong>{domain.label}</strong>
                  <span>{domainSummary}</span>
                </div>
                <ChevronDown size={16} className={open ? "is-open" : ""} />
              </button>
              {open && (
                <div className="dash-signal-domain-body">
                  {domain.score != null && (
                    <div className="profile-row dash-signal-domain-score">
                      <span>Domeinscore</span>
                      <div className="profile-track">
                        <i style={{ width: `${Math.round(domain.score * 10)}%` }} />
                      </div>
                      <strong>{domain.score.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}</strong>
                    </div>
                  )}
                  <div className="dash-signal-list">
                    {domainSignals.map((signal) => {
                      const interpretation = interpretSignal(signal);
                      const expanded = expandedKey === signal.key;
                      return (
                        <div className={`dash-signal-row ${expanded ? "is-expanded" : ""}`} key={signal.key} id={`signal-${signal.key}`}>
                          <button
                            type="button"
                            className="dash-signal-row-toggle"
                            aria-expanded={expanded}
                            onClick={() => setExpandedKey(expanded ? null : signal.key)}
                          >
                            <div>
                              <strong>{signal.label}</strong>
                              {interpretation && (
                                <span className={`signal-interpretation-pill is-${interpretation.verdict}`}>
                                  {interpretation.label}
                                </span>
                              )}
                            </div>
                            {typeof signal.score === "number" && signal.availability !== "unavailable" && (
                              <div className="signal-bar">
                                <div
                                  className={`signal-bar-fill ${signal.severity}`}
                                  style={{ width: `${Math.max(0, Math.min(100, signal.score * 10))}%` }}
                                />
                              </div>
                            )}
                            <ChevronDown size={14} className={expanded ? "is-open" : ""} />
                          </button>
                          {expanded && <SignalCard signal={signal} interpretation={interpretation} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}
