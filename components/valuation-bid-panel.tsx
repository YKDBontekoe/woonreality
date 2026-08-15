"use client";

import { AlertTriangle, Check, Calculator, LockKeyhole, Scale, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePropertyWorkspace } from "@/components/use-property-workspace";
import { estimateBidRange, formatEuro } from "@/src/lib/purchase";
import type { Analysis, PropertyListing } from "@/src/lib/types";

export function ValuationBidPanel({ bagId, analysis, listing }: { bagId: string; analysis: Analysis; listing: PropertyListing | null }) {
  const { workspace } = usePropertyWorkspace();
  const [askingPrice, setAskingPrice] = useState(listing?.askingPrice ?? 0);
  const [selected, setSelected] = useState<"cautious" | "balanced" | "strong">("balanced");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    fetch(`/api/property/${encodeURIComponent(bagId)}/bid-draft`, { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) return;
        const body = await response.json() as { draft?: { asking_price: number | null; selected_scenario: "cautious" | "balanced" | "strong" }; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Bodconcept kon niet worden geladen.");
        if (body.draft?.asking_price != null) setAskingPrice(body.draft.asking_price);
        if (body.draft?.selected_scenario) setSelected(body.draft.selected_scenario);
      })
      .catch((error) => setSaveError(error instanceof Error ? error.message : "Bodconcept kon niet worden geladen."));
  }, [bagId]);

  const range = useMemo(() => estimateBidRange(askingPrice), [askingPrice]);
  const marketLow = askingPrice ? Math.round((askingPrice * .985) / 500) * 500 : 0;
  const marketHigh = askingPrice ? Math.round((askingPrice * 1.015) / 500) * 500 : 0;
  const bid = range?.[selected] ?? 0;
  const overMaximum = workspace.buyerProfileConfigured && workspace.buyerProfile.budget > 0 && bid > workspace.buyerProfile.budget;

  async function saveDraft() {
    try {
      const response = await fetch(`/api/property/${encodeURIComponent(bagId)}/bid-draft`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ askingPrice, selected }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Bodconcept kon niet worden opgeslagen.");
      setSaveError(""); setSaved(true); window.setTimeout(() => setSaved(false), 1800);
    } catch (error) { setSaveError(error instanceof Error ? error.message : "Bodconcept kon niet worden opgeslagen."); }
  }

  return <section className="valuation-section" id="waarde-bod"><div className="section-inline-heading"><div><div className="eyebrow"><Calculator size={13} /> stap 05 · waarde & bod</div><h2>Van marktwaarde naar jouw grens</h2><p>Een transparante rekenschets om je bod voor te bereiden. Dit is geen taxatie en geen kansvoorspelling.</p></div><span className="coverage-pill"><ShieldCheck size={12} /> controleerbaar</span></div><div className="valuation-grid"><div className="valuation-card"><div className="valuation-card-head"><span className="section-kicker">Indicatieve marktwaarde</span><Scale size={17} /></div><div className="valuation-range">{askingPrice ? `${formatEuro(marketLow)} – ${formatEuro(marketHigh)}` : "Vul de vraagprijs in"}</div><p>Gebaseerd op de ingevoerde vraagprijs met een beperkte bandbreedte. Officiële waardering of lokale referentiewoningen volgen in een volgende release.</p><div className="valuation-facts"><span>Reality score <strong>{analysis.overallScore.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} / 10</strong></span><span>Jouw profielmaximum <strong>{workspace.buyerProfileConfigured ? formatEuro(workspace.buyerProfile.budget) : "Stel je profiel in"}</strong></span></div></div><div className="bid-card"><div className="section-kicker">Bod voorbereiden</div><label className="price-input-label">Vraagprijs<input type="number" min="0" step="500" value={askingPrice || ""} onChange={(event) => setAskingPrice(Number(event.target.value) || 0)} placeholder="€ 525.000" /></label>{range ? <div className="bid-options">{(["cautious", "balanced", "strong"] as const).map((key) => <button type="button" className={selected === key ? "bid-option selected" : "bid-option"} key={key} onClick={() => setSelected(key)}><span>{key === "cautious" ? "Voorzichtig" : key === "balanced" ? "Gebalanceerd" : "Sterk"}</span><strong>{formatEuro(range[key])}</strong><small>{key === "cautious" ? "prijs beschermen" : key === "balanced" ? "beste balans" : "winkans verhogen"}</small></button>)}</div> : <p className="muted-copy">Voer de vraagprijs in om scenario&apos;s te zien.</p>}{range && <div className={`bid-result ${overMaximum ? "warning" : ""}`}><div><span>Geselecteerd bod</span><strong>{formatEuro(bid)}</strong></div>{overMaximum ? <p><AlertTriangle size={14} /> Dit ligt boven je ingestelde maximum van {formatEuro(workspace.buyerProfile.budget)}.</p> : <p><LockKeyhole size={14} /> Jouw absolute grens blijft leidend.</p>}</div>}<button className="secondary-button bid-save" type="button" onClick={() => { void saveDraft(); }}>{saved ? <Check size={14} /> : <LockKeyhole size={14} />}{saved ? "Concept opgeslagen" : "Bewaar bodconcept"}</button>{saveError && <small className="form-message" role="alert">{saveError} <a href="/login">Inloggen</a></small>}</div></div></section>;
}
