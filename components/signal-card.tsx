import { ExternalLink } from "lucide-react";
import type { Signal } from "@/src/lib/types";

export function SignalCard({ signal }: { signal: Signal }) {
  const score = typeof signal.score === "number" ? Math.round(signal.score * 10) : undefined;
  const value = typeof signal.value === "number" ? signal.value.toLocaleString("nl-NL", { maximumFractionDigits: 1 }) : signal.value;
  return <article className="signal-card">
    <div className="signal-card-top"><div className="signal-title"><span className={`signal-dot ${signal.severity}`} /><div><h3>{signal.label}</h3><small className="signal-category">{signal.category}</small></div></div><div className="signal-value">{signal.availability === "unavailable" ? "Geen data" : <>{value}{signal.unit && <small style={{ fontSize: 10, color: "var(--muted)" }}>{signal.unit}</small>}</>}</div></div>
    <p className="signal-summary">{signal.summary}</p>
    <div className="signal-action"><strong>Check dit:</strong> {signal.action}</div>
    {score !== undefined && signal.availability !== "unavailable" && <div className="signal-bar"><div className={`signal-bar-fill ${signal.severity}`} style={{ width: `${Math.max(0, Math.min(100, score * 10))}%` }} /></div>}
    <details className="evidence-list"><summary>Waarom zie ik dit?</summary><div className="evidence-content">{signal.evidence.map((evidence) => <div key={evidence.id}><strong>{evidence.source}</strong>{evidence.caveat && <> · {evidence.caveat}</>} <a href={evidence.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={9} style={{ verticalAlign: "-1px" }} /> bron</a></div>)}</div></details>
  </article>;
}
