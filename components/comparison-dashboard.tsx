"use client";

import { ArrowLeft, GitCompare, Heart, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { usePropertyWorkspace } from "@/components/use-property-workspace";
import { calculatePersonalFit } from "@/src/lib/personalization";
import type { Analysis } from "@/src/lib/types";

export function ComparisonDashboard({ bagIds }: { bagIds: string[] }) {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const { workspace, toggleCompare } = usePropertyWorkspace();

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);

    async function loadAnalyses() {
      setLoading(true);
      setLoadError("");
      if (bagIds.length < 2) {
        setAnalyses([]);
        setLoading(false);
        window.clearTimeout(timeout);
        return;
      }
      try {
        const items = await Promise.all(bagIds.map(async (id) => {
          try {
            const response = await fetch(`/api/analysis/${encodeURIComponent(id)}`, { signal: controller.signal, cache: "no-store" });
            if (!response.ok) return null;
            return response.json() as Promise<Analysis>;
          } catch {
            return null;
          }
        }));
        const available = items.filter((item): item is Analysis => Boolean(item));
        if (active) {
          setAnalyses(available);
          if (available.length !== items.length) setLoadError("Een of meer woninganalyses zijn tijdelijk niet beschikbaar. Probeer het straks opnieuw.");
        }
      } catch {
        if (active) setLoadError("De vergelijking kon niet volledig worden geladen. Probeer het opnieuw.");
      } finally {
        window.clearTimeout(timeout);
        if (active) setLoading(false);
      }
    }

    void loadAnalyses();
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [bagIds]);

  if (loading) return <main className="site-shell"><div className="container"><SiteHeader /><div className="loading-shell"><div className="loading-block" /><div className="loading-block big" /></div></div></main>;
  if (analyses.length < 2) return <main className="site-shell"><div className="container"><SiteHeader /><div className="loading-shell"><Link className="back-link" href="/"><ArrowLeft size={14} /> Terug naar zoeken</Link><h1>{loadError ? "Vergelijking tijdelijk niet beschikbaar" : "Kies minstens twee woningen"}</h1><p className="hero-copy">{loadError || "Voeg woningen toe met “Vergelijk” op de woningcheck."}</p><Link className="primary-button" href="/">Zoek een adres</Link></div></div></main>;

  const domains = analyses[0].domains;
  return <main className="site-shell"><div className="container comparison-page"><SiteHeader /><Link className="back-link" href="/mijn-aankoop"><ArrowLeft size={14} /> Terug naar mijn aankoop</Link><div className="eyebrow"><GitCompare size={13} /> vergelijking</div><h1>Welke plek past het best?</h1><p className="hero-copy">De vaste Reality Score blijft vergelijkbaar; jouw persoonlijke fit gebruikt je opgeslagen voorkeuren.</p>{loadError && <p className="compare-alert" role="alert">{loadError}</p>}<section className="comparison-cards">{analyses.map((analysis) => { const selected = workspace.compare.includes(analysis.property.bagVboId); return <article className="comparison-card" key={analysis.property.bagVboId}><div className="comparison-card-top"><div><h2>{analysis.property.street} {analysis.property.houseNumber}</h2><span>{analysis.property.postcode} {analysis.property.city}</span></div><button className="icon-button" type="button" aria-label="Verwijder uit vergelijking" onClick={async () => { await toggleCompare(analysis.property.bagVboId); }}><X size={15} /></button></div><div className="comparison-scores"><div><small>Reality score</small><strong>{analysis.overallScore.toLocaleString("nl-NL", { minimumFractionDigits: 1 })}</strong></div><div><small>Jouw fit</small><strong>{calculatePersonalFit(analysis, workspace.preferences)?.toLocaleString("nl-NL", { minimumFractionDigits: 1 }) ?? "—"}</strong></div></div><div className="comparison-card-footer"><span><Heart size={13} /> in database bewaard</span>{selected && <span className="selected-label">geselecteerd</span>}</div></article>; })}</section><section className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th>Domein</th>{analyses.map((analysis) => <th key={analysis.property.bagVboId}>{analysis.property.street} {analysis.property.houseNumber}</th>)}</tr></thead><tbody>{domains.map((domain) => <tr key={domain.key}><th>{domain.label}</th>{analyses.map((analysis) => { const value = analysis.domains.find((candidate) => candidate.key === domain.key)?.score; const best = value != null && analyses.every((other) => (other.domains.find((candidate) => candidate.key === domain.key)?.score ?? -1) <= value); return <td className={best ? "best-value" : ""} key={analysis.property.bagVboId}>{value == null ? "Geen data" : `${value.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} / 10`}</td>; })}</tr>)}</tbody></table></section></div></main>;
}
