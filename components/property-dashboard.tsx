"use client";

import { ArrowLeft, Check, Clipboard, Clock3, Database, RefreshCw, Share2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PropertyMap } from "@/components/property-map";
import { SignalCard } from "@/components/signal-card";
import type { Analysis } from "@/src/lib/types";

export function PropertyDashboard({ bagId }: { bagId: string }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/analysis/${encodeURIComponent(bagId)}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as Analysis & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "De analyse kon niet worden geladen");
        setAnalysis(body);
      })
      .catch((caught) => { if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught instanceof Error ? caught.message : "Er ging iets mis"); });
    return () => controller.abort();
  }, [bagId]);

  async function share() {
    const url = window.location.href;
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* Clipboard may be unavailable in private contexts. */ }
  }

  if (error) return <main className="site-shell"><div className="container"><div className="loading-shell"><Link className="back-link" href="/"><ArrowLeft size={14} /> Terug naar zoeken</Link><h1>Dit adres lukt nu niet.</h1><p className="hero-copy">{error}</p><Link className="secondary-button" href="/">Nieuw adres zoeken</Link></div></div></main>;
  if (!analysis) return <LoadingDashboard />;

  const { property } = analysis;
  const generated = new Date(analysis.generatedAt).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  return <main className="site-shell"><div className="container"><header className="dashboard-header"><Link className="back-link" href="/"><ArrowLeft size={14} /> Nieuw adres</Link><div className="dashboard-top"><div><div className="eyebrow"><span className="eyebrow-dot" /> jouw reality check</div><h1>{property.street} {property.houseNumber}{property.houseLetter ?? ""}</h1><div className="address-meta"><Database size={16} /> {property.postcode} {property.city} <span>·</span> BAG {property.bagVboId}</div></div><div className="dashboard-actions"><button className="secondary-button" type="button" onClick={share}>{copied ? <Check size={14} /> : <Share2 size={14} />}{copied ? "Link gekopieerd" : "Deel analyse"}</button><Link className="secondary-button" href={`https://www.openstreetmap.org/?mlat=${property.coordinates.lat}&mlon=${property.coordinates.lng}`} target="_blank"><Clipboard size={14} /> Bekijk kaart</Link></div></div></header>
  <section className="dashboard-grid"><div className="score-card"><div className="score-card-label">Reality score</div><div className="score-big">{analysis.overallScore.toLocaleString("nl-NL", { minimumFractionDigits: 1 })}<small>/ 10</small></div><p className="score-tagline">Een transparante startscore op basis van lokale open data. Elk onderdeel heeft een eigen uitleg.</p><div className="score-footer"><span><Clock3 size={12} style={{ verticalAlign: "-2px" }} /> gecheckt om<strong>{generated}</strong></span><span>versie<strong>{analysis.scoringVersion}</strong></span></div></div><PropertyMap property={property} /></section>
  <div className="signals-heading"><h2>De signalen</h2><span>{analysis.signals.length} onderdelen · {analysis.sources.length} bronnen</span></div><section className="signals-grid">{analysis.signals.map((signal) => <SignalCard key={signal.key} signal={signal} />)}</section>
  <div className="source-note"><span><strong>Transparantie:</strong> de score is een versieerbare rekensom, geen verborgen oordeel.</span><span><RefreshCw size={12} style={{ verticalAlign: "-2px" }} /> {analysis.analysisVersion}</span></div>
  <p className="dashboard-disclaimer">WoonReality is een screening- en beslisondersteunend product. Model- en open-data-indicaties vervangen geen bouwkundige keuring, akoestisch onderzoek, funderingsonderzoek, bodemonderzoek, juridisch advies of formele vergunningscheck.</p>
  </div></main>;
}

function LoadingDashboard() { return <main className="site-shell"><div className="container loading-shell"><Link className="back-link" href="/"><ArrowLeft size={14} /> Terug naar zoeken</Link><div className="loading-block" /><div className="loading-block big" /><div className="loading-grid"><div className="loading-panel" /><div className="loading-panel" /></div></div></main>; }
