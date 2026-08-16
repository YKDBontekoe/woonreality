"use client";

import { ArrowLeft, GitCompare, Heart, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { usePropertyWorkspace } from "@/components/use-property-workspace";
import { calculatePersonalFit } from "@/src/lib/personalization";
import type { Analysis } from "@/src/lib/types";

type ComparisonListing = { askingPrice: number | null };

export function ComparisonDashboard({ bagIds }: { bagIds: string[] }) {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [listings, setListings] = useState<Record<string, ComparisonListing>>({});
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
        // Vraagprijzen zijn optioneel (login vereist voor bewaarde advertentiegegevens);
        // ontbrekende data mag de vergelijking zelf niet blokkeren.
        const listingEntries = await Promise.all(available.map(async (analysis) => {
          const id = analysis.property.bagVboId;
          try {
            const response = await fetch(`/api/listing/user/${encodeURIComponent(id)}`, { signal: controller.signal, cache: "no-store" });
            if (!response.ok) return [id, { askingPrice: null }] as const;
            const body = await response.json() as { listing?: { asking_price: number | null } | null };
            return [id, { askingPrice: body.listing?.asking_price ?? null }] as const;
          } catch {
            return [id, { askingPrice: null }] as const;
          }
        }));
        if (active) setListings(Object.fromEntries(listingEntries));
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
  const formatEuro = (value: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
  const askingPriceFor = (analysis: Analysis) => listings[analysis.property.bagVboId]?.askingPrice ?? null;
  const pricePerM2For = (analysis: Analysis) => {
    const price = askingPriceFor(analysis);
    const area = analysis.property.areaM2;
    return price != null && area ? Math.round(price / area) : null;
  };
  const signalFor = (analysis: Analysis, key: string) => analysis.signals?.find((item) => item.key === key);
  const factRows: { key: string; label: string; render: (analysis: Analysis) => string; best?: (analysis: Analysis) => boolean }[] = [
    {
      key: "asking-price",
      label: "Vraagprijs",
      render: (analysis) => { const value = askingPriceFor(analysis); return value != null ? formatEuro(value) : "Onbekend"; },
      best: (analysis) => { const value = askingPriceFor(analysis); return value != null && analyses.every((other) => { const otherValue = askingPriceFor(other); return otherValue == null || otherValue >= value; }); },
    },
    {
      key: "price-per-m2",
      label: "Prijs per m²",
      render: (analysis) => { const value = pricePerM2For(analysis); return value != null ? `${formatEuro(value)} / m²` : "Onbekend"; },
      best: (analysis) => { const value = pricePerM2For(analysis); return value != null && analyses.every((other) => { const otherValue = pricePerM2For(other); return otherValue == null || otherValue >= value; }); },
    },
    { key: "area", label: "Woonoppervlak", render: (analysis) => analysis.property.areaM2 ? `${analysis.property.areaM2} m²` : "Onbekend" },
    { key: "building-year", label: "Bouwjaar", render: (analysis) => analysis.property.buildingYear ? String(analysis.property.buildingYear) : "Onbekend" },
    { key: "energy", label: "Energielabel", render: (analysis) => String(signalFor(analysis, "energy")?.value ?? "Geen data") },
    {
      key: "vve",
      label: "Appartement / VvE-signaal",
      render: (analysis) => signalFor(analysis, "vve")?.severity === "attention" ? "Waarschijnlijk (controleer VvE)" : "Onwaarschijnlijk",
    },
  ];
  return <main className="site-shell"><div className="container comparison-page"><SiteHeader /><Link className="back-link" href="/mijn-aankoop"><ArrowLeft size={14} /> Terug naar mijn aankoop</Link><div className="eyebrow"><GitCompare size={13} /> vergelijking</div><h1>Welke plek past het best?</h1><p className="hero-copy">De vaste Reality Score blijft vergelijkbaar; jouw persoonlijke fit gebruikt je opgeslagen voorkeuren.</p>{loadError && <p className="compare-alert" role="alert">{loadError}</p>}<section className="comparison-cards">{analyses.map((analysis) => { const selected = workspace.compare.includes(analysis.property.bagVboId); return <article className="comparison-card" key={analysis.property.bagVboId}><div className="comparison-card-top"><div><h2>{analysis.property.street} {analysis.property.houseNumber}</h2><span>{analysis.property.postcode} {analysis.property.city}</span></div><button className="icon-button" type="button" aria-label="Verwijder uit vergelijking" onClick={async () => { await toggleCompare(analysis.property.bagVboId); }}><X size={15} /></button></div><div className="comparison-scores"><div><small>Reality score</small><strong>{analysis.overallScore.toLocaleString("nl-NL", { minimumFractionDigits: 1 })}</strong></div><div><small>Jouw fit</small><strong>{calculatePersonalFit(analysis, workspace.preferences)?.toLocaleString("nl-NL", { minimumFractionDigits: 1 }) ?? "—"}</strong></div></div><div className="comparison-card-footer"><span><Heart size={13} /> in database bewaard</span>{selected && <span className="selected-label">geselecteerd</span>}</div></article>; })}</section><section className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th>Kenmerk</th>{analyses.map((analysis) => <th key={analysis.property.bagVboId}>{analysis.property.street} {analysis.property.houseNumber}</th>)}</tr></thead><tbody>{factRows.map((row) => <tr key={row.key}><th>{row.label}</th>{analyses.map((analysis) => <td className={row.best?.(analysis) ? "best-value" : ""} key={analysis.property.bagVboId}>{row.render(analysis)}</td>)}</tr>)}{domains.map((domain) => <tr key={domain.key}><th>{domain.label}</th>{analyses.map((analysis) => { const value = analysis.domains.find((candidate) => candidate.key === domain.key)?.score; const best = value != null && analyses.every((other) => (other.domains.find((candidate) => candidate.key === domain.key)?.score ?? -1) <= value); return <td className={best ? "best-value" : ""} key={analysis.property.bagVboId}>{value == null ? "Geen data" : `${value.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} / 10`}</td>; })}</tr>)}</tbody></table><p className="muted-copy">Vraagprijs komt van je eigen bewaarde advertentiegegevens (inloggen vereist); zonder login of listing tonen we &quot;Onbekend&quot;.</p></section></div></main>;
}
