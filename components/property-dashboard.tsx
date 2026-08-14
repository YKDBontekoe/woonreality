"use client";

import { ArrowLeft, Check, Clipboard, Clock3, Database, GitCompare, Heart, Printer, RefreshCw, Settings2, Share2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PropertyMap } from "@/components/property-map";
import { SignalCard } from "@/components/signal-card";
import { usePropertyWorkspace } from "@/components/use-property-workspace";
import { calculatePersonalFit, DEFAULT_PREFERENCES, preferenceLabel } from "@/src/lib/personalization";
import { checklistForAnalysis } from "@/src/lib/checklist";
import type { Analysis, ChecklistItem, PersonalPreferences } from "@/src/lib/types";

const preferenceKeys = Object.keys(DEFAULT_PREFERENCES) as (keyof PersonalPreferences)[];

export function PropertyDashboard({ bagId }: { bagId: string }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const { workspace, toggleSaved, toggleCompare, setPreferences } = usePropertyWorkspace();
  const [preferences, setLocalPreferences] = useState<PersonalPreferences>(DEFAULT_PREFERENCES);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);

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

  useEffect(() => {
    setLocalPreferences(workspace.preferences);
  }, [workspace.preferences]);

  useEffect(() => {
    if (!analysis || typeof window === "undefined") return;
    try {
      const stored = JSON.parse(window.localStorage.getItem(`woonreality:checklist:${bagId}`) ?? "null") as ChecklistItem[] | null;
      setChecklist(Array.isArray(stored) ? stored : checklistForAnalysis(analysis));
    } catch { setChecklist(checklistForAnalysis(analysis)); }
  }, [analysis, bagId]);

  function saveChecklist(next: ChecklistItem[]) {
    setChecklist(next);
    window.localStorage.setItem(`woonreality:checklist:${bagId}`, JSON.stringify(next));
  }

  async function share() {
    const url = window.location.href;
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* Clipboard may be unavailable in private contexts. */ }
  }

  if (error) return <main className="site-shell"><div className="container"><div className="loading-shell"><Link className="back-link" href="/"><ArrowLeft size={14} /> Terug naar zoeken</Link><h1>Dit adres lukt nu niet.</h1><p className="hero-copy">{error}</p><Link className="secondary-button" href="/">Nieuw adres zoeken</Link></div></div></main>;
  if (!analysis) return <LoadingDashboard />;

  const { property } = analysis;
  const generated = new Date(analysis.generatedAt).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
  const isSaved = workspace.saved.some((item) => item.bagVboId === property.bagVboId);
  const inCompare = workspace.compare.includes(property.bagVboId);
  const personalFit = calculatePersonalFit(analysis, preferences);
  const highlights = analysis.highlights ?? [];
  const attention = highlights.filter((item) => item.type === "attention").slice(0, 3);
  const positives = highlights.filter((item) => item.type === "positive").slice(0, 3);
  const nearbyProperties = analysis.nearbyProperties ?? [];

  return <main className="site-shell"><div className="container">
    <header className="dashboard-header"><Link className="back-link" href="/"><ArrowLeft size={14} /> Nieuw adres</Link><div className="dashboard-top"><div><div className="eyebrow"><span className="eyebrow-dot" /> jouw reality check</div><h1>{property.street} {property.houseNumber}{property.houseLetter ?? ""}</h1><div className="address-meta"><Database size={16} /> {property.postcode} {property.city} <span>·</span> BAG {property.bagVboId}</div></div><div className="dashboard-actions"><button className={`secondary-button ${isSaved ? "selected" : ""}`} type="button" onClick={() => toggleSaved(property)}>{isSaved ? <Heart size={14} fill="currentColor" /> : <Heart size={14} />}{isSaved ? "Opgeslagen" : "Bewaar"}</button><button className={`secondary-button ${inCompare ? "selected" : ""}`} type="button" onClick={() => toggleCompare(property.bagVboId)}><GitCompare size={14} />{inCompare ? "In vergelijking" : "Vergelijk"}</button><button className="secondary-button" type="button" onClick={() => window.print()}><Printer size={14} /> Rapport</button><button className="secondary-button" type="button" onClick={share}>{copied ? <Check size={14} /> : <Share2 size={14} />}{copied ? "Link gekopieerd" : "Deel"}</button><Link className="secondary-button" href={`https://www.openstreetmap.org/?mlat=${property.coordinates.lat}&mlon=${property.coordinates.lng}`} target="_blank"><Clipboard size={14} /> Kaart</Link></div></div></header>
    <nav className="dashboard-tabs" aria-label="Analyseonderdelen"><a href="#overzicht">Overzicht</a><a href="#kaart">Kaart</a><a href="#omgeving">Omgeving</a><a href="#signalen">Signalen</a><a href="#checklist">Checklist</a><a href="#bronnen">Bronnen</a></nav>
    {workspace.compare.length >= 2 && <div className="compare-banner"><span><GitCompare size={15} /> {workspace.compare.length} woningen geselecteerd om te vergelijken</span><Link className="primary-button" href={`/vergelijken?ids=${workspace.compare.join(",")}`}>Open vergelijking</Link></div>}
    <section className="dashboard-grid" id="overzicht"><div className="score-card"><div className="score-card-label">Reality score</div><div className="score-big">{analysis.overallScore.toLocaleString("nl-NL", { minimumFractionDigits: 1 })}<small>/ 10</small></div><p className="score-tagline">Vaste score voor eerlijke vergelijking tussen woningen.</p><div className="fit-score"><span>Jouw persoonlijke fit</span><strong>{personalFit == null ? "—" : `${personalFit.toLocaleString("nl-NL", { minimumFractionDigits: 1 })} / 10`}</strong></div><div className="score-footer"><span><Clock3 size={12} style={{ verticalAlign: "-2px" }} /> gecheckt om<strong>{generated}</strong></span><span>dekking<strong>{analysis.dataCoverage.label}</strong></span></div></div><div id="kaart"><PropertyMap property={property} /></div></section>
    <section className="insight-grid"><InsightList title="Hier extra op letten" type="attention" items={attention} analysis={analysis} /><InsightList title="Sterke punten" type="positive" items={positives} analysis={analysis} /></section>
    <section className="nearby-section" id="omgeving"><div className="section-inline-heading"><div><div className="eyebrow"><Database size={13} /> officiële BAG-data</div><h2>Woningen in de directe omgeving</h2><p>Een selectie van maximaal 12 geregistreerde woonobjecten binnen 150 meter. Oppervlakte is BAG-gebruiksoppervlakte, geen advertentiemaat.</p></div><span className="coverage-pill">{nearbyProperties.length} adressen</span></div>{nearbyProperties.length ? <div className="nearby-grid">{nearbyProperties.map((nearby) => <Link className="nearby-card" href={`/woning/${nearby.bagVboId}`} key={nearby.bagVboId}><strong>{nearby.addressLabel.split(",")[0]}</strong><span>{nearby.areaM2 ? `${nearby.areaM2} m²` : "oppervlakte onbekend"} · {nearby.distanceM} m</span></Link>)}</div> : <p>Voor deze locatie zijn nu geen omliggende woonadressen gevonden.</p>}</section>
    <section className="preference-panel"><div><div className="eyebrow"><Settings2 size={13} /> persoonlijke fit</div><p>{workspace.preferencesConfigured ? "Pas aan wat voor jou het zwaarst weegt." : "Stel je voorkeuren in voor een score die bij jouw woonwensen past."}</p></div><button className="secondary-button" type="button" onClick={() => setShowPreferences((value) => !value)}>{showPreferences ? "Sluiten" : "Voorkeuren instellen"}</button>{showPreferences && <div className="preference-controls">{preferenceKeys.map((key) => <label key={key}><span>{preferenceLabel(key)}</span><input type="range" min="1" max="5" value={preferences[key]} onChange={(event) => setLocalPreferences({ ...preferences, [key]: Number(event.target.value) })} /><output>{preferences[key]}</output></label>)}<button className="primary-button" type="button" onClick={() => { setPreferences(preferences); setShowPreferences(false); }}>Bewaar voorkeuren</button></div>}</section>
    <div className="signals-heading" id="signalen"><h2>De signalen</h2><span>{analysis.signals.length} onderdelen · {analysis.sources.length} bronnen</span></div><section className="signals-grid">{analysis.signals.map((signal) => <SignalCard key={signal.key} signal={signal} />)}</section>
    <section className="checklist-section" id="checklist"><div className="section-inline-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> klaar voor de bezichtiging</div><h2>Jouw checklist</h2><p>Concrete vragen uit deze analyse, lokaal bewaard op dit apparaat.</p></div><button className="secondary-button" type="button" onClick={() => window.print()}><Printer size={14} /> Print / bewaar als PDF</button></div><div className="checklist-list">{checklist.map((item) => <label className={`checklist-item ${item.checked ? "checked" : ""}`} key={item.id}><input type="checkbox" checked={item.checked} onChange={(event) => saveChecklist(checklist.map((candidate) => candidate.id === item.id ? { ...candidate, checked: event.target.checked } : candidate))} /><span><strong>{item.label}</strong>{item.reason && <small>{item.reason}</small>}<input className="checklist-note" value={item.note ?? ""} placeholder="Eigen notitie (privé)" onChange={(event) => saveChecklist(checklist.map((candidate) => candidate.id === item.id ? { ...candidate, note: event.target.value } : candidate))} onClick={(event) => event.preventDefault()} /></span></label>)}<button className="add-checklist" type="button" onClick={() => saveChecklist([...checklist, { id: `custom-${Date.now()}`, label: "Eigen punt", checked: false }])}>+ Eigen punt toevoegen</button></div></section>
    <section className="sources-section" id="bronnen"><div className="section-inline-heading"><div><h2>Bronnen en datadekking</h2><p>Elke conclusie blijft terug te vinden naar de gebruikte bron.</p></div><span className="coverage-pill"><Check size={12} /> {analysis.dataCoverage.label}</span></div><div className="source-status-list">{analysis.sourceStatuses.map((source) => <div key={source.source}><span className={`status-dot ${source.status}`} /><strong>{source.source}</strong><span>{source.status === "ok" ? "beschikbaar" : source.message ?? "niet beschikbaar"}</span></div>)}</div></section>
    <div className="source-note"><span><strong>Transparantie:</strong> de score is een versieerbare rekensom, geen verborgen oordeel.</span><span><RefreshCw size={12} style={{ verticalAlign: "-2px" }} /> {analysis.analysisVersion}</span></div>
    <p className="dashboard-disclaimer">WoonReality is een screening- en beslisondersteunend product. Model- en open-data-indicaties vervangen geen bouwkundige keuring, akoestisch onderzoek, funderingsonderzoek, bodemonderzoek, juridisch advies of formele vergunningscheck.</p>
  </div></main>;
}

function InsightList({ title, type, items, analysis }: { title: string; type: "positive" | "attention"; items: Analysis["highlights"]; analysis: Analysis }) {
  return <div className={`insight-card ${type}`}><h2>{title}</h2>{items.map((item) => { const signal = analysis.signals.find((candidate) => candidate.key === item.signalKey); return <div className="insight-item" key={`${type}-${item.signalKey}`}><span className="signal-dot" /><span><strong>{signal?.label}</strong><small>{item.text}</small></span></div>; })}</div>;
}

function LoadingDashboard() { return <main className="site-shell"><div className="container loading-shell"><Link className="back-link" href="/"><ArrowLeft size={14} /> Terug naar zoeken</Link><div className="loading-block" /><div className="loading-block big" /><div className="loading-grid"><div className="loading-panel" /><div className="loading-panel" /></div></div></main>; }
